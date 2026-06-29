  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
  import { getFirestore, doc, setDoc, getDoc, deleteDoc, onSnapshot, collection, query, where, orderBy, limit, getDocs, getCountFromServer, writeBatch, increment } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
  import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, deleteUser, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { applyCloud, commit, publishLeaderboard, saveCoins, seedCloudFromLocal, totalBP } from './core.js';
import { app, logout, render } from './render.js';
import { S, state } from './state.js';

  const firebaseConfig = {
    apiKey: "AIzaSyCg3zD2xkq_3e5MclG9YK_uVqVzWulO9Ws",
    authDomain: "my-az900-app.firebaseapp.com",
    projectId: "my-az900-app",
    storageBucket: "my-az900-app.firebasestorage.app",
    messagingSenderId: "989248012630",
    appId: "1:989248012630:web:1801a2033c56887320d6f7",
    measurementId: "G-4E16HLF386"
  };

  window.FirebaseSync = { doc, setDoc };
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
      me: async () => {
        if (!state.currentUserId) return null;
        try { const d = await getDoc(doc(state.db, "leaderboard", state.currentUserId)); return d.exists() ? d.data() : null; }
        catch (e) { return null; }
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


    // ログイン状態の監視。ログイン中はそのアカウントのデータをリアルタイム同期
    onAuthStateChanged(auth, (user) => {
      state.authReady = true;
      if (user) {
        state.currentUser = user;
        state.currentUserId = user.uid;
        state.profileChecked = false;   // このアカウントのユーザー名を確認するまでゲート
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
        state.unsub = onSnapshot(doc(state.db, "users", state.currentUserId), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // アカウント共通のコイン残高をこの端末へ反映
            if (typeof data.coins === "number") { S.coins = data.coins; saveCoins(data.coins); }
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
      }
      render();
    });
  } catch (e) {
    console.error("Firebase init failed:", e);
    // 初期化に失敗しても画面が固まらないようにゲートを解除
    state.authReady = true;
    render();
  }

