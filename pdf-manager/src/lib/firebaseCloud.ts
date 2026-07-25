'use client';

/**
 * クラウド保管で使う Firebase クライアント (認証 + Storage)。
 *
 * - 既存の学習アプリと同じ Firebase プロジェクト / メール・パスワード認証を使う。
 * - Firebase SDK はブラウザーで必要になった時だけ CDN から読み込む。
 *   Next.js のサーバー描画や初回バンドルには含めないので、
 *   クラウド保管を使わないユーザーの起動速度には影響しない。
 * - ここにあるのは公開用のウェブ設定だけ。管理者用の秘密鍵 (サービスアカウント) は
 *   ブラウザーへ一切持ち込まない。アクセス制御は Storage セキュリティルールで行う。
 */

const FIREBASE_VERSION = '10.0.0';
const APP_NAME = 'pdf-cloud-storage';

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
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type FirebaseServices = {
  auth: any;
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
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-firebase-cloud="${src}"]`,
    );
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

export async function getCloudServices(): Promise<FirebaseServices> {
  if (typeof window === 'undefined') throw new Error('ブラウザーでのみ利用できます');
  if (servicesPromise) return servicesPromise;

  servicesPromise = (async () => {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    await loadScript(`${base}/firebase-app-compat.js`);
    await Promise.all([
      loadScript(`${base}/firebase-auth-compat.js`),
      loadScript(`${base}/firebase-storage-compat.js`),
    ]);

    const firebase = window.firebase;
    if (!firebase) throw new Error('Firebaseを初期化できませんでした');
    const app =
      firebase.apps?.find((candidate: any) => candidate.name === APP_NAME) ??
      firebase.initializeApp(FIREBASE_CONFIG, APP_NAME);

    const auth = app.auth();
    // iPhone のホーム画面版を閉じてもログイン状態を保持する。
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch {
      // 保存制限のある環境では Firebase 既定の永続化方式を使う。
    }

    return { auth, storage: app.storage() };
  })().catch((error) => {
    servicesPromise = null;
    throw error;
  });

  return servicesPromise;
}

function toCloudUser(user: any): CloudUser | null {
  if (!user?.uid) return null;
  return { uid: user.uid, email: user.email ?? null };
}

/** ログイン状態の変化を購読する。 */
export function subscribeCloudAuth(
  listener: (user: CloudUser | null, ready: boolean) => void,
): () => void {
  let active = true;
  let unsubscribe = () => {};

  void getCloudServices()
    .then(({ auth }) => {
      if (!active) return;
      unsubscribe = auth.onAuthStateChanged((user: any) => listener(toCloudUser(user), true));
    })
    .catch(() => {
      // SDK を読み込めない (オフライン等) ときは「未ログイン」ではなく
      // 「まだ分からない」として扱い、端末内データには一切影響させない。
      if (active) listener(null, false);
    });

  return () => {
    active = false;
    unsubscribe();
  };
}

export async function cloudSignIn(email: string, password: string): Promise<CloudUser> {
  const { auth } = await getCloudServices();
  const credential = await auth.signInWithEmailAndPassword(email.trim(), password);
  const user = toCloudUser(credential.user);
  if (!user) throw new Error('ログインできませんでした');
  return user;
}

export async function cloudSignUp(email: string, password: string): Promise<CloudUser> {
  const { auth } = await getCloudServices();
  const credential = await auth.createUserWithEmailAndPassword(email.trim(), password);
  const user = toCloudUser(credential.user);
  if (!user) throw new Error('登録できませんでした');
  return user;
}

/**
 * ログアウトする。
 * 端末内の PDF・フォルダー・タグ・メモには一切手を触れない
 * (クラウド保管済みの PDF は再ログインすればまた開ける)。
 */
export async function cloudSignOut(): Promise<void> {
  const { auth } = await getCloudServices();
  await auth.signOut();
}

export async function currentCloudUser(): Promise<CloudUser | null> {
  const { auth } = await getCloudServices();
  return toCloudUser(auth.currentUser);
}

/** ログインが今も有効か確認する (期限切れならトークン更新で弾かれる)。 */
export async function requireCloudUser(): Promise<CloudUser> {
  const { auth } = await getCloudServices();
  const user = auth.currentUser;
  if (!user) throw new Error('SIGNED_OUT');
  await user.getIdToken(false);
  return toCloudUser(user) as CloudUser;
}

/** Storage の参照を得る。 */
export async function cloudRef(path: string): Promise<any> {
  const { storage } = await getCloudServices();
  return storage.ref(path);
}

export function cloudErrorCode(error: unknown): string {
  return String((error as { code?: string })?.code ?? (error as Error)?.message ?? '');
}

export function cloudErrorMessage(error: unknown): string {
  const code = cloudErrorCode(error);
  if (code.includes('invalid-email')) return 'メールアドレスの形式を確認してください。';
  if (code.includes('weak-password')) return 'パスワードは6文字以上にしてください。';
  if (code.includes('email-already-in-use')) return 'このメールアドレスはすでに登録されています。';
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found')
  ) {
    return 'メールアドレスまたはパスワードが正しくありません。';
  }
  if (code.includes('too-many-requests')) return '試行回数が多いため、一度時間を置いてください。';
  if (code.includes('network-request-failed')) return '通信できません。ネットワーク接続を確認してください。';
  if (code.includes('storage/unauthorized') || code.includes('permission-denied')) {
    return 'クラウド保存の権限がありません。Firebaseのセキュリティルールを確認してください。';
  }
  if (code.includes('storage/quota-exceeded')) {
    return 'クラウドの保存容量が不足しています。';
  }
  if (code.includes('storage/object-not-found')) {
    return 'クラウド上にファイルが見つかりませんでした。';
  }
  if (code.includes('storage/unknown') || code.includes('storage/retry-limit-exceeded')) {
    return 'クラウドとの通信に失敗しました。時間をおいてお試しください。';
  }
  const message = error instanceof Error ? error.message : '';
  return message || 'クラウド処理に失敗しました。';
}
