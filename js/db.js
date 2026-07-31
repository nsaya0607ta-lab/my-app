  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
  import { getFirestore, doc, setDoc, getDoc, deleteDoc, onSnapshot, collection, query, where, orderBy, limit, getDocs, getCountFromServer, writeBatch, increment, runTransaction } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
  import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, deleteUser, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { applyCloud, applyCloudSkins, commit, getProfileName, publishLeaderboard, saveCoins, seedCloudFromLocal, totalBP } from './core.js';
import { updateAiScores } from './reviewAI.js';
import { app, applyCloudGcal, applyCloudMindPalette, applyCloudPendingOrders, applyCloudPlayground, applyCloudPortfolio, applyCloudScenarioMode, applyCloudTradeLog, applyCloudVoiceprint, gcalStartNotifyListener, gcalStopNotifyListener, logout, render } from './render.js';
import { S, state } from './state.js';
import { applyCloudSchedule } from './schedule/store.js';
import { applyCloudScheduleDone } from './schedule/completion.js';
import { applyCloudBp } from './bp/store.js';
import { applyCloudValueGame } from './valuegame/store.js';

  const firebaseConfig = {
    apiKey: "AIzaSyCg3zD2xkq_3e5MclG9YK_uVqVzWulO9Ws",
    authDomain: "my-az900-app.firebaseapp.com",
    projectId: "my-az900-app",
    storageBucket: "my-az900-app.firebasestorage.app",
    messagingSenderId: "989248012630",
    appId: "1:989248012630:web:1801a2033c56887320d6f7",
    measurementId: "G-4E16HLF386"
  };

  // runTransaction：株の買付・売却でAC残高と保有株を原子的に検証・更新するために使う。
  // collection以降は🃏価値観ゲームのオンラインルーム（vgRooms）で、
  // ルームの検索・購読・更新・退出に使う
  window.FirebaseSync = {
    doc, setDoc, runTransaction,
    collection, query, where, orderBy, limit, getDoc, getDocs, deleteDoc, onSnapshot,
  };
  try {
    const fbApp = initializeApp(firebaseConfig);
    state.db = getFirestore(fbApp);
    const auth = getAuth(fbApp);

    // 画面側（通常スクリプト）から呼び出せる認証API
    window.Auth = {
      signup: (email, pw) => createUserWithEmailAndPassword(auth, email, pw),
      login:  (email, pw) => signInWithEmailAndPassword(auth, email, pw),
      logout: () => signOut(auth)
    };

    // 画面側から呼び出せるランキングAPI（公開コレクション leaderboard）
    window.LB = {
      publish: async (data) => {
        if (!state.currentUserId) return;
        await setDoc(doc(state.db, "leaderboard", state.currentUserId), data, { merge: true });
      },
      top: async (n) => {
        const q = query(collection(state.db, "leaderboard"), orderBy("totalBP", "desc"), limit(n || 50));
        const snap = await getDocs(q);
        const rows = []; snap.forEach(d => rows.push(Object.assign({ uid: d.id }, d.data())));
        return rows;
      },
      myRank: async (myBP) => {
        try {
          const c = await getCountFromServer(query(collection(state.db, "leaderboard"), where("totalBP", ">", myBP)));
          return c.data().count + 1;
        } catch (e) { return null; }
      },
      // 資格別ランキング（certBP.{certId} の降順）
      topByCert: async (certId, n) => {
        const q = query(collection(state.db, "leaderboard"), orderBy("certBP." + certId, "desc"), limit(n || 50));
        const snap = await getDocs(q);
        const rows = []; snap.forEach(d => rows.push(Object.assign({ uid: d.id }, d.data())));
        return rows;
      },
      myRankByCert: async (certId, myBP) => {
        try {
          const c = await getCountFromServer(query(collection(state.db, "leaderboard"), where("certBP." + certId, ">", myBP)));
          return c.data().count + 1;
        } catch (e) { return null; }
      },
      me: async () => {
        if (!state.currentUserId) return null;
        try { const d = await getDoc(doc(state.db, "leaderboard", state.currentUserId)); return d.exists() ? d.data() : null; }
        catch (e) { return null; }
      },
      // 🃏 価値観ゲームのランキング（成功回数の降順）。leaderboardの
      // 公開要約に含まれる vgWins を使うので、専用のコレクションは作らない
      topByGameWins: async (n) => {
        try {
          const q = query(collection(state.db, "leaderboard"), orderBy("vgWins", "desc"), limit(n || 30));
          const snap = await getDocs(q);
          const rows = [];
          snap.forEach(d => {
            const r = d.data() || {};
            if (!(r.vgWins > 0)) return;   // まだ遊んでいない人は載せない
            rows.push(Object.assign({ uid: d.id }, r));
          });
          return rows;
        } catch (e) { return []; }
      },
      myRankByGameWins: async (myWins) => {
        try {
          const c = await getCountFromServer(query(collection(state.db, "leaderboard"), where("vgWins", ">", myWins)));
          return c.data().count + 1;
        } catch (e) { return null; }
      },
      // 表示名が既に他ユーザーに使われているか（自分自身は除外）
      nameTaken: async (name) => {
        const snap = await getDocs(query(collection(state.db, "leaderboard"), where("displayName", "==", name)));
        let taken = false;
        snap.forEach(d => { if (d.id !== state.currentUserId) taken = true; });
        return taken;
      }
    };

    // 問題ごとの正答率を集計する公開API（qstats/{certId}_{qid} に増分で蓄積）
    window.QStats = {
      // results: [{qid, correct:true/false}, ...] を一括加算
      record: async (certId, results) => {
        if (!state.db || !state.currentUserId || !Array.isArray(results) || !results.length) return;
        try {
          const batch = writeBatch(state.db);
          results.forEach(r => {
            const ref = doc(state.db, "qstats", certId + "_" + r.qid);
            batch.set(ref, {
              cert: certId, qid: r.qid,
              attempts: increment(1),
              correct: increment(r.correct ? 1 : 0)
            }, { merge: true });
          });
          await batch.commit();
        } catch (e) { console.error("qstats record failed:", e); }
      },
      // 1問の集計を取得 → {attempts, correct} | null
      get: async (certId, qid) => {
        try { const d = await getDoc(doc(state.db, "qstats", certId + "_" + qid)); return d.exists() ? d.data() : null; }
        catch (e) { return null; }
      },
      // 複数問をまとめて取得 → { qid: {attempts, correct}, ... }
      getMany: async (certId, qids) => {
        const out = {};
        await Promise.all((qids || []).map(async id => {
          try { const d = await getDoc(doc(state.db, "qstats", certId + "_" + id)); if (d.exists()) out[id] = d.data(); }
          catch (e) {}
        }));
        return out;
      }
    };

    // アカウント削除（退会）API
    window.Account = {
      // password で再認証 → 個人データ削除 → 認証アカウント削除（qstats集計は保持）
      delete: async (password) => {
        const user = auth.currentUser;
        if (!user) { const e = new Error("no-user"); e.code = "no-user"; throw e; }
        // 1) 再認証（パスワード検証＋recent-login確保）。失敗時はここで中断し、何も削除されない
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
        // 2) 個人データ・公開要約を削除（集計 qstats は触らない＝他ユーザーの正答率は不変）
        try { await deleteDoc(doc(state.db, "leaderboard", user.uid)); } catch (e) { console.error("del leaderboard:", e); }
        try { await deleteDoc(doc(state.db, "users", user.uid)); } catch (e) { console.error("del user doc:", e); }
        // 3) 認証アカウント本体を削除（これでセッションも破棄され onAuthStateChanged(null) が発火）
        await deleteUser(user);
      }
    };

    // 予定一覧のグループ見出しを「各ユーザー自身がこのアプリに登録した名前」で
    // 表示するための公開ディレクトリ（Google連携メールアドレス→登録名）。
    // 共有カレンダー越しに他ユーザーの予定を見ている側が、その予定の
    // creator.emailから登録名を引けるようにする。leaderboardの表示名と同様、
    // 「このアプリで使う表示名は公開情報」という既存の設計方針に合わせている
    window.GcalNames = {
      publish: async (email, name) => {
        const id = (email || "").trim().toLowerCase();
        const trimmedName = (name || "").trim();
        if (!id || !trimmedName) return;
        try {
          await setDoc(doc(state.db, "gcalNames", id), { name: trimmedName, updatedAt: new Date().toISOString() }, { merge: true });
        } catch (e) { console.error("gcalNames publish failed:", e); }
      },
      lookup: async (email) => {
        const id = (email || "").trim().toLowerCase();
        if (!id) return null;
        try {
          const d = await getDoc(doc(state.db, "gcalNames", id));
          return d.exists() ? (d.data().name || null) : null;
        } catch (e) { return null; }
      }
    };

    // ニュース機能：管理者が登録した「タイトル」「本文」をFirestoreのnews
    // コレクションに保存し、全ユーザーで共有する（1件＝1ドキュメント）。
    // 一覧画面はURLへ遷移せず、アプリ内の詳細画面でcontentをそのまま表示する。
    // ドキュメントIDはカテゴリを問わず一意な乱数文字列（サーバー側の連番は使わない）
    window.News = {
      add: async (category, dateKey, title, content) => {
        if (!state.db) { const e = new Error("db-not-ready"); e.code = "db-not-ready"; throw e; }
        const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        await setDoc(doc(state.db, "news", id), {
          category, dateKey, title, content,
          authorName: getProfileName() || "",
          createdAt: new Date().toISOString()
        });
        return id;
      },
      remove: async (id) => {
        if (!state.db || !id) return;
        await deleteDoc(doc(state.db, "news", id));
      },
      // 指定カテゴリ（"japan" | "world"）の全件を、日付キー→登録日時の昇順で返す。
      // カレンダーの「ニュースがある日」マークも一覧もこの1回の取得結果から作る
      listByCategory: async (category) => {
        if (!state.db) return [];
        const snap = await getDocs(query(collection(state.db, "news"), where("category", "==", category)));
        const rows = [];
        snap.forEach(d => rows.push(Object.assign({ id: d.id }, d.data())));
        rows.sort((a, b) => (a.dateKey || "").localeCompare(b.dateKey || "") || (a.createdAt || "").localeCompare(b.createdAt || ""));
        return rows;
      }
    };

    // カレンダー通知の受信箱：ローカル（デモ）カレンダーの「共有ユーザー設定」に
    // 登録されたメールアドレス宛てに、予定の登録・削除通知を配る。宛先の
    // メールアドレスをドキュメントIDにせず別フィールド(toEmail)に持たせ、
    // where句で絞り込む方式にしているのは、宛先が実際にこのアプリのアカウントを
    // 持っているとは限らない（招待前提の簡易実装）ため、存在確認をせず送りっぱなし
    // にできるようにするため。受信側はonSnapshotで自分宛てのものだけを購読し、
    // 表示後は用済みとして削除する（同じ通知を毎回再表示しないため）
    window.CalNotify = {
      send: async (toEmail, payload) => {
        const email = (toEmail || "").trim().toLowerCase();
        if (!state.db || !email || !payload) return;
        try {
          const id = "cn" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          await setDoc(doc(state.db, "calNotify", id), Object.assign({
            toEmail: email,
            createdAt: new Date().toISOString()
          }, payload));
        } catch (e) { console.error("calNotify send failed:", e); }
      },
      // 自分宛て(email)の通知をリアルタイム購読する。戻り値は購読解除関数。
      // 届いた通知は表示側のコールバックへ渡した直後にFirestoreから削除する
      listen: (email, onItem) => {
        const key = (email || "").trim().toLowerCase();
        if (!state.db || !key) return () => {};
        const q = query(collection(state.db, "calNotify"), where("toEmail", "==", key), orderBy("createdAt"));
        return onSnapshot(q, (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type !== "added") return;
            try { onItem(change.doc.data()); } catch (e) {}
            deleteDoc(doc(state.db, "calNotify", change.doc.id)).catch(() => {});
          });
        }, () => {});
      }
    };

    // ログイン状態の監視。ログイン中はそのアカウントのデータをリアルタイム同期
    onAuthStateChanged(auth, (user) => {
      state.authReady = true;
      if (user) {
        state.currentUser = user;
        state.currentUserId = user.uid;
        state.profileChecked = false;   // このアカウントのユーザー名を確認するまでゲート
        try { updateAiScores("lpic1"); } catch (e) {}   // 🧠 AIおすすめ復習：ログイン時にこのユーザーのAIスコアを自動更新
        // 公開プロフィール（表示名）をこの端末へ取り込む（機種をまたいで名前が引き継がれる）
        if (window.LB) {
          window.LB.me().then(d => {
            if (d && d.displayName) localStorage.setItem("profile_name", d.displayName);
          }).catch(() => {}).finally(() => { state.profileChecked = true; render(); });
        } else {
          state.profileChecked = true;
        }
        if (state.unsub) { state.unsub(); state.unsub = null; }
        state.lbAutoDone = false;
        // 自分宛てのカレンダー通知（共有カレンダーの登録・削除）の受信を開始
        if (user.email) gcalStartNotifyListener(user.email);
        state.unsub = onSnapshot(doc(state.db, "users", state.currentUserId), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // アカウント共通のコイン残高をこの端末へ反映
            if (typeof data.coins === "number") { S.coins = data.coins; saveCoins(data.coins); }
            // 保有株（ポートフォリオ）をこの端末へ反映。他ユーザーのドキュメントは
            // 購読していないため、ここに届くのは必ずログイン中の本人のデータのみ
            if (data.portfolio) applyCloudPortfolio(data.portfolio);
            // 時間外の予約注文・取引履歴も同様にこの端末へ反映する
            if (data.pendingOrders) applyCloudPendingOrders(data.pendingOrders);
            if (data.stockTrades) applyCloudTradeLog(data.stockTrades);
            // カレンダーのデモ予定・ToDo・登録者名も同様にこの端末へ反映
            // （アクセストークン・選択中カレンダーIDはgcal同期の対象外のまま）
            if (data.gcal) applyCloudGcal(data.gcal);
            // 予定（Schedule）・タスク（Task）・同期設定もこの端末へ反映する。
            // 端末をまたいだ引き継ぎ用で、Googleカレンダー本体との同期
            // （js/schedule/gsync.js）とは独立して動く
            if (data.schedule) applyCloudSchedule(data.schedule);
            // 予定の「完了」記録（Googleカレンダーには無い概念なので別テーブル）
            if (data.scheduleDone) applyCloudScheduleDone(data.scheduleDone);
            // 🎖️ 活動BP（総合ランク用の別枠BP）の台帳・ミッション達成状況。
            // 合計や重複防止キーを両端でマージするので、別端末で獲得済みの
            // 行動がこちらで再付与されることはない。値が実際に動いたときだけ
            // 再描画する（自分の書き込みのechoで画面を作り直さないため）
            if (data.bpActivity && applyCloudBp(data.bpActivity)) {
              try { window.dispatchEvent(new CustomEvent("bp-changed")); } catch (e) {}
              render();
            }
            // 🃏 価値観ゲームの戦績・称号もこの端末へ反映する
            if (data.valueGame) applyCloudValueGame(data.valueGame);
            // 背景スキン（所持リスト・適用中）もこの端末へ反映。ログインユーザー
            // 本人のドキュメントのみ購読しているため、他ユーザーのスキンが
            // 混ざることはない
            if (data.currentSkin || data.ownedSkins) applyCloudSkins(data);
            if (data.mindPalette) applyCloudMindPalette(data.mindPalette);
            // シナリオモードの進捗（クリア済み一覧・途中経過のLinux環境）もこの端末へ反映
            if (data.scenarioMode) applyCloudScenarioMode(data.scenarioMode);
            // Linuxプレイグラウンド（仮想FS・ミッション進捗など）もこの端末へ反映
            if (data.playground) applyCloudPlayground(data.playground);
            // イントロドンの声紋登録者一覧（登録者管理）もこの端末へ反映
            if (data.voiceprint) applyCloudVoiceprint(data.voiceprint);
            // 旧形式（資格未対応の {bp,wrong,history}）→ certs.az900 へ一度だけ移行
            if (!data.certs && data.bp !== undefined) {
              setDoc(doc(state.db, "users", state.currentUserId), {
                certs: { az900: { bp: data.bp, wrong: data.wrong || [], history: data.history || [] } }
              }, { merge: true });
              return; // 次のsnapshotで certs 形式として処理されます
            }
            if (data.certs) {
              state.cloudData = data.certs;            // クラウドの全資格データを保持
              if (S.cert) applyCloud(S.cert);    // 選択中の資格をこの端末へ反映
              if (S.screen==="home" || S.screen==="dc" || S.screen==="history" || S.screen==="select") { render(); }
              if (!state.lbAutoDone) { state.lbAutoDone = true; try{ publishLeaderboard(); }catch(e){} }  // ログイン時に自動でランキング反映
            } else {
              seedCloudFromLocal();              // 中身が空 → ローカルから初期投入
            }
          } else {
            seedCloudFromLocal();                // ドキュメント未作成 → ローカルから初期投入
          }
        });
      } else {
        state.currentUser = null;
        state.currentUserId = null;
        if (state.unsub) { state.unsub(); state.unsub = null; }
        gcalStopNotifyListener();
      }
      render();
    });
  } catch (e) {
    console.error("Firebase init failed:", e);
    // 初期化に失敗しても画面が固まらないようにゲートを解除
    state.authReady = true;
    render();
  }

