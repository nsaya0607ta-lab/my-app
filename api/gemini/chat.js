// Gemini APIキーはサーバー側の環境変数（Vercelのプロジェクト設定）でのみ保持し、
// フロントエンドには一切渡さない。クライアントはこのエンドポイントにメッセージを
// POSTするだけで、実際のGemini呼び出しはここで行う。
// 存在しないモデル名を指定するとGemini APIが404/400を返すため、公式に
// 提供が確認できている軽量・低レイテンシモデルを既定値にする。
// 環境変数で他モデルへの切り替えも可能。
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY_TURNS = 20;
const UPSTREAM_TIMEOUT_MS = 25000;
// リトライしすぎるとGemini無料枠のクォータ（分単位のリクエスト数上限）を
// かえって早く消費してしまうため、リトライは最大1回までに制限し、
// 再試行の間隔も必ず3秒以上空ける（ミリ秒単位の連続リトライは行わない）。
const UPSTREAM_MAX_ATTEMPTS = 2;
const UPSTREAM_RETRY_DELAY_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gemini APIへのリクエストは、一時的なネットワーク不調やGemini側の混雑
// （429/5xx）で失敗することがある。ここで短いタイムアウト＋最大1回のリトライを
// かけることで、瞬間的な遅延がそのままユーザーへの「送信に失敗しました」
// エラーに直結しないようにする。ストリーム開始前（レスポンスヘッダー受信前）
// の失敗だけを対象とし、ストリーミング開始後の切断はここでは扱わない。
async function fetchGeminiWithRetry(url, options) {
  let lastErr;
  for (let attempt = 0; attempt < UPSTREAM_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < UPSTREAM_MAX_ATTEMPTS - 1) {
        await sleep(UPSTREAM_RETRY_DELAY_MS);
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < UPSTREAM_MAX_ATTEMPTS - 1) {
        await sleep(UPSTREAM_RETRY_DELAY_MS);
        continue;
      }
    }
  }
  throw lastErr || new Error("gemini-request-failed");
}

// ユーザーが「予定を入れて」のように話しかけたとき、Geminiにこの関数を
// 呼び出させて日付・時刻・タイトルを構造化データとして抽出させる。実際の
// カレンダーへの書き込み・変更・削除はクライアント側（js/gemini.js経由で
// render.js内の既存のカレンダー登録処理）が行うため、ここでは抽出のみを担当する。
// register_scheduleについては、抽出結果をもとにクライアント側がまず
// チャット上の確認カード（プレビュー）を表示するだけで、実際の登録は
// ユーザーがカードで確定操作をするまで行われない
const SCHEDULE_FUNCTION_NAMES = new Set(["register_schedule", "update_schedule", "delete_schedule"]);

const SCHEDULE_TOOLS = [{
  functionDeclarations: [
    {
      name: "register_schedule",
      description: "ユーザーが日時と内容を指定して予定・スケジュールの登録を明確に依頼したときだけ呼び出す。単なる質問や相談の場合は呼び出さないこと。",
      parameters: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING", description: "予定の日付。YYYY-MM-DD形式（例:2026-07-09）。「明日」「来週火曜」「今週末」等の相対表現は、与えられた本日の日付・曜日を基準に絶対日付へ変換すること。繰り返し予定の場合は最初の1回目の日付を入れる。" },
          start_time: { type: "STRING", description: "開始時刻。HH:MM形式24時間表記（例:16:00）。relative_anchor_titleを指定する場合や、終日予定の場合は省略してよい。" },
          end_time: { type: "STRING", description: "終了時刻。HH:MM形式24時間表記（例:17:00）。指定が無い場合は省略。" },
          title: { type: "STRING", description: "予定のタイトル。以下の2点を厳守すること。(1)「〜の予定を入れて」等の依頼表現をそのまま入れず、文脈から本質的なイベント名だけを抽出する（例：「仕事」「会議」「デート」「美容院」）。(2)「役所に行く」「歯医者に行く」「資料を作成する」のような動詞・タスク表現は、そのまま入れず適切な名詞に変換する（例：「15時に役所に行く」→「役所」、「レポートを提出する」→「レポート提出」）。" },
          relative_anchor_title: { type: "STRING", description: "「〜のあと」「〜の前」のように、既存の別の予定を基準にした相対的な時間指定がされた場合の、基準となる予定のタイトル（例：「明日の仕事のあとに美容院」→「仕事」）。この場合、自分で時刻を推測せずstart_time/end_timeは省略し、この項目とrelative_positionだけを指定すること。実際の時刻はアプリ側が基準予定の実在時刻から自動計算する。" },
          relative_position: { type: "STRING", enum: ["after", "before"], description: "relative_anchor_titleで指定した予定に対して、新しい予定が「あと（直後）」なのか「前（直前）」なのかを指定する。省略時はafter扱い。" },
          recurrence: { type: "STRING", enum: ["none", "daily", "weekly", "monthly"], description: "繰り返し予定の種類。「毎日」→daily、「毎週〇曜日」→weekly、「毎月〇日」→monthly。単発の予定なら省略またはnone。" },
        },
        required: ["date", "title"],
      },
    },
    {
      name: "update_schedule",
      description: "登録済みの予定の日時やタイトルの変更をユーザーが依頼したときに呼び出す（例：「さっきの予定、10時からに後ろ倒しして」「タイトルを『ミーティング』に変えて」）。",
      parameters: {
        type: "OBJECT",
        properties: {
          target: { type: "STRING", description: "対象の指定方法。ユーザーが「さっきの」「今の」のように直前に登録した予定を指している場合は'last'を指定する。" },
          date: { type: "STRING", description: "変更対象を日付とタイトルで特定する場合の、元の予定の日付。YYYY-MM-DD形式。targetが'last'の場合は省略可。" },
          original_title: { type: "STRING", description: "変更対象を特定するための元のタイトル（分かる場合のみ）。" },
          new_date: { type: "STRING", description: "変更後の日付。YYYY-MM-DD形式。日付を変更しない場合は省略。" },
          new_start_time: { type: "STRING", description: "変更後の開始時刻。HH:MM形式24時間表記。変更しない場合は省略。" },
          new_end_time: { type: "STRING", description: "変更後の終了時刻。HH:MM形式24時間表記。変更しない場合は省略。" },
          new_title: { type: "STRING", description: "変更後のタイトル。変更しない場合は省略。" },
        },
        required: [],
      },
    },
    {
      name: "delete_schedule",
      description: "登録済みの予定の削除・取り消し・キャンセルをユーザーが依頼したときに呼び出す（例：「今のやつ消して」「予定を取り消して」「さっきのキャンセルして」）。",
      parameters: {
        type: "OBJECT",
        properties: {
          target: { type: "STRING", description: "ユーザーが「今の」「さっきの」のように直前に登録した予定を指している場合は'last'を指定する。" },
          date: { type: "STRING", description: "削除対象を日付とタイトルで特定する場合の日付。YYYY-MM-DD形式。targetが'last'の場合は省略可。" },
          title: { type: "STRING", description: "削除対象を特定するためのタイトル（分かる場合のみ）。" },
        },
        required: [],
      },
    },
  ],
}];

// 天気・降水量・今日の予定/タスクは、ユーザーが実際に見ている画面の数値と
// 食い違わないよう、クライアント（js/gemini.js）から送られてきた実データを
// そのまま文章化するだけに留める。ここで新たな数値を作り出したり、送られて
// きていない項目を推測で埋めたりしないこと
function weatherContextLines(weather){
  if(!weather || typeof weather.temp !== "number"){
    return ["【天気・降水量】現在地の天気情報は取得できていません。天気や降水量について聞かれた場合は、正直に「現在地の天気情報を取得できませんでした」と伝えてください。"];
  }
  const city = weather.city || "現在地";
  const label = weather.label || "";
  const pop = typeof weather.pop === "number" ? weather.pop : null;
  const precip = typeof weather.precip === "number" ? weather.precip : null;
  const lines = [
    `【天気】画面左上の天気カードが表示している実測データは次の通りです：${city}の天気は${label || "不明"}、気温${weather.temp}℃です。ユーザーが天気について尋ねたら「現在の天気は〇〇です」のようにこのデータをもとに答えてください。`,
  ];
  if(pop !== null || precip !== null){
    const parts = [];
    if(pop !== null) parts.push(`降水確率${pop}%`);
    if(precip !== null) parts.push(`降水量${precip}mm`);
    lines.push(`【降水量】${parts.join("、")}です。ユーザーが降水量や雨について尋ねた場合は、この数値をもとに雨の強さに応じた実用的なアドバイス（例：「折りたたみ傘があると安心です」「足元が滑りやすいので気をつけてください」）を添えてください。数値が低く雨の心配がなければ、無理に注意喚起せず傘は不要な旨を伝えて構いません。`);
  }
  return lines;
}

// 株価タブの保有株・ウォッチリストの実データを文章化する。天気・予定と同じく、
// クライアントから送られてきた実データだけをもとに答えさせ、送られていない
// 銘柄の価格を推測・創作させないための指示を添える
function stockContextLines(stocks){
  if(!stocks) return [];
  const holdings = Array.isArray(stocks.holdings) ? stocks.holdings : [];
  const watchlist = Array.isArray(stocks.watchlist) ? stocks.watchlist : [];
  if(!holdings.length && !watchlist.length) return [];

  const marketNote = stocks.marketOpen
    ? "現在は米国市場の取引時間中のため、直近の実勢価格です。"
    : "現在は米国市場の取引時間外のため、直近の終値（取引時間外の値）です。";
  const lines = [`【株価（画面「株価」タブの実データ）】ユーザーが株価や資産について尋ねた場合は、必ず以下の実データだけをもとに答えてください。送られていない銘柄の価格を勝手に推測・創作しないでください。${marketNote}`];

  if(holdings.length){
    const list = holdings.map(h => {
      const priceLabel = typeof h.price === "number" ? `現在値$${h.price.toFixed(2)}・評価額${Math.round(h.value).toLocaleString()}AC` : "現在値取得不可";
      return `${h.ticker}(${h.name})：${h.shares}株・${priceLabel}`;
    }).join("／");
    lines.push(`保有株：${list}`);
  } else {
    lines.push("保有株：まだありません。");
  }
  if(typeof stocks.cash === "number"){
    lines.push(`保有現金（AC）：${Math.round(stocks.cash).toLocaleString()}AC`);
  }
  if(watchlist.length){
    const list = watchlist.map(w => {
      const chg = typeof w.changePercent === "number" ? `（前日比${w.changePercent >= 0 ? "+" : ""}${w.changePercent.toFixed(2)}%）` : "";
      return `${w.ticker}(${w.name})：$${w.price.toFixed(2)}${chg}`;
    }).join("／");
    lines.push(`ウォッチリスト：${list}`);
  }
  lines.push("なお、これらはゲーム内通貨(AC)を使ったデモ取引・値動き確認用のデータであり、実際の証券口座の取引ではありません。");
  return lines;
}

// 株価タブの実データ（js/render.jsのbuildStockContextForGemini）を、型・件数・
// 長さを検証してから使う。天気・予定と同じく、クライアントからの任意入力なので
// 想定外の形のオブジェクトが来てもここで弾き、壊れた値のままGeminiへ渡さない
function buildStockAppContext(raw){
  if(!raw || typeof raw !== "object") return null;
  return {
    marketOpen: !!raw.marketOpen,
    cash: typeof raw.cash === "number" ? raw.cash : null,
    holdings: (Array.isArray(raw.holdings) ? raw.holdings : [])
      .slice(0, 20)
      .map(h => ({
        ticker: typeof (h && h.ticker) === "string" ? h.ticker.slice(0, 10) : "",
        name: typeof (h && h.name) === "string" ? h.name.slice(0, 40) : "",
        shares: typeof (h && h.shares) === "number" ? h.shares : 0,
        price: typeof (h && h.price) === "number" ? h.price : null,
        value: typeof (h && h.value) === "number" ? h.value : 0,
      }))
      .filter(h => h.ticker),
    watchlist: (Array.isArray(raw.watchlist) ? raw.watchlist : [])
      .slice(0, 20)
      .map(w => ({
        ticker: typeof (w && w.ticker) === "string" ? w.ticker.slice(0, 10) : "",
        name: typeof (w && w.name) === "string" ? w.name.slice(0, 40) : "",
        price: typeof (w && w.price) === "number" ? w.price : null,
        changePercent: typeof (w && w.changePercent) === "number" ? w.changePercent : null,
      }))
      .filter(w => w.ticker && typeof w.price === "number"),
  };
}

function scheduleTaskSummaryLines(todos, events){
  const hasTodos = Array.isArray(todos) && todos.length > 0;
  const hasEvents = Array.isArray(events) && events.length > 0;
  const lines = ["【今日の予定とタスク】画面中央には「今日の予定」と「本日のタスク」が表示されています。ユーザーが今日の予定やタスクについて尋ねた場合は、必ず以下の実データだけをもとに一覧で整理して答え、送られていない予定やタスクを勝手に作り出さないでください。"];
  if(hasEvents){
    const list = events.map(e => `${e.start ? `${e.start}${e.end ? `〜${e.end}` : ""} ` : ""}${e.title}`).join("／");
    lines.push(`本日の予定：${list}`);
  } else {
    lines.push("本日の予定：登録されていません。");
  }
  if(hasTodos){
    const list = todos.map(t => `${t.text}${t.done ? "（完了済み）" : ""}`).join("／");
    lines.push(`本日のタスク：${list}`);
  } else {
    lines.push("本日のタスク：登録されていません。");
  }
  if(hasEvents || hasTodos){
    lines.push("さらに、予定の時間帯の偏りやタスクの量を見て、タイパ（タイムパフォーマンス）を高めるための一言アドバイス（例：「午後に予定が集中しているので、午前中にタスクを1つ消化しておくと楽になりますよ！」）を添えてください。");
  } else {
    lines.push("予定もタスクも無い場合は「今日は予定もタスクも入っていません、自由に使える1日ですね！」のように前向きに伝えてください。");
  }
  return lines;
}

function buildSystemInstruction(today, appContext){
  const lines = [
    "あなたは、このIT資格対策アプリ（Microsoft Azure/SC-300、LPICなど）専用のAIアシスタント「Gemini」です。",
    "アプリのスタイリッシュな世界観に合わせて、長すぎずスッキリとした、絵文字や箇条書きを交えた見やすい文章で、ユーザーに寄り添うポジティブなトーンで答えてください。",
    "Azure・LPIC・ITインフラ全般や資格試験の学習に関する質問に、初学者にも分かりやすい日本語で簡潔に答えてください。",
    "雑談程度の話題には常識の範囲で軽く答えて構いませんが、医療・法律・金融など専門外の断定的なアドバイスは避けてください。",
    ...weatherContextLines(appContext && appContext.weather),
    ...scheduleTaskSummaryLines(appContext && appContext.todos, appContext && appContext.events),
    ...stockContextLines(appContext && appContext.stocks),
    "【アプリの機能ボタン】ホーム画面中央下には「J-NEWS」「F-NEWS」「株価」「カレンダー」「設定」のボタンが並んでいます。ユーザーがこれらのボタンについて尋ねたり「何ができる？」と聞いてきた場合は分かりやすく解説してください。J-NEWSは日本の最新ニュースを読める機能、F-NEWSは海外の最新ニュースを読める機能、株価は保有銘柄のデモ取引や株価確認ができる機能、カレンダーは月表示で予定を管理できる機能（ホーム中央の予定ウィジェットは1日表示の簡易版）、設定は背景スキンやタップ音を変更できる機能です。",
    "【資格勉強のご案内】ホーム画面いちばん下には「MS」「LPIC」のボタンがあり、資格対策の学習コンテンツに進めます。ユーザーがどの資格を勉強できるか尋ねた場合は、この一覧を教えてあげてください。MSボタンからはMicrosoft認定資格を選べます（AZ-900「Azure基礎」・SC-300「セキュリティ中級」は学習可能、SC-900「セキュリティ基礎」は近日公開）。LPICボタンからはLinux技術者認定を選べます（LPIC-1は学習可能、LPIC-2・LPIC-3は近日公開）。",
    "このアプリにはカレンダー機能があり、予定の登録・変更・削除をユーザーに代わって行えます。以下のルールに従ってください。",
    "【予定の登録】ユーザーが日時と内容を示して予定登録を明確に依頼した場合は、テキストで返答せず register_schedule 関数を呼び出してください。titleには「〜の予定を入れて」等の依頼表現をそのまま入れず、文脈から本質的なイベント名だけを抽出してください（例：「明日の9時から仕事の予定を入れて」→title=「仕事」、「金曜の夜に美容院の予定を追加して」→title=「美容院」）。また「15時に役所に行く」「資料を作成する」のような動詞・タスク表現も、そのまま入れず適切な名詞に変換してください（例：「役所に行く」→title=「役所」）。日付・内容が不明瞭で判断できない場合のみ、関数を呼ばずに聞き返してください。register_scheduleを呼び出すと、実際の登録はまだ行われず、アプリ側がユーザーに確認カードを表示して最終確認を取ります。重複の警告もそのカード上に自動で表示されるため、あなたが重複の有無を気にしたり、確認や再呼び出しをする必要はありません。",
    "【相対的な時間指定（文脈連携）】「明日の仕事のあとに美容院」「会議の前にランチ」のように、既存の別の予定を基準にした時間指定がされた場合は、自分で時刻を推測しないでください。start_time/end_timeは省略し、relative_anchor_title（基準となる予定のタイトル、例：「仕事」）とrelative_position（「あと」ならafter、「前」ならbefore）を指定してregister_scheduleを呼び出してください。実際の時刻は、アプリ側がカレンダー上の基準予定の実在時刻を調べて自動計算します。",
    "【日時が曖昧な表現】「明日の朝」「今週末の昼」「来週の仕事終わり」のように具体的な時刻が無い場合は、一般的な生活時間帯から違和感のない時刻を常識的に推測してregister_scheduleを呼び出してください（目安：朝＝9:00、昼＝12:00、夜・仕事終わり＝19:00）。推測が難しい場合のみ、関数を呼ばずに「何時頃にしますか？」のように自然に聞き返してください。",
    "【曜日・日付の解釈】「来週の火曜」「今週末」のように感覚がズレやすい表現は、与えられた本日の日付・曜日を基準に、会話の前後の文脈も踏まえて最も可能性の高い正確な日付を計算してください。「今週末」は直近の土曜日（すでに週末なら当日）を指すのが基本ですが、文脈上「日曜」を指していそうな場合はそちらを優先してください。",
    "【繰り返し予定の自動検知】「毎週火曜日」「毎月1日」「毎日」のように繰り返しを示す表現が含まれる場合は、単発の予定ではなく繰り返し予定として扱い、register_scheduleのrecurrenceに daily/weekly/monthly のいずれかを指定してください（dateには1回目の日付を入れてください）。繰り返しを示す表現が無い場合はrecurrenceを省略してください。",
    "【予定の削除・取り消し】ユーザーが「今のやつ消して」「予定を取り消して」「さっきのをキャンセルして」のように予定の削除を依頼した場合はdelete_schedule関数を呼び出してください。直前にこの会話で登録した予定を指している場合はtargetに'last'を指定し、date/titleは省略してください。特定の日付やタイトルで対象が分かる場合はそちらを指定してください。",
    "【予定の変更】「さっきの予定、10時からに後ろ倒しして」「タイトルを『ミーティング』に変えて」のように、登録済みの予定の日時やタイトルの変更を依頼された場合はupdate_schedule関数を呼び出してください。対象の指定方法はdelete_scheduleと同様です。変更したい項目（new_date/new_start_time/new_end_time/new_title）だけを指定し、変更しない項目は省略してください。",
  ];
  if(today && today.date){
    lines.push(`本日の日付は${today.date}${today.weekday ? `（${today.weekday}曜日）` : ""}です。現在時刻は${today.time || "不明"}です。相対的な日付表現はこれを基準に解釈してください。`);
  }
  return lines.join("");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method-not-allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("gemini chat error: GEMINI_API_KEY is not set");
    res.status(500).json({ error: "server-misconfigured" });
    return;
  }

  const body = req.body || {};
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "message-required" });
    return;
  }
  if (message.length > MAX_MESSAGE_LEN) {
    res.status(400).json({ error: "message-too-long" });
    return;
  }

  // フロント側は直近のやり取りだけを送ってくる想定だが、念のためサーバー側でも
  // 件数・型・長さの上限をかけて不正な形のリクエストを弾く
  const rawHistory = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];
  const contents = [];
  for (const turn of rawHistory) {
    if (!turn || (turn.role !== "user" && turn.role !== "model")) continue;
    const text = typeof turn.text === "string" ? turn.text.slice(0, MAX_MESSAGE_LEN) : "";
    if (!text) continue;
    contents.push({ role: turn.role, parts: [{ text }] });
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  // クライアント（ブラウザ）のローカル日時。「明日」「来週」等の相対的な
  // 日付表現をユーザーの実際のタイムゾーンを基準に解釈させるために使う
  const today = body.today && typeof body.today === "object" ? {
    date: typeof body.today.date === "string" ? body.today.date.slice(0, 10) : "",
    weekday: typeof body.today.weekday === "string" ? body.today.weekday.slice(0, 4) : "",
    time: typeof body.today.time === "string" ? body.today.time.slice(0, 5) : "",
  } : null;

  // 天気カード・ホームの予定/タスクウィジェットの実データ。クライアントからの
  // 任意入力なので、型・件数・長さを必ず検証してから使う
  const rawAppContext = body.appContext && typeof body.appContext === "object" ? body.appContext : null;
  const rawWeather = rawAppContext && rawAppContext.weather && typeof rawAppContext.weather === "object" ? rawAppContext.weather : null;
  const appContext = {
    weather: rawWeather && typeof rawWeather.temp === "number" ? {
      city: typeof rawWeather.city === "string" ? rawWeather.city.slice(0, 40) : "",
      temp: rawWeather.temp,
      label: typeof rawWeather.label === "string" ? rawWeather.label.slice(0, 20) : "",
      pop: typeof rawWeather.pop === "number" ? rawWeather.pop : null,
      precip: typeof rawWeather.precip === "number" ? rawWeather.precip : null,
    } : null,
    todos: (Array.isArray(rawAppContext && rawAppContext.todos) ? rawAppContext.todos : [])
      .slice(0, 30)
      .map(t => ({ text: typeof (t && t.text) === "string" ? t.text.slice(0, 60) : "", done: !!(t && t.done) }))
      .filter(t => t.text),
    events: (Array.isArray(rawAppContext && rawAppContext.events) ? rawAppContext.events : [])
      .slice(0, 30)
      .map(e => ({
        title: typeof (e && e.title) === "string" ? e.title.slice(0, 60) : "",
        start: typeof (e && e.start) === "string" ? e.start.slice(0, 5) : "",
        end: typeof (e && e.end) === "string" ? e.end.slice(0, 5) : "",
      }))
      .filter(e => e.title),
    stocks: buildStockAppContext(rawAppContext && rawAppContext.stocks),
  };

  // streamGenerateContent（SSE）を使い、Geminiが生成したテキストを受信次第
  // 逐次クライアントへ転送する。これによりVercelの応答タイムアウト対策になる
  // （最初の1バイトが速く返る）だけでなく、ユーザーにも「考え中」のまま長時間
  // 待たせず、生成中のテキストがその場で表示されるようになる。
  // クライアントへは改行区切りJSON（NDJSON）で {"type": ...} イベントを送る。
  let streamStarted = false;
  const send = (obj) => {
    res.write(JSON.stringify(obj) + "\n");
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const r = await fetchGeminiWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        tools: SCHEDULE_TOOLS,
        systemInstruction: { role: "system", parts: [{ text: buildSystemInstruction(today, appContext) }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });

    if (!r.ok) {
      let data = null;
      try { data = await r.json(); } catch (_) { /* ボディが無い/JSONでない場合は無視 */ }
      console.error("gemini api error:", r.status, data);
      res.status(502).json({ error: (data && data.error && data.error.message) || "gemini-request-failed" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });
    streamStarted = true;

    let replyText = "";
    let functionCallResult = null;
    let blockReason = null;
    let finishReason = null;
    let lastRawChunk = null;
    let buffer = "";
    const decoder = new TextDecoder();
    const reader = r.body.getReader();

    // SSEの行区切りは実装によって "\n" と "\r\n" が混在しうるため、二重改行
    // ("\n\n")での塊単位ではなく1行ずつ処理する。空行やコメント行（":"始まり）
    // は単に無視すればよく、"data:"行が来た時点で即座にJSONとして処理できる
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nlIndex;
      while ((nlIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, nlIndex);
        buffer = buffer.slice(nlIndex + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        let chunk;
        try { chunk = JSON.parse(jsonStr); } catch (parseErr) {
          console.error("gemini stream: failed to parse SSE data line:", jsonStr.slice(0, 500));
          continue;
        }
        lastRawChunk = chunk;

        const candidate = chunk && chunk.candidates && chunk.candidates[0];
        const parts = (candidate && candidate.content && candidate.content.parts) || [];
        if (candidate && candidate.finishReason) finishReason = candidate.finishReason;
        for (const p of parts) {
          if (p.functionCall && SCHEDULE_FUNCTION_NAMES.has(p.functionCall.name)) {
            functionCallResult = { name: p.functionCall.name, args: p.functionCall.args || {} };
          } else if (typeof p.text === "string" && p.text) {
            replyText += p.text;
            send({ type: "chunk", text: p.text });
          }
        }
        if (chunk && chunk.promptFeedback && chunk.promptFeedback.blockReason) {
          blockReason = chunk.promptFeedback.blockReason;
        }
      }
    }

    if (functionCallResult) {
      send({ type: "functionCall", name: functionCallResult.name, args: functionCallResult.args });
    } else if (!replyText) {
      // ここに来るのは異常系（モデル未指定/権限エラー以外でテキストが
      // 一切得られなかった場合）なので、原因調査のため詳細をログに残す
      console.error(
        "gemini stream: empty response.",
        "blockReason=", blockReason,
        "finishReason=", finishReason,
        "lastRawChunk=", JSON.stringify(lastRawChunk).slice(0, 1000)
      );
      send({
        type: "done",
        reply: blockReason || (finishReason && finishReason !== "STOP")
          ? "この内容にはお答えできませんでした。別の聞き方でもう一度お試しください。"
          : "回答を生成できませんでした。もう一度お試しください。",
      });
    } else {
      send({ type: "done", reply: replyText });
    }
    res.end();
  } catch (e) {
    console.error("gemini chat error:", e);
    if (streamStarted) {
      // 生成途中でネットワークが切れた場合でも、ここまでに送ったテキストは
      // クライアント側に残しつつ、エラーを伝えて即座に諦めさせない
      try { send({ type: "error", error: "internal-error" }); } catch (_) { /* noop */ }
      try { res.end(); } catch (_) { /* noop */ }
    } else {
      res.status(500).json({ error: "internal-error" });
    }
  }
};
