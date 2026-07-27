import { createHash, createSign, timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 49 * 1024 * 1024;
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type ImportRequest = {
  driveFileId: string;
  name: string;
  size: number;
  modifiedTime: string;
  mimeType: string;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function secretMatches(received: string | null): boolean {
  const expected = process.env.DRIVE_IMPORT_SECRET;
  if (!received || !expected) return false;

  const actualBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function readServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON が未設定です');

  const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Firebaseサービスアカウントの形式が正しくありません');
  }

  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

function base64Url(value: string | Buffer): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return buffer.toString('base64url');
}

async function getStorageAccessToken(account: ServiceAccount): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: STORAGE_SCOPE,
      aud: GOOGLE_TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const unsignedToken = `${header}.${payload}`;

  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = base64Url(signer.sign(account.private_key));
  const assertion = `${unsignedToken}.${signature}`;

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  });

  const data = (await response.json()) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google Storage認証に失敗しました');
  }

  return data.access_token;
}

function objectApiUrl(bucket: string, objectPath: string): string {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`;
}

async function objectExists(accessToken: string, bucket: string, objectPath: string): Promise<boolean> {
  const response = await fetch(objectApiUrl(bucket, objectPath), {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Storage確認に失敗しました: HTTP ${response.status}`);
  }
  return true;
}

async function createResumableSession(options: {
  accessToken: string;
  bucket: string;
  objectPath: string;
  body: ImportRequest;
  importKey: string;
}): Promise<string | null> {
  const url = new URL(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(options.bucket)}/o`,
  );
  url.searchParams.set('uploadType', 'resumable');
  url.searchParams.set('name', options.objectPath);
  url.searchParams.set('ifGenerationMatch', '0');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      'content-type': 'application/json; charset=utf-8',
      'x-upload-content-type': 'application/pdf',
      'x-upload-content-length': String(options.body.size),
    },
    body: JSON.stringify({
      name: options.objectPath,
      contentType: 'application/pdf',
      cacheControl: 'private, no-store',
      metadata: {
        importKey: options.importKey,
        driveFileId: options.body.driveFileId,
        driveModifiedTime: options.body.modifiedTime,
        originalNameB64: Buffer.from(options.body.name, 'utf8').toString('base64'),
        source: 'google-drive',
      },
    }),
    cache: 'no-store',
  });

  if (response.status === 412) return null;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`アップロードセッション作成に失敗しました: HTTP ${response.status} ${detail}`);
  }

  const uploadUrl = response.headers.get('location');
  if (!uploadUrl) throw new Error('StorageからアップロードURLが返されませんでした');
  return uploadUrl;
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function validateBody(value: unknown): ImportRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Partial<ImportRequest>;

  if (
    !validText(body.driveFileId, 200) ||
    !validText(body.name, 500) ||
    !validText(body.modifiedTime, 100) ||
    !Number.isFinite(Date.parse(body.modifiedTime)) ||
    body.mimeType !== 'application/pdf' ||
    !Number.isInteger(body.size) ||
    Number(body.size) <= 0 ||
    Number(body.size) > MAX_FILE_SIZE
  ) {
    return null;
  }

  return body as ImportRequest;
}

export async function POST(request: Request) {
  try {
    if (!secretMatches(request.headers.get('x-import-secret'))) {
      return Response.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    const uid = process.env.PDF_APP_UID;
    const bucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (!uid || !bucket) {
      return Response.json({ error: 'サーバー設定が不足しています' }, { status: 500 });
    }

    const body = validateBody(await request.json());
    if (!body) {
      return Response.json(
        { error: 'PDF情報が正しくないか、ファイルが49MBを超えています' },
        { status: 400 },
      );
    }

    const importKey = createHash('sha256')
      .update(`${body.driveFileId}:${body.modifiedTime}`)
      .digest('hex');
    const objectPath = `users/${uid}/drive-inbox/${importKey}.pdf`;

    const account = readServiceAccount();
    const accessToken = await getStorageAccessToken(account);

    if (await objectExists(accessToken, bucket, objectPath)) {
      return Response.json({ alreadyExists: true, importKey, objectPath });
    }

    const uploadUrl = await createResumableSession({
      accessToken,
      bucket,
      objectPath,
      body,
      importKey,
    });

    if (!uploadUrl) {
      return Response.json({ alreadyExists: true, importKey, objectPath });
    }

    return Response.json({ alreadyExists: false, uploadUrl, importKey, objectPath });
  } catch (error) {
    console.error('Google Drive import session error:', error);
    return Response.json({ error: 'アップロード先を作成できませんでした' }, { status: 500 });
  }
}
