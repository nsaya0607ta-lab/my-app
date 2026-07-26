/**
 * 自動分類の実行。
 *
 * 判定 (classify.ts) と保存 (repository.ts) をつなぐ層。
 * 「どこへ移動するかを決める」= plan と、「実際に移動する」= apply を分けている。
 * テスト実行は plan だけを使うので、PDF は 1 件も動かない。
 *
 * ルールはフォルダー単位で管理する。PDF の現在の親フォルダーと
 * rule.sourceFolderId が一致するルールだけを判定対象にする。
 */
import { findMatchingRules, needsText } from './classify';
import { sourceFolderIdOf } from './classifyRules';
import { extractText } from './pdf';
import * as repo from './repository';
import { toParentKey } from './tree';
import type { ClassifyRule, MultiMatchStrategy, PdfFileMeta } from './types';

/** 1 件分の分類予定。 */
export type ClassifyPlan = {
  file: PdfFileMeta;
  /** 一致したルール（同じ適用元フォルダー内・優先順位順）。 */
  matches: ClassifyRule[];
  /** 実際に適用するルール。 */
  rule: ClassifyRule;
  fromParentId: string;
  toParentId: string;
  /** すでに移動先フォルダーに入っている（移動不要）。 */
  alreadyThere: boolean;
  /** 移動前にユーザーの確認が必要か。 */
  needsConfirm: boolean;
};

/** 移動が済んだ記録（「元に戻す」で使う）。 */
export type ClassifyRecord = {
  fileId: string;
  fileName: string;
  ruleId: string;
  ruleName: string;
  fromParentId: string;
  toParentId: string;
};

export type ClassifyOptions = {
  rules: ClassifyRule[];
  strategy: MultiMatchStrategy;
  /** 本文条件で読む先頭ページ数。 */
  textPages: number;
};

/** この PDF が現在入っているフォルダーに設定されたルールだけを返す。 */
function scopedRulesFor(file: PdfFileMeta, rules: ClassifyRule[]): ClassifyRule[] {
  const parentId = toParentKey(file.parentId);
  return rules.filter((rule) => sourceFolderIdOf(rule) === parentId);
}

/**
 * PDF 本文を読む関数を用意する。
 *
 * 同じフォルダーの有効なルールに本文条件が無ければ読み込まない。
 * 端末内に本体が無い PDF は、通信を発生させず本文なしとして扱う。
 */
function textReaderFor(
  file: PdfFileMeta,
  rules: ClassifyRule[],
  textPages: number,
): (() => Promise<string>) | undefined {
  const wanted = rules.some((rule) => rule.enabled && needsText(rule));
  if (!wanted) return undefined;

  return async () => {
    const blob = await repo.readBlob(file.id);
    if (!blob) return '';
    return extractText(blob, textPages);
  };
}

/**
 * 1 件分の分類先を決める（移動はしない）。
 *
 * 重要:
 * - PDF がフォルダー1にある場合、フォルダー1のルールだけを評価する
 * - フォルダー2や他フォルダーのルールは一切評価しない
 * - 移動後の PDF に、移動元フォルダーのルールを再適用しない
 */
export async function planFile(
  file: PdfFileMeta,
  options: ClassifyOptions,
): Promise<ClassifyPlan | null> {
  const scopedRules = scopedRulesFor(file, options.rules);
  if (scopedRules.length === 0) return null;

  const matches = await findMatchingRules(
    scopedRules,
    { file, readText: textReaderFor(file, scopedRules, options.textPages) },
    options.strategy,
  );
  if (matches.length === 0) return null;

  const rule = matches[0];
  const fromParentId = toParentKey(file.parentId);
  return {
    file,
    matches,
    rule,
    fromParentId,
    toParentId: rule.destFolderId,
    alreadyThere: fromParentId === rule.destFolderId,
    // 「自動移動しない」ルールも確認扱いにして、勝手に動かさない
    needsConfirm:
      rule.confirmBeforeMove ||
      !rule.autoMove ||
      (options.strategy === 'ask' && matches.length > 1),
  };
}

export type PlanFailure = { fileId: string; fileName: string; reason: string };

export type PlanResult = {
  plans: ClassifyPlan[];
  /** 判定できなかった PDF（他の PDF の処理は止めない）。 */
  failures: PlanFailure[];
};

/**
 * 複数の PDF をまとめて判定する（既存PDFへの一括適用・テスト実行で使う）。
 * 各 PDF は、その PDF が入っているフォルダーのルールだけで判定する。
 */
export async function planFiles(
  files: PdfFileMeta[],
  options: ClassifyOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<PlanResult> {
  const plans: ClassifyPlan[] = [];
  const failures: PlanFailure[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    try {
      const plan = await planFile(file, options);
      if (plan && !plan.alreadyThere) plans.push(plan);
    } catch (error) {
      failures.push({
        fileId: file.id,
        fileName: file.name,
        reason: error instanceof Error ? error.message : '判定できませんでした',
      });
    }
    onProgress?.(index + 1, files.length);
    if (index % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { plans, failures };
}

/**
 * 分類を実行する（PDF を移動先フォルダーへ移す）。
 * @param rule 確認画面でユーザーが選び直したルール。省略時は plan のルール。
 */
export async function applyPlan(
  plan: ClassifyPlan,
  rule?: ClassifyRule,
): Promise<ClassifyRecord> {
  const applied = rule ?? plan.rule;
  const moved = await repo.moveFile(plan.file.id, applied.destFolderId, { ruleId: applied.id });
  return {
    fileId: plan.file.id,
    fileName: moved.name,
    ruleId: applied.id,
    ruleName: applied.name,
    fromParentId: plan.fromParentId,
    toParentId: applied.destFolderId,
  };
}

/** 分類先だけを差し替えて移動する（「別フォルダーへ移動」）。 */
export async function moveToFolder(
  record: ClassifyRecord,
  destFolderId: string,
): Promise<ClassifyRecord> {
  const moved = await repo.moveFile(record.fileId, destFolderId);
  return { ...record, fileName: moved.name, toParentId: destFolderId };
}

/** 分類による移動を取り消して元のフォルダーへ戻す。 */
export async function undoClassification(record: ClassifyRecord): Promise<void> {
  await repo.moveFile(record.fileId, record.fromParentId, { clearRule: true });
}

export type BulkResult = {
  moved: ClassifyRecord[];
  failures: PlanFailure[];
};

/**
 * 一括適用。1 件の失敗で全体を止めず、失敗した PDF を一覧で返す。
 */
export async function applyPlans(
  plans: ClassifyPlan[],
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult> {
  const moved: ClassifyRecord[] = [];
  const failures: PlanFailure[] = [];

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    try {
      moved.push(await applyPlan(plan));
    } catch (error) {
      failures.push({
        fileId: plan.file.id,
        fileName: plan.file.name,
        reason: error instanceof Error ? error.message : '移動できませんでした',
      });
    }
    onProgress?.(index + 1, plans.length);
    if (index % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { moved, failures };
}
