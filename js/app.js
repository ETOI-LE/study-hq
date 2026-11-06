// App shell: routing, navigation, event delegation, keyboard shortcuts.
import { S, load, on, onSaveError } from './store.js';
import { bus, icon, esc, toast, topModal, closeModal, fmtClock, modalStack } from './ui.js';
import * as session from './session.js';
import onboarding from './views/onboarding.js';
import todayView from './views/today.js';
import focusView from './views/focus.js';
import mistakesView, { openQuickAdd } from './views/mistakes.js';
import topicsView from './views/topics.js';
import settingsView from './views/settings.js';

const VIEWS = {
  today: todayView,
  focus: focusView,
  mistakes: mistakesView,
  topics: topicsView,
  settings: settingsView,
  onboarding,
};

let current = null;
let currentParams = [];

function parseHash() {
  const h = (location.hash || '#today').slice(1);
  const [name, ...params] = h.split('/');
  return { name: VIEWS[name] ? name : 'today', params: params.map(decodeURIComponent) };
}

function route() {
  let { name, params } = parseHash();
  if (!S.profile || !S.profile.onboarded) name = 'onboarding';
  if (name === 'onboarding' && S.profile && S.profile.onboarded && !onboarding.isActive() && !['redo', 'edit'].includes(params[0])) name = 'today';
  const view = VIEWS[name];
  if (current && current !== view && current.unmount) current.unmount();
  const changedView = current !== view || params.join('/') !== currentParams.join('/');
  current = view; currentParams = params;
  current.name = name;
  if (view.enter && changedView) view.enter(params);
  render();
  if (changedView) window.scrollTo(0, 0);
}

export function render() {
  const main = document.getElementById('main');
  const nav = document.getElementById('nav');
  const bare = current === onboarding;
  document.getElementById('app').classList.toggle('no-nav', bare);
  nav.classList.toggle('hidden', bare);
  main.classList.toggle('bare', bare);
  if (!bare) renderNav();
  main.innerHTML = current.render(currentParams);
  if (current.mount) current.mount(main, currentParams);
}

function renderNav() {
  const nav = document.getElementById('nav');
  const links = [
    { name: 'today', label: 'Today', icon: 'today' },
    { name: 'focus', label: 'Focus', icon: 'focus', kbd: 'S' },
    { name: 'mistakes', label: 'Mistakes', icon: 'mistakes', kbd: 'N' },
    ...(on('topicTracker') ? [{ name: 'topics', label: 'Topics', icon: 'topics' }] : []),
    { name: 'settings', label: 'Settings', icon: 'settings' },
  ];
  const curName = current?.name;
  nav.innerHTML = `
    <div class="brand"><img src="icons/icon.svg" alt="">Study HQ</div>
    ${links.map((l) => `<a class="nav-link${curName === l.name ? ' on' : ''}" href="#${l.name}"${curName === l.name ? ' aria-current="page"' : ''}>${icon(l.icon, 22)}<span>${l.label}</span>${l.kbd ? `<span class="kbd">${l.kbd}</span>` : ''}</a>`).join('')}
    <div id="nav-timer-slot"></div>
    <div class="nav-foot">Shortcuts: <span class="kbd">N</span> new mistake · <span class="kbd">S</span> start · <span class="kbd">/</span> search</div>`;
  updateNavTimer();
}

function updateNavTimer() {
  const slot = document.getElementById('nav-timer-slot');
  if (!slot) return;
  const a = session.active();
  if (!a || current?.name === 'focus' || current === onboarding) { slot.innerHTML = ''; return; }
  let text = '';
  if (a.phase === 'sprint') text = `Sprint ${fmtClock(session.remainingMs(a))}${a.paused ? ' · paused' : ''}`;
  else if (a.phase === 'break') text = `Break ${fmtClock(session.remainingMs(a))}`;
  else if (a.phase === 'breakDone') text = 'Break’s over — next sprint';
  else if (a.phase === 'ritual') text = 'Session ready to start';
  else text = 'Finish your session review';
  slot.innerHTML = `<a class="nav-timer" href="#focus">${esc(text)}</a>`;
}

// ---------- Event delegation ----------
function handlerFor(el) {
  const inModal = el.closest('.modal-wrap');
  if (inModal) {
    const m = modalStack.find((x) => x.el === inModal);
    return m ? m.on || {} : {};
  }
  return current?.on || {};
}

function delegate(type, attr) {
  document.addEventListener(type, (ev) => {
    const el = ev.target.closest(`[${attr}]`);
    if (!el) return;
    const name = el.getAttribute(attr);
    if (name === '__close') { const m = topModal(); if (m) closeModal(m); return; }
    const h = handlerFor(el)[name];
    if (h) {
      if (type === 'submit') ev.preventDefault();
      h(el, ev);
    }
  });
}

delegate('click', 'data-act');
delegate('input', 'data-input');
delegate('change', 'data-change');
delegate('submit', 'data-submit');

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { const m = topModal(); if (m) { closeModal(m); ev.preventDefault(); } return; }
  const t = ev.target;
  const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (!S.profile?.onboarded || current === onboarding) return;
  if (topModal()) return;
  const k = ev.key.toLowerCase();
  if (k === 'n') { ev.preventDefault(); openQuickAdd(); }
  else if (k === 's') {
    ev.preventDefault();
    if (session.active()) bus.go('#focus');
    else { focusView.prefill(null); bus.go('#focus'); if (current === focusView) route(); }
  } else if (ev.key === '/') {
    ev.preventDefault();
    const box = document.querySelector('#main input[type=search]');
    if (box) box.focus();
    else { mistakesView.focusSearchNext = true; bus.go('#mistakes'); }
  }
});

// ---------- Timer tick (UI only; the engine is timestamp-based) ----------
function tickLoop() {
  const advanced = session.tick();
  if (advanced) {
    if (current?.name === 'focus') render(); else updateNavTimer();
  } else {
    if (current?.name === 'focus' && focusView.updateClock) focusView.updateClock();
    updateNavTimer();
  }
}
setInterval(tickLoop, 250);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickLoop(); });

// ---------- Boot ----------
bus.refresh = () => render();
bus.go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
bus.route = route;
session.onSessionChange(() => {
  if (current?.name === 'focus') render(); else updateNavTimer();
});
onSaveError((e) => { console.error(e); toast('Couldn’t save — your browser storage may be full or blocked.', 5000); });

export function applyTheme() {
  const t = S.settings?.theme || 'system';
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { localStorage.setItem('shq-theme', t); } catch { /* ignore */ }
}
bus.applyTheme = applyTheme;

async function boot() {
  try {
    await load();
  } catch (e) {
    document.getElementById('main').innerHTML = `<div class="empty"><h3>Study HQ can’t open its storage</h3><p>${esc(e.message || e)}</p><p class="small">Private/incognito windows sometimes block storage. Try a normal window.</p></div>`;
    return;
  }
  applyTheme();
  session.restore();
  window.addEventListener('hashchange', route);
  route();
  // Ask the browser to keep this data even when disk space is low.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* ignore */ }
  // (Skipped on localhost so development edits show up straight away.)
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
