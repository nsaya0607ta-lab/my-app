import { S } from './state.js';
import { go } from './render.js';
import {
  mpActiveBoardId,
  mpBoardMeta,
  mpCanMoveEntry,
  mpCreateBoard,
  mpCreateFolder,
  mpDeleteBoard,
  mpDeleteFolder,
  mpFolderChain,
  mpFolderMeta,
  mpListBoards,
  mpListFolders,
  mpMoveEntry,
  mpRenameBoard,
  mpRenameFolder,
  mpSwitchBoard,
  mpTotalBoardCount,
} from './mindpalette.js';

const app = document.getElementById('app');
let currentFolderId = null;
let rendering = false;
let previousScreen = S.screen;
let dragPayload = null;
let toastTimer = null;

function esc(value){
  return String(value == null ? '' : value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function relativeTime(ts){
  const diff = Math.max(0, Date.now() - (Number(ts) || 0));
  const minute = 60 * 1000, hour = 60 * minute, day = 24 * hour;
  if(diff < minute) return 'たった今';
  if(diff < hour) return `${Math.floor(diff / minute)}分前`;
  if(diff < day) return `${Math.floor(diff / hour)}時間前`;
  if(diff < day * 30) return `${Math.floor(diff / day)}日前`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function showToast(message, isError){
  let toast = document.getElementById('mpx-toast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'mpx-toast';
    toast.className = 'mpx-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', !!isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function closeOverlay(overlay){
  if(!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => { try{ overlay.remove(); }catch(e){} }, 160);
}

function makeOverlay(html, className){
  const overlay = document.createElement('div');
  overlay.className = `mpx-overlay${className ? ` ${className}` : ''}`;
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target === overlay) closeOverlay(overlay); });
  requestAnimationFrame(() => overlay.classList.add('show'));
  return overlay;
}

function entryMeta(type, id){
  return type === 'folder' ? mpFolderMeta(id) : mpBoardMeta(id);
}

function currentFolderName(){
  const meta = currentFolderId ? mpFolderMeta(currentFolderId) : null;
  return meta ? meta.name : 'ルート';
}

function ensureCurrentFolder(){
  if(currentFolderId && !mpFolderMeta(currentFolderId)) currentFolderId = null;
}

function breadcrumbHTML(folderId, attrName){
  const chain = folderId ? mpFolderChain(folderId) : [];
  const items = [{id:'', name:'ルート'}, ...chain];
  return `<div class="mpx-breadcrumb">${items.map((item, index) => `
    ${index ? '<span class="mpx-breadcrumb-sep">›</span>' : ''}
    <button type="button" class="mpx-crumb${index === items.length-1 ? ' active' : ''}" ${attrName}="${esc(item.id)}">${index ? '📁' : '🖥️'} ${esc(item.name)}</button>
  `).join('')}</div>`;
}

function rowHTML(item, type){
  const active = type === 'file' && item.id === mpActiveBoardId();
  const detail = type === 'folder'
    ? `${item.fileCount}ファイル${item.childCount ? ` ・ ${item.childCount}フォルダ` : ''}`
    : `付箋 ${item.count}件 ・ ${relativeTime(item.updatedAt)}`;
  return `
    <div class="mpx-row${active ? ' active' : ''}" data-entry-type="${type}" data-entry-id="${esc(item.id)}" draggable="true">
      <button type="button" class="mpx-row-main" data-open-${type}="${esc(item.id)}">
        <span class="mpx-entry-icon" aria-hidden="true">${type === 'folder' ? '📁' : '📝'}</span>
        <span class="mpx-entry-text">
          <span class="mpx-entry-name">${esc(item.name)}${active ? '<em>表示中</em>' : ''}</span>
          <span class="mpx-entry-meta">${esc(detail)}</span>
        </span>
        <span class="mpx-entry-chevron">›</span>
      </button>
      <button type="button" class="mpx-menu-btn" data-entry-menu="${type}:${esc(item.id)}" aria-label="${esc(item.name)}のメニュー" title="メニュー">•••</button>
    </div>`;
}

function renderExplorer(){
  if(rendering || S.screen !== 'mind-palette-folders' || !app) return;
  rendering = true;
  ensureCurrentFolder();
  const folders = mpListFolders(currentFolderId);
  const files = mpListBoards(currentFolderId);
  const parent = currentFolderId ? mpFolderMeta(currentFolderId) : null;

  app.innerHTML = `
    <div data-mp-explorer-root>
      <div class="q-head">
        <button type="button" class="quit" id="mpx-back">← マインド・パレット</button>
        <span class="q-count">📁 ファイル</span>
      </div>
      <div class="mpx-location-bar">
        ${breadcrumbHTML(currentFolderId, 'data-mpx-crumb')}
        <button type="button" class="mpx-up-btn" id="mpx-up"${currentFolderId ? '' : ' disabled'} aria-label="一つ上の階層へ">↑ 上へ</button>
      </div>
      <div class="mpx-toolbar">
        <button type="button" class="mpx-create-btn" id="mpx-new-folder">＋ 新しいフォルダ</button>
        <button type="button" class="mpx-create-btn primary" id="mpx-new-file">＋ 新しいファイル</button>
      </div>
      <div class="mpx-drop-root" id="mpx-root-drop" data-root-drop>ルートへドロップ</div>
      <div class="mpx-list" aria-label="${esc(currentFolderName())}の内容">
        ${folders.map(f => rowHTML(f, 'folder')).join('')}
        ${files.map(f => rowHTML(f, 'file')).join('')}
        ${!folders.length && !files.length ? '<div class="mpx-empty">このフォルダは空です。<br>新しいフォルダまたはファイルを作成できます。</div>' : ''}
      </div>
    </div>`;

  app.querySelector('#mpx-back').onclick = () => go('mind-palette');
  app.querySelectorAll('[data-mpx-crumb]').forEach(btn => btn.onclick = () => {
    currentFolderId = btn.dataset.mpxCrumb || null;
    renderExplorer();
  });
  const up = app.querySelector('#mpx-up');
  if(up && !up.disabled) up.onclick = () => {
    currentFolderId = parent ? (parent.parentId || null) : null;
    renderExplorer();
  };

  app.querySelector('#mpx-new-folder').onclick = () => openRenameDialog('folder', null, '', true);
  app.querySelector('#mpx-new-file').onclick = () => openRenameDialog('file', null, '', true);

  app.querySelectorAll('[data-open-folder]').forEach(btn => btn.onclick = () => {
    currentFolderId = btn.dataset.openFolder;
    renderExplorer();
  });
  app.querySelectorAll('[data-open-file]').forEach(btn => btn.onclick = () => {
    if(mpSwitchBoard(btn.dataset.openFile)) go('mind-palette');
    else showToast('ファイルを開けませんでした。', true);
  });
  app.querySelectorAll('[data-entry-menu]').forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    const [type, id] = btn.dataset.entryMenu.split(':');
    openEntryMenu(type, id);
  });

  bindDragAndDrop();
  rendering = false;
}

function openEntryMenu(type, id){
  const meta = entryMeta(type, id);
  if(!meta){ showToast('対象が見つかりません。', true); return; }
  const overlay = makeOverlay(`
    <div class="mpx-action-sheet" role="dialog" aria-modal="true">
      <div class="mpx-action-title">${type === 'folder' ? '📁' : '📝'} ${esc(meta.name)}</div>
      <button type="button" data-action="rename">✎ 名前を変更</button>
      <button type="button" data-action="move">↪ 移動</button>
      <button type="button" class="danger" data-action="delete">🗑 削除</button>
      <button type="button" class="cancel" data-action="cancel">キャンセル</button>
    </div>`, 'mpx-action-overlay');
  overlay.querySelector('[data-action="cancel"]').onclick = () => closeOverlay(overlay);
  overlay.querySelector('[data-action="rename"]').onclick = () => {
    closeOverlay(overlay);
    openRenameDialog(type, id, meta.name, false);
  };
  overlay.querySelector('[data-action="move"]').onclick = () => {
    closeOverlay(overlay);
    openMoveDialog(type, id);
  };
  overlay.querySelector('[data-action="delete"]').onclick = () => {
    closeOverlay(overlay);
    deleteEntry(type, id);
  };
}

function openRenameDialog(type, id, currentName, creating){
  const label = type === 'folder' ? 'フォルダ' : 'ファイル';
  const overlay = makeOverlay(`
    <div class="mpx-dialog" role="dialog" aria-modal="true">
      <div class="mpx-dialog-title">${creating ? `新しい${label}` : `${label}名を変更`}</div>
      <input type="text" class="mpx-dialog-input" maxlength="30" value="${esc(currentName)}" placeholder="${label}名">
      <div class="mpx-dialog-error" aria-live="polite"></div>
      <div class="mpx-dialog-actions">
        <button type="button" class="secondary" data-cancel>キャンセル</button>
        <button type="button" class="primary" data-save>${creating ? '作成' : '保存'}</button>
      </div>
    </div>`);
  const input = overlay.querySelector('input');
  const error = overlay.querySelector('.mpx-dialog-error');
  overlay.querySelector('[data-cancel]').onclick = () => closeOverlay(overlay);
  const submit = () => {
    const name = input.value.trim();
    if(!name){ error.textContent = `${label}名を入力してください。`; input.focus(); return; }
    let ok = false;
    if(creating){
      if(type === 'folder') ok = !!mpCreateFolder(name, currentFolderId);
      else ok = !!mpCreateBoard(name, currentFolderId);
    }else{
      ok = type === 'folder' ? mpRenameFolder(id, name) : mpRenameBoard(id, name);
    }
    if(!ok){ error.textContent = `${label}を${creating ? '作成' : '変更'}できませんでした。`; return; }
    closeOverlay(overlay);
    renderExplorer();
    showToast(`「${name}」を${creating ? '作成' : '更新'}しました`);
  };
  overlay.querySelector('[data-save]').onclick = submit;
  input.addEventListener('keydown', e => { if(e.key === 'Enter') submit(); });
  setTimeout(() => { input.focus(); input.select(); }, 40);
}

function deleteEntry(type, id){
  const meta = entryMeta(type, id);
  if(!meta){ showToast('削除対象が見つかりません。', true); return; }
  if(type === 'file' && mpTotalBoardCount() <= 1){
    showToast('最後のファイルは削除できません。', true);
    return;
  }
  const detail = type === 'folder'
    ? '中のファイルとサブフォルダも削除されます。'
    : 'ファイル内の付箋と接続も削除されます。';
  if(!confirm(`「${meta.name}」を削除しますか？\n${detail}`)) return;
  const ok = type === 'folder' ? mpDeleteFolder(id) : mpDeleteBoard(id);
  if(!ok){ showToast('削除できませんでした。', true); return; }
  if(type === 'folder' && currentFolderId === id) currentFolderId = null;
  renderExplorer();
  showToast(`「${meta.name}」を削除しました`);
}

function openMoveDialog(type, id){
  const source = entryMeta(type, id);
  if(!source){ showToast('移動対象が見つかりません。', true); return; }
  let destinationId = source.parentId || null;
  const overlay = makeOverlay(`
    <div class="mpx-move-dialog" role="dialog" aria-modal="true">
      <div class="mpx-dialog-title">「${esc(source.name)}」の移動先</div>
      <div class="mpx-move-body"></div>
      <div class="mpx-dialog-error" aria-live="polite"></div>
      <div class="mpx-dialog-actions">
        <button type="button" class="secondary" data-move-cancel>キャンセル</button>
        <button type="button" class="primary" data-move-confirm>ここへ移動</button>
      </div>
    </div>`);
  const body = overlay.querySelector('.mpx-move-body');
  const error = overlay.querySelector('.mpx-dialog-error');

  function renderDestinations(){
    if(destinationId && !mpFolderMeta(destinationId)) destinationId = null;
    const folders = mpListFolders(destinationId);
    const current = destinationId ? mpFolderMeta(destinationId) : null;
    body.innerHTML = `
      ${breadcrumbHTML(destinationId, 'data-move-crumb')}
      <div class="mpx-move-current">
        <button type="button" class="mpx-up-btn" data-move-up${destinationId ? '' : ' disabled'}>↑ 一つ上へ</button>
        <span>移動先：<b>${esc(current ? current.name : 'ルート')}</b></span>
      </div>
      <div class="mpx-move-folder-list">
        ${folders.map(folder => {
          const check = mpCanMoveEntry(type, id, folder.id);
          return `<button type="button" class="mpx-move-folder${check.ok ? '' : ' disabled'}" data-move-folder="${esc(folder.id)}"${check.ok ? '' : ' disabled'} title="${esc(check.ok ? folder.name : check.reason)}">
            <span>📁 ${esc(folder.name)}</span><span>›</span>
          </button>`;
        }).join('') || '<div class="mpx-move-empty">この中にフォルダはありません。</div>'}
      </div>`;
    body.querySelectorAll('[data-move-crumb]').forEach(btn => btn.onclick = () => {
      destinationId = btn.dataset.moveCrumb || null;
      error.textContent = '';
      renderDestinations();
    });
    const up = body.querySelector('[data-move-up]');
    if(up && !up.disabled) up.onclick = () => {
      destinationId = current ? (current.parentId || null) : null;
      error.textContent = '';
      renderDestinations();
    };
    body.querySelectorAll('[data-move-folder]').forEach(btn => btn.onclick = () => {
      destinationId = btn.dataset.moveFolder;
      error.textContent = '';
      renderDestinations();
    });
  }

  overlay.querySelector('[data-move-cancel]').onclick = () => closeOverlay(overlay);
  overlay.querySelector('[data-move-confirm]').onclick = () => {
    const result = mpMoveEntry(type, id, destinationId);
    if(!result.ok){ error.textContent = result.reason || '移動できませんでした。'; return; }
    closeOverlay(overlay);
    renderExplorer();
    showToast(`「${result.itemName}」を「${result.destinationName}」へ移動しました`);
  };
  renderDestinations();
}

function parseDragData(event){
  if(dragPayload) return dragPayload;
  try{ return JSON.parse(event.dataTransfer.getData('application/x-mindpalette-entry')); }catch(e){ return null; }
}

function clearDropHighlights(){
  app.querySelectorAll('.mpx-drop-target').forEach(el => el.classList.remove('mpx-drop-target'));
}

function performDrop(payload, destinationFolderId){
  if(!payload) return;
  const result = mpMoveEntry(payload.type, payload.id, destinationFolderId || null);
  clearDropHighlights();
  dragPayload = null;
  if(!result.ok){ showToast(result.reason || '移動できませんでした。', true); return; }
  renderExplorer();
  showToast(`「${result.itemName}」を「${result.destinationName}」へ移動しました`);
}

function bindDropTarget(element, destinationFolderId){
  if(!element) return;
  element.addEventListener('dragenter', event => {
    const payload = parseDragData(event);
    if(!payload || !mpCanMoveEntry(payload.type, payload.id, destinationFolderId || null).ok) return;
    event.preventDefault();
    element.classList.add('mpx-drop-target');
  });
  element.addEventListener('dragover', event => {
    const payload = parseDragData(event);
    if(!payload || !mpCanMoveEntry(payload.type, payload.id, destinationFolderId || null).ok) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });
  element.addEventListener('dragleave', event => {
    if(!element.contains(event.relatedTarget)) element.classList.remove('mpx-drop-target');
  });
  element.addEventListener('drop', event => {
    const payload = parseDragData(event);
    if(!payload) return;
    event.preventDefault();
    performDrop(payload, destinationFolderId || null);
  });
}

function bindDragAndDrop(){
  app.querySelectorAll('.mpx-row[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', event => {
      dragPayload = { type:row.dataset.entryType, id:row.dataset.entryId };
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-mindpalette-entry', JSON.stringify(dragPayload));
      event.dataTransfer.setData('text/plain', row.dataset.entryId);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      dragPayload = null;
      clearDropHighlights();
    });
  });
  app.querySelectorAll('.mpx-row[data-entry-type="folder"]').forEach(row => bindDropTarget(row, row.dataset.entryId));
  bindDropTarget(app.querySelector('#mpx-root-drop'), null);
}

function onAppMutation(){
  const screen = S.screen;
  if(screen !== previousScreen){
    if(screen === 'mind-palette-folders') currentFolderId = null;
    previousScreen = screen;
  }
  if(screen === 'mind-palette-folders' && !app.querySelector('[data-mp-explorer-root]')){
    queueMicrotask(renderExplorer);
  }
}

if(app){
  new MutationObserver(onAppMutation).observe(app, { childList:true, subtree:false });
  onAppMutation();
}
