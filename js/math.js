// Maths notation on flashcards: text with $…$ (inline) or $$…$$ (display) is rendered with KaTeX.
// KaTeX lives in vendor/katex and is only loaded when a card actually contains maths.
import { esc } from './ui.js';

let loading = null;
export function loadKatex() {
  if (window.katex) return Promise.resolve(window.katex);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'vendor/katex/katex.min.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'vendor/katex/katex.min.js';
      s.onload = () => resolve(window.katex);
      s.onerror = () => { loading = null; reject(new Error('Maths renderer failed to load')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

// $…$ must hug its content ("$x^2$", not "$5 and $10") so prices in Economics cards stay as text.
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;

export const hasMath = (t) => { MATH_RE.lastIndex = 0; return MATH_RE.test(t || ''); };

/** Escaped HTML with placeholders for maths, filled in by renderMath(). */
export function mathHtml(text) {
  const src = String(text ?? '');
  let out = '', last = 0;
  MATH_RE.lastIndex = 0;
  let m;
  while ((m = MATH_RE.exec(src))) {
    out += esc(src.slice(last, m.index));
    const display = m[1] !== undefined;
    const tex = display ? m[1] : m[2];
    out += `<span data-tex="${esc(tex)}" data-display="${display ? 1 : 0}">${esc(tex)}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

export async function renderMath(root) {
  const els = root ? root.querySelectorAll('[data-tex]') : [];
  if (!els.length) return;
  let k;
  try { k = await loadKatex(); } catch { return; }
  els.forEach((el) => {
    try { k.render(el.dataset.tex, el, { displayMode: el.dataset.display === '1', throwOnError: false }); }
    catch { el.textContent = el.dataset.tex; }
  });
}
