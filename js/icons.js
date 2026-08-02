// アプリ全体で使う端末非依存のラインアイコン。
// finance/js/icons.js で採用済みの 24px ラインアイコン設計を共通UIへ展開する。
const PATHS = {
  home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H9v-6h6v6h2.5a1 1 0 0 0 1-1V9.5"/>',
  check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1 7 4.5-2.5 4.5 2.5-1-7"/><path d="m9.5 9 1.7 1.7 3.5-3.5"/>',
  coins: '<circle cx="9" cy="9" r="5.5"/><path d="M15 5a5.5 5.5 0 0 1 0 11"/><path d="M9 6.8v4.4M7.2 8.2h2.2a1 1 0 0 1 0 2H8.4a1 1 0 0 0 0 2h2"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M8.4 14.5A6 6 0 1 1 15.6 14.5C14.8 15.1 14.5 16 14.5 17h-5c0-1-.3-1.9-1.1-2.5Z"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 9.5h19M6 15h3"/>',
  sparkles: '<path d="m12 2 1.3 4.7L18 8l-4.7 1.3L12 14l-1.3-4.7L6 8l4.7-1.3L12 2Z"/><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14ZM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17 14.5a5.8 5.8 0 0 1 4.5 5.5"/>',
  folder: '<path d="M3.5 6.2a1 1 0 0 1 1-1h4.4l1.6 1.9h9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6.2Z"/>',
  box: '<path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/>',
  shirt: '<path d="m8 4-5 3 2.5 4L8 9v11h8V9l2.5 2L21 7l-5-3c-.7 1.2-2 2-4 2s-3.3-.8-4-2Z"/>',
  sofa: '<path d="M5 12V9a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M4 11a2 2 0 0 0-2 2v5h20v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-2-2ZM5 18v3M19 18v3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3.5 3 2.5-2 5 4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  cloud: '<path d="M6.5 18.5h11a4 4 0 0 0 .4-8 6 6 0 0 0-11.5-1.2A4.6 4.6 0 0 0 6.5 18.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  weather: '<path d="M7 18.5h10a3.5 3.5 0 0 0 .4-7A5.3 5.3 0 0 0 7.2 10 4.3 4.3 0 0 0 7 18.5Z"/><path d="M8 5.5 6.5 4M12 4V2M16 5.5 17.5 4"/>',
  palette: '<path d="M12 3C6.8 3 2.5 6.8 2.5 11.5c0 3.3 2.5 5.5 5.5 5.5h1c.8 0 1.5.6 1.5 1.4 0 .4-.2.8-.4 1-.2.2-.3.5-.3.8 0 1 .8 1.8 1.9 1.8 5.4 0 9.8-4 9.8-9 0-5.6-4.3-10-9.5-10Z"/><circle cx="7" cy="10" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="14.5" cy="7.2" r="1" fill="currentColor"/><circle cx="17" cy="11" r="1" fill="currentColor"/>',
  newspaper: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h4v4H7ZM14 8h3M14 11h3M7 15h10M7 18h7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.4"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/>',
  settings: '<circle cx="12" cy="12" r="2.7"/><path d="M12 3v2.4M12 18.6V21M4.2 7.5l2 1.2M17.8 15.3l2 1.2M19.8 7.5l-2 1.2M6.2 15.3l-2 1.2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  bookmark: '<path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-3.7L6 21V4.5a1 1 0 0 1 1-1Z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8 9h8M8 13h8M8 17h5"/>',
  pin: '<path d="m14 4 6 6-3 1-4 4-1 5-2-6-6-2 5-1 4-4 1-3Z"/><path d="m4 20 6-6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-5 2 2-5 5-2Z"/>',
  tools: '<path d="M15.3 4.5a4 4 0 0 0-5.2 4.9L4.6 14.9a1.7 1.7 0 0 0 2.4 2.4l5.5-5.5a4 4 0 0 0 4.9-5.2l-2.6 2.6-2-.6-.6-2Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  chart: '<path d="M4 20V4M4 20h16M8 20v-6M13 20V9M18 20v-9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>',
  link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.6 1.6M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.6-1.6"/>',
  trash: '<path d="M3.5 6.5h17M8.5 6.5V4.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2M6 6.5l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 8-2.5 8h17s-2.5-2-2.5-8M13.5 20.5a2 2 0 0 1-3 0"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12.5 15H17"/>',
  cart: '<path d="M3 4h2l2.2 10.5h9.9L20 7H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  save: '<path d="M5 3h12l2 2v16H5Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  broom: '<path d="m14 4 6 6M17 7 9 15"/><path d="M9 13 4 18l2 2 5-5M3 21h9"/>',
  handshake: '<path d="m8 12 3-3 2 2a2 2 0 0 0 3 0l1-1"/><path d="m3 8 4-3 3 2M21 8l-4-3-3 2M4 9l5 9a2 2 0 0 0 3 0 2 2 0 0 0 3-1 2 2 0 0 0 3-2l2-6"/>',
  repeat: '<path d="m17 2.5 3.5 3.5-3.5 3.5M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5M7 21.5 3.5 18 7 14.5M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5"/>',
  camera: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 6 1.5-2h5L16 6"/><circle cx="12" cy="13" r="4"/>',
  book: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5c-.8 0-1.5.7-1.5 1.5v-16ZM20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5.7 1.5 1.5v-16Z"/>',
  heart: '<path d="M20.8 8.8c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11a4.8 4.8 0 0 1 8.8-2.6 4.8 4.8 0 0 1 8.8 2.6Z"/>',
  bowl: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M7 19h10M8 8c0-1.4 1.4-1.6 1.4-3M12 8c0-1.4 1.4-1.6 1.4-3M16 8c0-1.4 1.4-1.6 1.4-3"/>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Z"/><path d="M13 7v10"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  volume: '<path d="M4 10h4l5-4v12l-5-4H4Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  monitor: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/>',
  graduation: '<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11.5V16c3.2 2.7 8.8 2.7 12 0v-4.5M22 9v6"/>',
  robot: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M9 13h.01M15 13h.01M8 17h8"/>',
  alert: '<path d="M10.3 3.9 2.3 18a1.5 1.5 0 0 0 1.3 2.2h16.8a1.5 1.5 0 0 0 1.3-2.2l-8-14.1a1.5 1.5 0 0 0-2.6 0Z"/><path d="M12 9.5v4.5M12 17.5h.01"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',
  file: '<path d="M6.5 3h6l5 5v13h-11Z"/><path d="M12.5 3v5h5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-4.8"/>',
  tag: '<path d="M20.6 13.4 12.4 21.6a1.5 1.5 0 0 1-2.1 0L3 14.3V4a1 1 0 0 1 1-1h10.3l6.3 6.3a1.5 1.5 0 0 1 0 2.1Z"/><circle cx="7.8" cy="7.8" r="1.3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.6 2.6 0 1 1 3.2 2.5c-.8.3-.8.9-.8 1.7M12 17h.01"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
};

const GROUPS = {
  home: ['🏠','🏡','🏰'],
  check: ['✅','☑'],
  award: ['🎖️','🎖','🏆','🏅','👑'],
  coins: ['🪙','💰','💴'],
  bulb: ['💡','🌱','🔰'],
  card: ['🃏'],
  sparkles: ['✨','🌟','🎉','🎊','👏','🙌','💫','🎏','🔥','⚡'],
  user: ['👤','🙂','😊','👩','👨','👨‍💻','🧑‍💻','👩‍🏫','👨‍💼','👩‍💼','🧑‍💼','👨‍🔧','🧑‍🎨'],
  users: ['👥','🤝'],
  folder: ['📁','📂','🗂','🗂️','📭','📦'],
  target: ['🎯','📌'],
  cloud: ['☁️','☁','⛅','🌫️','🌫','🌧️','🌧','🌦️','🌦','⛈️','⛈','🌨️','🌨','❄️','❄','⛄','☔'],
  sun: ['☀️','☀','🌞','🌤️','🌤','🌅','🌡️','🌡'],
  palette: ['🎨'],
  newspaper: ['📰','📃','📢'],
  edit: ['📝','✏️','✏','✎'],
  calendar: ['📅','🗓️','🗓','🕘','⏰'],
  settings: ['⚙️','⚙'],
  mic: ['🎤'],
  globe: ['🌐','🇯🇵'],
  bookmark: ['🔖'],
  clipboard: ['📋'],
  compass: ['🧭'],
  tools: ['🛠','🛠️','🔧'],
  clock: ['⏱','🕒','⏳'],
  chart: ['📈','📊','📡'],
  search: ['🔍','🔎'],
  link: ['🔗','↔','↪'],
  trash: ['🗑','🗑️'],
  bell: ['🔔','🚨'],
  terminal: ['💻','🐧','⌨','⌨️','🖥️','🖥'],
  cart: ['🛒','🛍️'],
  save: ['💾','💽'],
  broom: ['🧹'],
  repeat: ['🔄','🔁','🔀','⬆','⬆️','⬇','⬇️'],
  camera: ['📷','🖼'],
  book: ['📘','📖','📚','🎓'],
  heart: ['💗','♥'],
  ticket: ['🎫'],
  lock: ['🔒','🔓','🔐'],
  volume: ['🔊','🔇','🎵'],
  monitor: ['📱'],
  graduation: ['🧠'],
  robot: ['🤖'],
  alert: ['⚠️','⚠','🤔','😢','😵'],
  play: ['▶','⏩'],
  file: ['📄'],
  key: ['🔑'],
  shield: ['🛡️'],
  tag: ['🏷️'],
  help: ['❔'],
  gift: ['🎁','🔮'],
  status: ['🟢','⚪','⬜'],
  other: ['🪑','🛋️','👕','👗','🌿','🎪','💬','🐾','🍚','🫧','🤗','🚗','🎬','🥤','👟','💳','🧱','🌄','🏗️','🌀','💪','🔌','✂️','🧪','🧩'],
};

const FALLBACKS = {
  gift: 'ticket',
  status: 'check',
  other: 'sparkles',
};

const EMOJI_TO_ICON = new Map();
Object.entries(GROUPS).forEach(([icon, emoji]) => {
  const resolved = PATHS[icon] ? icon : FALLBACKS[icon];
  emoji.forEach(value => EMOJI_TO_ICON.set(value, resolved));
});

const TOKENS = [...EMOJI_TO_ICON.keys()].sort((a, b) => b.length - a.length);
const TOKEN_RE = new RegExp(TOKENS.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');
const SKIP_SELECTOR = 'script,style,svg,code,pre,kbd,samp,input,textarea,select,[contenteditable="true"],[data-keep-emoji]';

export function iconHTML(name){
  const path = PATHS[name] || PATHS.sparkles;
  return `<svg class="ui-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${path}</svg>`;
}

function iconNode(name){
  const span = document.createElement('span');
  span.className = `ui-icon ui-icon--${name}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = iconHTML(name);
  return span;
}

function upgradeTextNode(node){
  const text = node.nodeValue || '';
  TOKEN_RE.lastIndex = 0;
  if(!TOKEN_RE.test(text)) return;
  TOKEN_RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let cursor = 0;
  let match;
  while((match = TOKEN_RE.exec(text))){
    if(match.index > cursor) frag.append(document.createTextNode(text.slice(cursor, match.index)));
    frag.append(iconNode(EMOJI_TO_ICON.get(match[0])));
    cursor = match.index + match[0].length;
  }
  if(cursor < text.length) frag.append(document.createTextNode(text.slice(cursor)));
  node.parentNode?.replaceChild(frag, node);
}

export function upgradeEmojiIcons(root = document){
  if(!root) return;
  if(root.nodeType === Node.TEXT_NODE){
    if(!root.parentElement?.closest(SKIP_SELECTOR)) upgradeTextNode(root);
    return;
  }
  if(root.nodeType === Node.ELEMENT_NODE && root.matches?.(SKIP_SELECTOR)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while((node = walker.nextNode())){
    if(!node.parentElement?.closest(SKIP_SELECTOR)) nodes.push(node);
  }
  nodes.forEach(upgradeTextNode);
}

let observer;
export function startIconUpgrade(){
  upgradeEmojiIcons(document.body);
  if(observer) return;
  observer = new MutationObserver(records => {
    records.forEach(record => {
      if(record.type === 'characterData') upgradeEmojiIcons(record.target);
      record.addedNodes.forEach(upgradeEmojiIcons);
    });
  });
  observer.observe(document.body, { childList:true, subtree:true, characterData:true });
}
