'use client';

import { ArrowLeft, Clock3, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  deletePdfGenerationRule,
  saveGeminiPreferences,
  savePdfGenerationRule,
  subscribePdfGenerationRules,
} from '@/lib/geminiCloud';
import {
  GEMINI_TIME_ZONE,
  type GeminiPreferences,
  type PdfDuplicateMode,
  type PdfGenerationRule,
} from '@/lib/geminiTypes';
import { ROOT_ID, type Folder } from '@/lib/types';
import { pathString } from '@/lib/tree';
import { Button, IconButton, Switch } from '@/components/ui/Primitives';

function fieldClass() {
  return 'min-h-tap w-full rounded-xl border divider bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-brand-400 dark:bg-[#181e26] dark:text-[#e6eaef]';
}

function defaultRule(): Omit<PdfGenerationRule, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '毎日の学習まとめ',
    enabled: true,
    time: '23:00',
    timeZone: GEMINI_TIME_ZONE,
    chatTarget: 'sameDay',
    folderId: ROOT_ID,
    folderPath: 'PDFフォルダー',
    fileNameTemplate: '学習_yyyymmdd.pdf',
    titleTemplate: '学習まとめ yyyy-mm-dd',
    purpose: '復習・試験対策',
    instructions: '質問、勘違い、詰まった点を必ず整理し、Linuxではコマンド例を付ける。',
    keepChat: true,
    notifyOnSuccess: true,
    duplicateMode: 'replaceSameDate',
  };
}

function RuleEditor({
  rule,
  folders,
  onCancel,
  onSaved,
}: {
  rule: (Omit<PdfGenerationRule, 'createdAt' | 'updatedAt'> & { id?: string }) | null;
  folders: Folder[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(rule ?? defaultRule());
  const [saving, setSaving] = useState(false);
  const activeFolders = useMemo(
    () => folders.filter((folder) => !folder.deletedAt).sort((a, b) => pathString(folders, a.id).localeCompare(pathString(folders, b.id), 'ja')),
    [folders],
  );

  const save = async () => {
    setSaving(true);
    try {
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-app dark:bg-[#11161c]">
      <div className="mx-auto min-h-full max-w-3xl pb-10">
        <div className="sticky top-0 z-10 flex min-h-[58px] items-center gap-2 border-b divider bg-surface/95 px-3 backdrop-blur dark:bg-[#181e26]/95">
          <IconButton label="戻る" onClick={onCancel}>
            <ArrowLeft size={22} />
          </IconButton>
          <h2 className="flex-1 text-lg font-semibold">自動PDFルール</h2>
          <Button
            onClick={() => void savePdfGenerationRule((window as unknown as { __geminiUid?: string }).__geminiUid || '', draft as never).then(onSaved)}
            disabled={saving || !draft.name.trim() || !draft.time || !draft.fileNameTemplate.trim()}
          >
            <Save size={18} /> 保存
          </Button>
        </div>

        <div className="space-y-5 px-4 py-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">ルール名</span>
            <input className={fieldClass()} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>

          <div className="rounded-card bg-surface px-4 py-3 dark:bg-[#181e26]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">自動作成を有効にする</p>
                <p className="mt-0.5 text-xs text-ink-sub">GitHub Actionsが10分間隔で作成時刻を確認します。</p>
              </div>
              <Switch checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} label="自動作成" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">作成時刻</span>
              <input type="time" className={fieldClass()} value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">対象チャット</span>
              <select className={fieldClass()} value={draft.chatTarget} onChange={(event) => setDraft({ ...draft, chatTarget: event.target.value as 'sameDay' | 'previousDay' })}>
                <option value="sameDay">実行日当日のチャット</option>
                <option value="previousDay">前日のチャット</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">保存先フォルダー</span>
            <select
              className={fieldClass()}
              value={draft.folderId}
              onChange={(event) => {
                const folderId = event.target.value;
                setDraft({
                  ...draft,
                  folderId,
                  folderPath: folderId === ROOT_ID ? 'PDFフォルダー' : pathString(folders, folderId),
                });
              }}
            >
              <option value={ROOT_ID}>PDFフォルダー</option>
              {activeFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {pathString(folders, folder.id)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">ファイル名</span>
            <input className={fieldClass()} value={draft.fileNameTemplate} onChange={(event) => setDraft({ ...draft, fileNameTemplate: event.target.value })} placeholder="学習_yyyymmdd.pdf" />
            <p className="mt-1 text-xs text-ink-sub">yyyy / mm / dd / yyyymmdd / yyyy-mm-dd / weekday / chat_title / rule_name が使えます。</p>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">PDFタイトル</span>
            <input className={fieldClass()} value={draft.titleTemplate} onChange={(event) => setDraft({ ...draft, titleTemplate: event.target.value })} />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">用途</span>
            <input className={fieldClass()} value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} placeholder="復習・試験対策" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">追加指示</span>
            <textarea className={`${fieldClass()} min-h-32 resize-y`} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">同名PDFの扱い</span>
            <select className={fieldClass()} value={draft.duplicateMode} onChange={(event) => setDraft({ ...draft, duplicateMode: event.target.value as PdfDuplicateMode })}>
              <option value="replaceSameDate">同じ日付のPDFを置き換える</option>
              <option value="overwrite">上書き</option>
              <option value="rename">末尾に連番を付ける</option>
              <option value="skip">作成をスキップ</option>
            </select>
          </label>

          <div className="rounded-card bg-surface dark:bg-[#181e26]">
            <div className="flex items-center justify-between gap-3 border-b divider px-4 py-3">
              <span>PDF作成後もチャットを5日間残す</span>
              <Switch checked={draft.keepChat} onChange={(keepChat) => setDraft({ ...draft, keepChat })} label="チャットを残す" />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span>アプリ起動時に成功を通知する</span>
              <Switch checked={draft.notifyOnSuccess} onChange={(notifyOnSuccess) => setDraft({ ...draft, notifyOnSuccess })} label="成功通知" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GeminiSettingsPanel({
  uid,
  folders,
  preferences,
  onPreferencesChange,
  onClose,
  notify,
}: {
  uid: string;
  folders: Folder[];
  preferences: GeminiPreferences;
  onPreferencesChange: (preferences: GeminiPreferences) => void;
  onClose: () => void;
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void;
}) {
  const [rules, setRules] = useState<PdfGenerationRule[]>([]);
  const [editing, setEditing] = useState<(Omit<PdfGenerationRule, 'createdAt' | 'updatedAt'> & { id?: string }) | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);

  useEffect(() => {
    (window as unknown as { __geminiUid?: string }).__geminiUid = uid;
    const unsubscribe = subscribePdfGenerationRules(uid, setRules, (error) => {
      console.error(error);
      notify('自動PDFルールを読み込めませんでした。', 'error');
    });
    return () => {
      unsubscribe();
      delete (window as unknown as { __geminiUid?: string }).__geminiUid;
    };
  }, [notify, uid]);

  const savePreferences = async () => {
    setSavingPreferences(true);
    try {
      await saveGeminiPreferences(uid, preferences);
      notify('Gemini設定を保存しました。', 'success');
    } catch {
      notify('Gemini設定を保存できませんでした。', 'error');
    } finally {
      setSavingPreferences(false);
    }
  };

  if (editing) {
    return (
      <RuleEditor
        rule={editing}
        folders={folders}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          notify('自動PDFルールを保存しました。', 'success');
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-app dark:bg-[#11161c]">
      <div className="mx-auto min-h-full max-w-3xl pb-10">
        <div className="sticky top-0 z-10 flex min-h-[58px] items-center gap-2 border-b divider bg-surface/95 px-3 backdrop-blur dark:bg-[#181e26]/95">
          <IconButton label="閉じる" onClick={onClose}>
            <X size={22} />
          </IconButton>
          <h2 className="flex-1 text-lg font-semibold">Gemini設定</h2>
          <Button onClick={() => void savePreferences()} disabled={savingPreferences}>
            <Save size={18} /> 保存
          </Button>
        </div>

        <div className="px-4 py-5">
          <h3 className="mb-2 text-sm font-semibold text-ink-sub">回答の基本設定</h3>
          <div className="rounded-card bg-surface dark:bg-[#181e26]">
            <label className="block border-b divider px-4 py-3">
              <span className="mb-1 block text-sm">用途</span>
              <select className={fieldClass()} value={preferences.purpose} onChange={(event) => onPreferencesChange({ ...preferences, purpose: event.target.value as GeminiPreferences['purpose'] })}>
                <option value="learning">学習用</option>
                <option value="work">業務用</option>
                <option value="general">一般</option>
              </select>
            </label>
            <label className="block border-b divider px-4 py-3">
              <span className="mb-1 block text-sm">回答の詳しさ</span>
              <select className={fieldClass()} value={preferences.detail} onChange={(event) => onPreferencesChange({ ...preferences, detail: event.target.value as GeminiPreferences['detail'] })}>
                <option value="concise">簡潔</option>
                <option value="standard">標準</option>
                <option value="detailed">詳しく</option>
              </select>
            </label>
            <label className="block border-b divider px-4 py-3">
              <span className="mb-1 block text-sm">回答方針</span>
              <textarea className={`${fieldClass()} min-h-28 resize-y`} value={preferences.responsePolicy} onChange={(event) => onPreferencesChange({ ...preferences, responsePolicy: event.target.value })} />
            </label>
            {[
              ['emphasizeImportant', '重要語句と結論を強調する'],
              ['includeCommandExamples', 'コマンド例を含める'],
              ['preferTables', '比較では表を積極的に使う'],
              ['beginnerFriendly', '初心者向けの説明を含める'],
              ['includeExamTips', '試験対策と覚え方を含める'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 border-b divider px-4 py-3 last:border-b-0">
                <span>{label}</span>
                <Switch
                  checked={Boolean(preferences[key as keyof GeminiPreferences])}
                  onChange={(value) => onPreferencesChange({ ...preferences, [key]: value })}
                  label={label}
                />
              </div>
            ))}
          </div>

          <div className="mb-2 mt-7 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-sub">自動PDF作成</h3>
              <p className="mt-0.5 text-xs text-ink-sub">ブラウザーを閉じていてもGitHub Actionsで生成します。</p>
            </div>
            <Button onClick={() => setEditing(defaultRule())}>
              <Plus size={18} /> ルール追加
            </Button>
          </div>

          <div className="space-y-3">
            {rules.length === 0 ? (
              <div className="rounded-card bg-surface px-4 py-8 text-center text-sm text-ink-sub dark:bg-[#181e26]">
                自動PDFルールはまだありません。
              </div>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="rounded-card bg-surface px-4 py-3 dark:bg-[#181e26]">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setEditing({ ...rule })}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{rule.name}</p>
                        <p className="mt-1 flex items-center gap-1 text-sm text-ink-sub">
                          <Clock3 size={15} /> {rule.time}・{rule.folderPath || '保存先未設定'}
                        </p>
                        <p className="mt-1 truncate text-xs text-ink-sub">{rule.fileNameTemplate}</p>
                        {rule.lastRunStatus ? (
                          <p className="mt-2 text-xs text-ink-sub">
                            最終実行：{rule.lastRunStatus === 'success' ? '成功' : rule.lastRunStatus === 'failed' ? '失敗' : rule.lastRunStatus}
                            {rule.lastRunAt ? `（${new Date(rule.lastRunAt).toLocaleString('ja-JP')}）` : ''}
                          </p>
                        ) : null}
                      </div>
                      <span className={rule.enabled ? 'rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-600 dark:bg-[#21343e]' : 'rounded-full bg-[#eef0f2] px-2 py-1 text-xs text-ink-sub dark:bg-[#252b32]'}>
                        {rule.enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </button>
                  <div className="mt-3 flex justify-end border-t divider pt-2">
                    <button
                      type="button"
                      className="flex min-h-tap items-center gap-1 rounded-lg px-3 text-sm text-pdf"
                      onClick={() => {
                        if (!window.confirm(`「${rule.name}」を削除しますか？`)) return;
                        void deletePdfGenerationRule(uid, rule.id).catch(() => notify('ルールを削除できませんでした。', 'error'));
                      }}
                    >
                      <Trash2 size={17} /> 削除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
