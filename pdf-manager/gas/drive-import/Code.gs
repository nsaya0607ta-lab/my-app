const MAX_FILE_SIZE = 49 * 1024 * 1024;
const MAX_FILES_PER_RUN = 10;

/**
 * Google Driveの取込待ちフォルダーからPDFを探し、
 * PDFフォルダーアプリのFirebase Storage受信箱へ送信する。
 *
 * 成功したPDFだけを処理済みフォルダーへ移動する。
 * 失敗したPDFは取込待ちフォルダーへ残し、次回のトリガーで再試行する。
 */
function importDrivePdfs() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('前回の取込処理が実行中のため終了します');
    return;
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    const apiUrl = requireProperty_(properties, 'IMPORT_API_URL');
    const secret = requireProperty_(properties, 'IMPORT_SECRET');
    const sourceFolderId = requireProperty_(properties, 'SOURCE_FOLDER_ID');
    const processedFolderId = requireProperty_(properties, 'PROCESSED_FOLDER_ID');

    if (sourceFolderId === processedFolderId) {
      throw new Error('SOURCE_FOLDER_ID と PROCESSED_FOLDER_ID は別のフォルダーを指定してください');
    }

    const sourceFolder = DriveApp.getFolderById(sourceFolderId);
    const processedFolder = DriveApp.getFolderById(processedFolderId);
    const files = sourceFolder.getFilesByType(MimeType.PDF);

    let attempted = 0;
    let completed = 0;

    while (files.hasNext() && attempted < MAX_FILES_PER_RUN) {
      const file = files.next();
      attempted += 1;

      try {
        const size = file.getSize();
        if (size <= 0) {
          console.warn(`空のPDFをスキップしました: ${file.getName()}`);
          continue;
        }
        if (size > MAX_FILE_SIZE) {
          console.warn(`49MBを超えているためスキップしました: ${file.getName()}`);
          continue;
        }

        const session = createUploadSession_(apiUrl, secret, file);
        if (!session.alreadyExists) {
          uploadPdf_(session.uploadUrl, file.getBlob());
        }

        // Firebase Storageへの保存が完了した場合だけDrive側を処理済みにする。
        file.moveTo(processedFolder);
        completed += 1;
        console.log(`取り込み完了: ${file.getName()}`);
      } catch (error) {
        console.error(`取り込み失敗: ${file.getName()}`, error);
      }
    }

    console.log(`Google Drive PDF取込: ${completed}/${attempted} 件完了`);
  } finally {
    lock.releaseLock();
  }
}

function createUploadSession_(apiUrl, secret, file) {
  const response = UrlFetchApp.fetch(apiUrl, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: {
      'x-import-secret': secret,
    },
    payload: JSON.stringify({
      driveFileId: file.getId(),
      name: file.getName(),
      size: file.getSize(),
      modifiedTime: file.getLastUpdated().toISOString(),
      mimeType: 'application/pdf',
    }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`アップロード先の作成に失敗しました: HTTP ${status} ${text}`);
  }

  const result = JSON.parse(text);
  if (!result.alreadyExists && !result.uploadUrl) {
    throw new Error('Vercel APIからアップロードURLが返されませんでした');
  }

  return result;
}

function uploadPdf_(uploadUrl, blob) {
  const bytes = blob.getBytes();
  if (bytes.length === 0) throw new Error('PDFの内容が空です');

  const response = UrlFetchApp.fetch(uploadUrl, {
    method: 'put',
    contentType: 'application/pdf',
    headers: {
      'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
    },
    payload: bytes,
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status !== 200 && status !== 201) {
    throw new Error(
      `Firebase Storageへのアップロードに失敗しました: HTTP ${status} ${response.getContentText()}`,
    );
  }
}

function requireProperty_(properties, name) {
  const value = properties.getProperty(name);
  if (!value) throw new Error(`スクリプトプロパティ ${name} が未設定です`);
  return value;
}

/**
 * 10分ごとの時間主導トリガーを作成する。
 * 同じ関数の既存トリガーは削除してから作り直す。
 */
function installImportTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'importDrivePdfs')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('importDrivePdfs')
    .timeBased()
    .everyMinutes(10)
    .create();

  console.log('Google Drive PDF取込トリガーを10分間隔で作成しました');
}
