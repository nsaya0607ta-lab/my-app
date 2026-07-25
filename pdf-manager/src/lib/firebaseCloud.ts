'use client';

/**
 * PDFクラウドバックアップ用のFirebaseクライアント。
 *
 * 既存の学習アプリと同じFirebaseプロジェクト・メール/パスワード認証を使う。
 * Firebase SDKはブラウザーで必要になった時だけ読み込み、Next.jsのサーバー描画や
 * 初回バンドルには含めない。
 */

const FIREBASE_VERSION = '10.0.0';
const APP_NAME = 'pdf-cloud-backup';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCg3zD2xkq_3e5MclG9YK_uVqVzWulO9Ws',
  authDomain: 'my-az900-app.firebaseapp.com',
  projectId: 'my-az900-app',
  storageBucket: 'my-az900-app.firebasestorage.app',
  messagingSenderId: '989248012630',
  appId: '1:989248012630:web:1801a2033c56887320d6f7',
};

export type CloudUser = {
  uid: string;
  email: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

type FirebaseServices = {
  auth: any;
  firestore: any;
  storage: any;
};

declare global {
  interface Window {
    firebase?: any;
  }
}

let servicesPromise: Promise<FirebaseServices> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-firebase-cloud="${src}"]`);
    if (existing?.dataset.loaded === '1') {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Firebase SDKを読み込めませんでした')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.firebaseCloud = src;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = '1';
        resolve();
      },
      { once: true },
    );
    script.addEventListener('error', () => reject(new Error('Firebase SDKを読み込めませんでした')), {
      once: true,
    });
    document.head.append(script);
  });
}

export async function getFirebaseCloudServices(): Promise<FirebaseServices> {
  if (typeof window === 'undefined') throw new Error('ブラウザーでのみ利用できます');
  if (servicesPromise) return servicesPromise;

  servicesPromise = (async () => {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    await loadScript(`${base}/firebase-app-compat.js`);
    await Promise.all([
      loadScript(`${base}/firebase-auth-compat.js`),
      loadScript(`${base}/firebase-firestore-compat.js`),
      loadScript(`${base}/firebase-storage-compat.js`),
    ]);

    const firebase = window.firebase;
    if (!firebase) throw new Error('Firebaseを初期化できませんでした');
    const app =
      firebase.apps?.find((candidate: any) => candidate.name === APP_NAME) ??
      firebase.initializeApp(FIREBASE_CONFIG, APP_NAME);

    const auth = app.auth();
    // iPhoneのホーム画面版を閉じてもログイン状態を保持する。
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch {
      // 保存制限のある環境ではFirebase既定の永続化方式を使う。
    }

    return {
      auth,
      firestore: app.firestore(),
      storage: app.storage(),
    };
  })().catch((error) => {
    servicesPromise = null;
    throw error;
  });

  return servicesPromise;
}

export function subscribeCloudAuth(listener: (user: CloudUser | null) => void): () => void {
  let active = true;
  let unsubscribe = () => {};

  void getFirebaseCloudServices()
    .then(({ auth }) => {
      if (!active) return;
      unsubscribe = auth.onAuthStateChanged((user: CloudUser | null) => listener(user));
    })
    .catch(() => {
      if (active) listener(null);
    });

  return () => {
    active = false;
    unsubscribe();
  };
}

export async function cloudSignIn(email: string, password: string): Promise<CloudUser> {
  const { auth } = await getFirebaseCloudServices();
  const credential = await auth.signInWithEmailAndPassword(email.trim(), password);
  return credential.user as CloudUser;
}

export async function cloudSignUp(email: string, password: string): Promise<CloudUser> {
  const { auth } = await getFirebaseCloudServices();
  const credential = await auth.createUserWithEmailAndPassword(email.trim(), password);
  return credential.user as CloudUser;
}

export async function cloudSignOut(): Promise<void> {
  const { auth } = await getFirebaseCloudServices();
  await auth.signOut();
}

export async function currentCloudUser(): Promise<CloudUser | null> {
  const { auth } = await getFirebaseCloudServices();
  return auth.currentUser as CloudUser | null;
}

export function cloudErrorMessage(error: unknown): string {
  const code = String((error as { code?: string })?.code ?? '');
  if (code.includes('invalid-email')) return 'メールアドレスの形式を確認してください。';
  if (code.includes('weak-password')) return 'パスワードは6文字以上にしてください。';
  if (code.includes('email-already-in-use')) return 'このメールアドレスはすでに登録されています。';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  if (code.includes('too-many-requests')) return '試行回数が多いため、一度時間を置いてください。';
  if (code.includes('network-request-failed')) return '通信できません。ネットワーク接続を確認してください。';
  if (code.includes('storage/unauthorized') || code.includes('permission-denied')) {
    return 'クラウド保存の権限がありません。Firebaseのセキュリティルールを確認してください。';
  }
  const message = error instanceof Error ? error.message : '';
  return message || 'クラウド処理に失敗しました。';
}
