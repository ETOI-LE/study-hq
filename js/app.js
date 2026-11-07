// App shell: routing, navigation, event delegation, keyboard shortcuts.
import { S, load, on, onSaveError, setMeta } from './store.js';
import { bus, icon, esc, toast, topModal, closeModal, fmtClock, modalStack, openModal, modalHead } from './ui.js';
import { dueMistakes, dueCards, cardsLeftToday } from './logic.js';
import * as session from './session.js';
import onboarding from './views/onboarding.js';
import todayView from './views/today.js';
import focusView from './views/focus.js';
import mistakesView, { openQuickAdd } from './views/mistakes.js';
import topicsView from './views/topics.js';
import settingsView from './views/settings.js';
import practiceView from './views/practice.js';
import papersView from './views/papers.js';
import cardsView from './views/cards.js';
import reviewView from './views/review.js';
import prepView from './views/prep.js';
import shareView from './views/share.js';

const VIEWS = {
  today: todayView,
  focus: focusView,
  mistakes: mistakesView,
  topics: topicsView,
  practice: practiceView,
  papers: papersView,
  cards: cardsView,
  review: reviewView,
  prep: prepView,
  share: shareView,
  settings: settingsView,
  onboarding,
};
// Which feature switch a page needs (pages without one are always available).
const NEEDS = { topics: 'topicTracker', practice: 'practiceLog', papers: 'papers', cards: 'flashcards', review: 'weeklyReview', prep: 'testPrep' };

let current = null;
let currentParams = [];

function parseHash() {
  const h = (location.hash || '#today').slice(1);
  const [name, ...params] = h.split('/');
  return { name: VIEWS[name] ? name : 'today', params: params.map(decodeURIComponent) };
}

function route() {
  let { name, params } = parseHash();
  // A share link opened before setup: keep the pack for after onboarding.
  if (name === 'share' && params[0] === 'import' && params[1] && (!S.profile || !S.profile.onboarded)) setMeta('pendingImport', params[1]);
  if (!S.profile || !S.profile.onboarded) name = 'onboarding';
  if (name === 'onboarding' && S.profile && S.profile.onboarded && !onboarding.isActive() && !['redo', 'edit'].includes(params[0])) name = 'today';
  if (NEEDS[name] && !on(NEEDS[name]) && name !== 'onboarding') name = 'today';
  const view = VIEWS[name];
  if (current && current !== view && current.unmount) current.unmount();
  const changedView = current !== view || params.join('/') !== currentParams.join('/');
  current = view; currentParams = params;
  current.name = name;
  if (view.enter && changedView) view.enter(params);
  render();
  if (changedView) { window.scrollTo(0, 0); playEnter(); }
}

// Gentle entrance animation when arriving on a page (not on in-page updates).
let enterTimer = null;
function playEnter() {
  const main = document.getElementById('main');
  main.classList.remove('enter');
  void main.offsetWidth;
  main.classList.add('enter');
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => main.classList.remove('enter'), 1400);
  countUp(main);
}
function countUp(root) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count); if (!Number.isFinite(end) || end <= 0) return;
    const suffix = el.dataset.suffix || '';
    const t0 = performance.now(), dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(end * e) + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = '0' + suffix;
    requestAnimationFrame(step);
  });
}
bus.playEnter = playEnter;

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

function navLinks() {
  const dueM = dueMistakes().length;
  const dueC = on('flashcards') ? Math.min(dueCards().length, cardsLeftToday()) : 0;
  return [
    { name: 'today', label: 'Today', icon: 'today', group: '' },
    { name: 'focus', label: 'Focus', icon: 'focus', kbd: 'S', group: '' },
    { name: 'mistakes', label: 'Mistakes', icon: 'mistakes', kbd: 'N', badge: dueM, group: 'Track' },
    { name: 'topics', label: 'Topics', icon: 'topics', group: 'Track' },
    { name: 'practice', label: 'Practice', icon: 'practice', group: 'Track' },
    { name: 'papers', label: 'Past papers', short: 'Papers', icon: 'papers', group: 'Track' },
    { name: 'cards', label: 'Flashcards', short: 'Cards', icon: 'cards', badge: dueC, group: 'Review' },
    { name: 'review', label: 'Weekly review', short: 'Review', icon: 'review', group: 'Review' },
    { name: 'prep', label: 'Test prep', icon: 'prep', group: 'Review' },
    { name: 'share', label: 'Share packs', short: 'Share', icon: 'share', group: 'More', need: 'sharePacks' },
    { name: 'settings', label: 'Settings', icon: 'settings', group: 'More' },
  ].filter((l) => { const k = l.need || NEEDS[l.name]; return !k || on(k); });
}

function renderNav() {
  const nav = document.getElementById('nav');
  const links = navLinks();
  const curName = current?.name;
  const link = (l, cls = '', short = false) => `<a class="nav-link ${cls}${curName === l.name ? ' on' : ''}" href="#${l.name}"${curName === l.name ? ' aria-current="page"' : ''}>${icon(l.icon, short ? 22 : 19)}<span>${short ? (l.short || l.label) : l.label}</span>${l.badge ? `<span class="badge" aria-label="${l.badge} ready">${l.badge}</span>` : ''}${!short && l.kbd ? `<span class="kbd">${l.kbd}</span>` : ''}</a>`;
  // Desktop: grouped sidebar.
  let wide = ''; let lastGroup = null;
  for (const l of links) {
    if (l.group !== lastGroup) { if (l.group && l.group !== 'More') wide += `<div class="nav-group">${l.group}</div>`; else if (l.group === 'More') wide += '<div class="nav-group">&nbsp;</div>'; lastGroup = l.group; }
    wide += link(l, 'nav-wide');
  }
  // Phone: four main tabs plus More.
  const primary = ['today', 'focus', 'mistakes', on('flashcards') ? 'cards' : on('topicTracker') ? 'topics' : 'settings'];
  const main4 = primary.map((n) => links.find((l) => l.name === n)).filter(Boolean);
  const rest = links.filter((l) => !main4.includes(l));
  const restOn = rest.some((l) => l.name === curName);
  const narrow = main4.map((l) => link(l, 'nav-narrow', true)).join('')
    + (rest.length ? `<button class="nav-link nav-narrow${restOn ? ' on' : ''}" data-navmore aria-label="More sections">${icon('more', 22)}<span>More</span></button>` : '');
  nav.innerHTML = `
    <div class="brand"><img src="icons/icon.svg" alt="">Study HQ</div>
    ${wide}${narrow}
    <div id="nav-timer-slot"></div>
    <div class="nav-foot"><span class="kbd">S</span> start · <span class="kbd">N</span> mistake · <span class="kbd">/</span> search</div>`;
  nav.querySelector('[data-navmore]')?.addEventListener('click', () => openMore(rest, curName));
  updateNavTimer();
}

let moreOpen = null;
function openMore(rest, curName) {
  if (moreOpen && modalStack.includes(moreOpen)) return;
  const m = moreOpen = openModal({
    html: () => `${modalHead('All sections')}<div class="more-grid">${rest.map((l) => `<a href="#${l.name}" class="${curName === l.name ? 'on' : ''}" data-act="go">${icon(l.icon, 24)}<span>${esc(l.label)}</span></a>`).join('')}</div>`,
    on: { go: () => closeModal(m) },
  });
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
  const live = a.phase === 'sprint' && !a.paused;
  const html = `<a class="nav-timer" href="#focus">${live ? '<span class="live"></span>' : ''}${esc(text)}</a>`;
  const el = slot.querySelector('.nav-timer');
  if (el && slot.dataset.live === String(live)) { el.lastChild.textContent = text; return; }
  slot.dataset.live = String(live);
  slot.innerHTML = html;
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
