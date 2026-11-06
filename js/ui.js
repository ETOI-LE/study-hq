// Small UI helpers: escaping, icons, modals, toasts, confirm, and a refresh bus.
import { S } from './store.js';
import { subjectById, subjectLabel } from './logic.js';

export const bus = { refresh: () => {}, go: (hash) => { location.hash = hash; } };

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICONS = {
  today: '<path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  mistakes: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 12h8M8 16h5"/>',
  topics: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  redo: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>',
  print: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
};

export function icon(name, size = 20) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function subjectDot(subjectId) {
  const s = subjectById(subjectId);
  return `<span class="dot" style="background:${esc(s?.color || 'var(--muted)')}"></span>`;
}

export function subjectTag(subjectId) {
  const s = subjectById(subjectId);
  if (!s) return '';
  return `<span class="tag" style="--c:${esc(s.color)}">${esc(subjectLabel(s))}</span>`;
}

// ---------- Toasts ----------
let toastTimer = null;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Modals ----------
// A modal is { html: () => string, on: {act: fn}, mount?(el), wide?, full?, onClose? }
export const modalStack = [];

export function openModal(m) {
  const root = document.getElementById('modals');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap' + (m.full ? ' full' : '');
  wrap.innerHTML = `<div class="modal-backdrop" data-act="__close"></div><div class="modal${m.wide ? ' wide' : ''}" role="dialog" aria-modal="true"></div>`;
  root.appendChild(wrap);
  m.el = wrap;
  m.body = wrap.querySelector('.modal');
  modalStack.push(m);
  renderModal(m);
  document.body.classList.add('modal-open');
  const first = m.body.querySelector('[autofocus]') || m.body.querySelector('input,textarea,select,button');
  if (first && window.matchMedia('(pointer: fine)').matches) setTimeout(() => first.focus(), 30);
  return m;
}

export function renderModal(m) {
  m.body.innerHTML = m.html();
  if (m.mount) m.mount(m.body);
}

export function closeModal(m = modalStack[modalStack.length - 1]) {
  if (!m) return;
  const i = modalStack.indexOf(m);
  if (i >= 0) modalStack.splice(i, 1);
  m.el.remove();
  if (!modalStack.length) document.body.classList.remove('modal-open');
  if (m.onClose) m.onClose();
}

export function topModal() { return modalStack[modalStack.length - 1] || null; }

export function modalHead(title, sub = '') {
  return `<div class="modal-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted small">${esc(sub)}</p>` : ''}</div>
    <button class="icon-btn" data-act="__close" aria-label="Close">${icon('close')}</button></div>`;
}

/** In-app confirm (the browser's confirm() is not used). Resolves true/false. */
export function confirmDialog(title, text, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      html: () => `${modalHead(title)}<p>${esc(text)}</p>
        <div class="row-actions end"><button class="btn" data-act="no">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes" autofocus>${esc(okLabel)}</button></div>`,
      on: {
        yes: () => { result = true; closeModal(); },
        no: () => closeModal(),
      },
      onClose: () => resolve(result),
    });
  });
}

// ---------- Formatting ----------
export function fmtDay(iso) {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(iso + 'T00:00') : new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export function fmtClock(ms) {
  const neg = ms < 0; ms = Math.abs(ms);
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60), s = total % 60;
  return `${neg ? '-' : ''}${m}:${String(s).padStart(2, '0')}`;
}
export function plural(n, word, pl = word + 's') { return `${n} ${n === 1 ? word : pl}`; }

export function emptyState(title, text, example = '', actionHtml = '') {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${example ? `<p class="example">${esc(example)}</p>` : ''}${actionHtml}</div>`;
}

// Choice chips: <button class="chip" aria-pressed>
export function chips(name, options, selected, { multi = false, act = 'chip' } = {}) {
  const sel = multi ? new Set(selected || []) : new Set([selected]);
  return `<div class="chips" role="group">${options.map((o) => {
    const val = typeof o === 'object' ? o.value : o;
    const label = typeof o === 'object' ? o.label : o;
    const pressed = sel.has(val);
    return `<button type="button" class="chip${pressed ? ' on' : ''}" aria-pressed="${pressed}" data-act="${act}" data-name="${esc(name)}" data-value="${esc(val)}">${o.dot ? `<span class="dot" style="background:${esc(o.dot)}"></span>` : ''}${esc(label)}</button>`;
  }).join('')}</div>`;
}

export function subjectOptions() {
  return S.subjects.map((s) => ({ value: s.id, label: subjectLabel(s), dot: s.color }));
}

export function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
