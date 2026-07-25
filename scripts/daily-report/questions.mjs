/**
 * 資格ごとの問題プールを Node から読み込む。
 *
 * js/data/certs.js は ../core.js を import しており、core.js は localStorage や
 * DOM に依存するため Node からは読めない。ここでは certs.js の構成をなぞりつつ、
 * import を持たない「データだけのモジュール」を直接読み込む。
 *
 * 資格の構成を変えたときは js/data/certs.js と合わせて更新すること。
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const DATA_DIR = path.resolve(import.meta.dirname, '../../js/data');

async function load(fileName) {
  return import(pathToFileURL(path.join(DATA_DIR, fileName)).href);
}

/**
 * 資格 ID → { code, name, questions } を返す。
 * questions は js/core.js の startReview() と同じ [...Q, ...ExtraQ] の並び。
 */
export async function loadCertPools() {
  const [az900, sc300, lpic1, lpic1Uuid, lpic1Fs, lpic1Cmd, lpic1Adv] = await Promise.all([
    load('az900.js'),
    load('sc300.js'),
    load('lpic1.js'),
    load('lpic1-uuid.js'),
    load('lpic1-filesystem.js'),
    load('lpic1-commands.js'),
    load('lpic1-advanced.js'),
  ]);

  return {
    az900: {
      code: 'AZ-900',
      name: 'Azure 基礎',
      questions: [...az900.AZ900_Q],
    },
    sc300: {
      code: 'SC-300',
      name: 'セキュリティ中級',
      questions: [...sc300.SC300_Q],
    },
    lpic1: {
      code: 'LPIC-1',
      name: 'Linux 技術者認定 レベル1',
      questions: [
        ...lpic1.LPIC1_Q,
        ...lpic1Uuid.LPIC1_UUID_Q,
        ...lpic1Fs.LPIC1_FILESYSTEM_Q,
        ...lpic1Cmd.LPIC1_CMD_Q,
        ...lpic1Adv.LPIC1_ADVANCED_Q,
      ],
      // コマンド比較表の元ネタ（LPIC-1 のみ）
      comparisons: lpic1Adv.LPIC_COMMAND_COMPARISONS ?? [],
    },
  };
}

/** 問題 ID → 問題オブジェクトの Map。ID 重複は先勝ちにする。 */
export function indexById(questions) {
  const map = new Map();
  for (const question of questions) {
    if (question && question.id !== undefined && !map.has(question.id)) {
      map.set(question.id, question);
    }
  }
  return map;
}

/** 選択肢の記号 (A/B/C…) 付きで正解の本文を組み立てる。 */
const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E'];

export function describeQuestion(question) {
  const options = Array.isArray(question.o) ? question.o : [];
  // a は単一正解のインデックス、c は複数正解のインデックス配列
  const answerIndexes = Array.isArray(question.c)
    ? question.c
    : question.a === undefined
      ? []
      : [question.a];

  return {
    id: question.id,
    importance: question.imp ?? 0,
    question: question.q ?? '',
    command: question.cmd ?? null,
    options: options.map((text, index) => `${CHOICE_LABELS[index] ?? index}. ${text}`),
    answers: answerIndexes
      .map((index) => options[index])
      .filter((text) => typeof text === 'string'),
    explanation: question.e ?? '',
  };
}
