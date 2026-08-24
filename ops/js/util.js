// Stratos Ops — small helpers: escaping, dates, ids, toasts, modals, icons.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'number') return new Date(v);
  if (v.seconds != null) return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
export const fmtDate = v => { const d = toDate(v); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
export const fmtDateShort = v => { const d = toDate(v); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'; };
export const fmtTime = v => { const d = toDate(v); return d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''; };
export const fmtDateTime = v => { const d = toDate(v); return d ? `${fmtDate(d)} · ${fmtTime(d)}` : '—'; };
export function fmtRel(v) {
  const d = toDate(v); if (!d) return '—';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return fmtDateShort(d);
}
export function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start, end };
}
export const isToday = v => { const d = toDate(v); if (!d) return false; const { start, end } = todayRange(); return d >= start && d < end; };
export const pad2 = n => String(n).padStart(2, '0');
export const dateInputValue = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const timeInputValue = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export function uid(n = 20) {
  const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return Array.from(b, x => a[x % a.length]).join('');
}
export const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

// ---- Toasts ---------------------------------------------------------------
export function toast(msg, kind = 'info', ms = 3400) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---- Modals ---------------------------------------------------------------
export function openModal(html, { wide = false } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-close="1"><div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.dataset.close) closeModal(); });
  root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  document.body.classList.add('modal-open');
  const first = root.querySelector('input, select, textarea, button');
  if (first && window.innerWidth > 960) first.focus();
  return root.querySelector('.modal');
}
export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  document.body.classList.remove('modal-open');
}
export function confirmDialog(title, text, { ok = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    const m = openModal(`
      <h3 class="modal-title">${esc(title)}</h3>
      <p class="modal-text">${esc(text)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close="1">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-gold'}" id="m-ok">${esc(ok)}</button>
      </div>`);
    m.querySelector('#m-ok').addEventListener('click', () => { closeModal(); resolve(true); });
    m.closest('.modal-backdrop').addEventListener('click', e => { if (e.target.dataset.close) resolve(false); });
    m.querySelector('[data-close]').addEventListener('click', () => resolve(false));
  });
}
// formDialog: resolves with an object of the form's values, or null on cancel.
export function formDialog(title, fieldsHtml, { ok = 'Save', wide = false, onMount } = {}) {
  return new Promise(resolve => {
    const m = openModal(`
      <form class="modal-form" id="m-form">
        <h3 class="modal-title">${esc(title)}</h3>
        ${fieldsHtml}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close="1">Cancel</button>
          <button type="submit" class="btn btn-gold">${esc(ok)}</button>
        </div>
      </form>`, { wide });
    const form = m.querySelector('#m-form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const out = {};
      new FormData(form).forEach((v, k) => { out[k] = v; });
      form.querySelectorAll('input[type=checkbox]').forEach(c => { out[c.name] = c.checked; });
      form.querySelectorAll('select[multiple]').forEach(s => { out[s.name] = Array.from(s.selectedOptions).map(o => o.value); });
      closeModal(); resolve(out);
    });
    m.closest('.modal-backdrop').addEventListener('click', e => { if (e.target.dataset.close) resolve(null); });
    m.querySelector('[data-close]').addEventListener('click', () => resolve(null));
    if (onMount) onMount(form);
  });
}

// ---- Icons (stroke, 24px, currentColor) -----------------------------------
const I = (d, extra = '') => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;
const ICONS = {
  jobs: I('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>'),
  aircraft: I('<path d="M2.5 19l19-7L2.5 5l2 6.5L15 12 4.5 12.5z"/>'),
  reports: I('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-6"/><path d="M22 20H2"/>'),
  inventory: I('<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'),
  team: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/>'),
  settings: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  camera: I('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  photo: I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>'),
  check: I('<path d="M5 12l5 5L20 7"/>'),
  checklist: I('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>'),
  qa: I('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M8.5 13l2.5 2.5 4.5-5"/>'),
  back: I('<path d="M15 5l-7 7 7 7"/>'),
  next: I('<path d="M9 5l7 7-7 7"/>'),
  plus: I('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  minus: I('<path d="M5 12h14"/>'),
  clock: I('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  calendar: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>'),
  logout: I('<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/>'),
  print: I('<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>'),
  share: I('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6"/><path d="M8.2 13.2l7.6 4.6"/>'),
  warning: I('<path d="M12 3l10 18H2z"/><path d="M12 10v4"/><path d="M12 17.5v.5"/>'),
  refresh: I('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>'),
  menu: I('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>'),
  close: I('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
  trash: I('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/>'),
  edit: I('<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  location: I('<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  mail: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  phone: I('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  play: I('<path d="M7 5l12 7-12 7z"/>'),
  offline: I('<path d="M2 2l20 20"/><path d="M5 12.5a10 10 0 0 1 3-2"/><path d="M8.5 16a5 5 0 0 1 4-1.5"/><path d="M12 19.5v.5"/><path d="M16.5 9a10 10 0 0 1 4 3"/>'),
  online: I('<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M6 12.5a9 9 0 0 1 12 0"/><path d="M9.5 16a4 4 0 0 1 5 0"/><path d="M12 19.5v.5"/>'),
  download: I('<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
  dot: '<span class="dot"></span>'
};
export const icon = n => ICONS[n] || '';
