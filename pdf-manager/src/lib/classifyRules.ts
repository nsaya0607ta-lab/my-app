/**
 * 自動分類ルールの保存と編集。
 *
 * 保存先は IndexedDB の設定ストアに相乗りしたキー付きレコード
 * (`classify-rules` → ClassifyRule[])。メモと同じ理由で専用ストアは作らない
 * (DB バージョンを上げると更新前の Service Worker が VersionError で止まるため。
 *  詳細は db.ts の readKeyed を参照)。
 *
 * 持ち主 (userId) はメモと共通の owner.ts で判定する。別アカウントでログインした
 * 人には、前の人が作ったルールは一切見えない。
 */
import { mutateKeyed, readKeyed } from './db';
import { createId, nowIso } from './naming';
import { currentOwnerId, isOwnedBy } from './owner';
import {
  LOCAL_OWNER_ID,
  UNSORTED_ID,
  type ClassifyRule,
  type RuleCondition,
  type RuleField,
  type RuleMatchMode,
} from './types';

const RULES_KEY = 'classify-rules';

/** 1 人あたりのルール数の上限 (設定レコードが際限なく膨らまないようにする)。 */
export const MAX_RULES = 100;
/** 1 ルールあたりの条件数の上限。 */
export const MAX_CONDITIONS = 20;

/* ------------------------------------------------------------------ */
/* 正規化                                                              */
/* ------------------------------------------------------------------ */

const FIELDS: RuleField[] = [
  'nameContains',
  'nameStartsWith',
  'nameEndsWith',
  'contentContains',
  'origin',
  'sharedFrom',
  'fileType',
  'size',
  'pageCount',
  'createdAt',
  'addedAt',
  'tag',
];

function toNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function toText(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function normalizeCondition(value: unknown): RuleCondition | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<RuleCondition>;
  if (typeof raw.field !== 'string' || !FIELDS.includes(raw.field as RuleField)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createId('cond'),
    field: raw.field as RuleField,
    text: toText(raw.text),
    compare:
      raw.compare === 'atLeast' ||
      raw.compare === 'atMost' ||
      raw.compare === 'between' ||
      raw.compare === 'withinDays'
        ? raw.compare
        : undefined,
    min: toNumber(raw.min),
    max: toNumber(raw.max),
    from: toText(raw.from),
    to: toText(raw.to),
    days: toNumber(raw.days),
  };
}

/** 保存されている値が壊れていても落ちないように整える。 */
function normalizeRule(value: unknown): ClassifyRule | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ClassifyRule>;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const timestamp = typeof raw.createdAt === 'string' ? raw.createdAt : nowIso();
  const conditions = Array.isArray(raw.conditions)
    ? raw.conditions
        .map(normalizeCondition)
        .filter((entry): entry is RuleCondition => entry !== null)
        .slice(0, MAX_CONDITIONS)
    : [];
  return {
    id: raw.id,
    userId: typeof raw.userId === 'string' && raw.userId ? raw.userId : LOCAL_OWNER_ID,
    name: raw.name,
    match: raw.match === 'any' ? 'any' : 'all',
    conditions,
    destFolderId: typeof raw.destFolderId === 'string' && raw.destFolderId ? raw.destFolderId : UNSORTED_ID,
    autoMove: raw.autoMove !== false,
    confirmBeforeMove: Boolean(raw.confirmBeforeMove),
    enabled: raw.enabled !== false,
    priority: toNumber(raw.priority) ?? 999,
    createdAt: timestamp,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : timestamp,
  };
}

/** 優先順位 (小さいほど先) → 作成日時の順に並べる。 */
export function sortRules(rules: ClassifyRule[]): ClassifyRule[] {
  return [...rules].sort(
    (a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt),
  );
}

/** 並び順に合わせて priority を 1 から振り直す。 */
function renumber(rules: ClassifyRule[]): ClassifyRule[] {
  return sortRules(rules).map((rule, index) =>
    rule.priority === index + 1 ? rule : { ...rule, priority: index + 1 },
  );
}

/* ------------------------------------------------------------------ */
/* 読み書き                                                            */
/* ------------------------------------------------------------------ */

/** 現在の持ち主のルール (優先順位順)。 */
export async function listRules(): Promise<ClassifyRule[]> {
  const stored = await readKeyed<unknown[]>(RULES_KEY);
  if (!Array.isArray(stored)) return [];
  const mine = stored
    .map(normalizeRule)
    .filter((rule): rule is ClassifyRule => rule !== null && isOwnedBy(rule.userId));
  return sortRules(mine);
}

/**
 * 自分のルールを読み → 変更 → 書き戻す。
 * 他の持ち主のルールは触らずにそのまま残す。
 */
async function mutateRules(
  change: (mine: ClassifyRule[]) => ClassifyRule[],
): Promise<ClassifyRule[]> {
  let result: ClassifyRule[] = [];
  await mutateKeyed<unknown[]>(RULES_KEY, (current) => {
    const all = Array.isArray(current)
      ? current.map(normalizeRule).filter((rule): rule is ClassifyRule => rule !== null)
      : [];
    const others = all.filter((rule) => !isOwnedBy(rule.userId));
    result = renumber(change(sortRules(all.filter((rule) => isOwnedBy(rule.userId)))));
    const next = [...others, ...result];
    return next.length > 0 ? next : undefined;
  });
  return sortRules(result);
}

export type RuleInput = {
  id?: string;
  name: string;
  match: RuleMatchMode;
  conditions: RuleCondition[];
  destFolderId: string;
  autoMove: boolean;
  confirmBeforeMove: boolean;
  enabled: boolean;
};

/** ルールを保存する (新規作成 / 上書きの両対応)。 */
export async function saveRule(input: RuleInput): Promise<ClassifyRule> {
  const timestamp = nowIso();
  let saved: ClassifyRule | null = null;

  await mutateRules((mine) => {
    const existing = input.id ? mine.find((rule) => rule.id === input.id) : undefined;
    if (!existing && mine.length >= MAX_RULES) return mine;
    const rule: ClassifyRule = {
      id: existing?.id ?? input.id ?? createId('rule'),
      userId: existing?.userId ?? currentOwnerId(),
      name: input.name.trim() || '名称未設定のルール',
      match: input.match,
      conditions: input.conditions.slice(0, MAX_CONDITIONS),
      destFolderId: input.destFolderId,
      autoMove: input.autoMove,
      confirmBeforeMove: input.confirmBeforeMove,
      enabled: input.enabled,
      // 新規は末尾へ。renumber が 1 から振り直す。
      priority: existing?.priority ?? mine.length + 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    saved = rule;
    return existing
      ? mine.map((entry) => (entry.id === rule.id ? rule : entry))
      : [...mine, rule];
  });

  if (!saved) throw new Error(`ルールは ${MAX_RULES} 件までしか作成できません。`);
  return saved;
}

export async function deleteRule(ruleId: string): Promise<ClassifyRule[]> {
  return mutateRules((mine) => mine.filter((rule) => rule.id !== ruleId));
}

/** ルールを複製する (名前の末尾に「のコピー」を付け、元のすぐ後ろへ入れる)。 */
export async function duplicateRule(ruleId: string): Promise<ClassifyRule[]> {
  return mutateRules((mine) => {
    const source = mine.find((rule) => rule.id === ruleId);
    if (!source || mine.length >= MAX_RULES) return mine;
    const timestamp = nowIso();
    const copy: ClassifyRule = {
      ...source,
      id: createId('rule'),
      userId: currentOwnerId(),
      name: `${source.name} のコピー`,
      conditions: source.conditions.map((condition) => ({ ...condition, id: createId('cond') })),
      // 元のすぐ後ろに来るよう、間の値を入れておく (renumber で整数へ戻る)
      priority: source.priority + 0.5,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return [...mine, copy];
  });
}

export async function setRuleEnabled(ruleId: string, enabled: boolean): Promise<ClassifyRule[]> {
  return mutateRules((mine) =>
    mine.map((rule) => (rule.id === ruleId ? { ...rule, enabled, updatedAt: nowIso() } : rule)),
  );
}

/** 優先順位を 1 つ上げる / 下げる。 */
export async function moveRulePriority(
  ruleId: string,
  direction: 'up' | 'down',
): Promise<ClassifyRule[]> {
  return mutateRules((mine) => {
    const index = mine.findIndex((rule) => rule.id === ruleId);
    if (index < 0) return mine;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= mine.length) return mine;
    const next = [...mine];
    [next[index], next[target]] = [next[target], next[index]];
    // 入れ替えた順序をそのまま priority へ反映させる
    return next.map((rule, position) => ({ ...rule, priority: position + 1 }));
  });
}

/**
 * ログイン直後に、ログイン前のルールを本人のものとして引き継ぐ。
 * 引き継ぎ後は、別アカウントでログインした人からは見えなくなる。
 */
export async function claimLocalRules(uid: string): Promise<void> {
  if (!uid || uid === LOCAL_OWNER_ID) return;
  await mutateKeyed<unknown[]>(RULES_KEY, (current) => {
    if (!Array.isArray(current)) return current;
    return current.map((entry) => {
      const rule = normalizeRule(entry);
      if (!rule || rule.userId !== LOCAL_OWNER_ID) return entry;
      return { ...rule, userId: uid };
    });
  });
}
