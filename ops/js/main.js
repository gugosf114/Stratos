// Stratos Ops — bootstrap: routing, chrome (sidebar/topbar/tabbar), auth gate.
import { state, subscribe, boot, processQueue, fetchShare } from './store.js';
import { esc, icon } from './util.js';
import { statusOf } from './constants.js';
import * as Auth from './views/auth.js';
import * as Jobs from './views/jobs.js';
import * as Job from './views/job.js';
import * as Aircraft from './views/aircraft.js';
import * as Inventory from './views/inventory.js';
import * as Team from './views/team.js';
import * as Reports from './views/reports.js';
import * as Settings from './views/settings.js';

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function route() {
  const parts = (location.hash.slice(1) || '/jobs').split('/').filter(Boolean);
  const [a, b, c, d, e] = parts;
  if (a === 'share' && b) return { view: 'share', token: b, pub: true };
  if (a === 'job' && b === 'new') return { view: 'jobform', title: 'New Job' };
  if (a === 'job' && b && c === 'edit') return { view: 'jobform', id: b, title: 'Edit Job' };
  if (a === 'job' && b && c === 'inspect') return { view: 'inspect', id: b, phase: d || 'before', step: Number(e) || 0 };
  if (a === 'job' && b && c === 'report') return { view: 'report', id: b };
  if (a === 'job' && b) return { view: 'job', id: b, tab: c || 'job' };
  if (a === 'aircraft' && b) return { view: 'aircraftDetail', tail: decodeURIComponent(b) };
  if (a === 'jobs') return { view: 'jobs', filter: b || 'today' };
  if (['aircraft', 'inventory', 'team', 'reports', 'settings', 'menu'].includes(a)) return { view: a };
  return { view: 'jobs', filter: 'today' };
}

const VIEWS = {
  jobs: Jobs.dashboard,
  jobform: Jobs.jobForm,
  job: Job.detail,
  inspect: Job.inspect,
  report: Job.report,
  aircraft: Aircraft.list,
  aircraftDetail: Aircraft.detail,
  inventory: Inventory.page,
  team: Team.page,
  reports: Reports.page,
  settings: Settings.page,
  menu: Settings.menu
};

const TITLES = {
  jobs: 'Operations', jobform: 'Job', job: 'Job', inspect: 'Inspection', report: 'Report',
  aircraft: 'Aircraft', aircraftDetail: 'Aircraft', inventory: 'Inventory',
  team: 'Team', reports: 'Reports', settings: 'Settings', menu: 'More'
};

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------
const NAV = [
  ['jobs', 'Jobs', '#/jobs'],
  ['aircraft', 'Aircraft', '#/aircraft'],
  ['reports', 'Reports', '#/reports'],
  ['inventory', 'Inventory', '#/inventory'],
  ['team', 'Team', '#/team'],
  ['settings', 'Settings', '#/settings']
];
const navKey = v => ({ jobs: 'jobs', jobform: 'jobs', job: 'jobs', inspect: 'jobs', report: 'jobs', aircraftDetail: 'aircraft' }[v] || v);

function sidebarHtml(r) {
  const m = state.member || {};
  return `
  <div class="sb-brand"><img src="/images/logo-flat-gold.png" alt="Stratos"><div class="word">OPERATIONS</div></div>
  <nav class="sb-nav">
    ${NAV.map(([k, label, href]) => `<a href="${href}" class="${navKey(r.view) === k ? 'on' : ''}">${icon(k)} ${label}</a>`).join('')}
  </nav>
  <div class="sb-foot">
    <div class="sb-user">
      <div class="sb-avatar">${esc(String(m.name || '?')[0] || '?').toUpperCase()}</div>
      <div style="min-width:0">
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.name || '')}</div>
        <div class="faint small">${esc(m.role || '')}</div>
      </div>
    </div>
    <div class="faint small" style="display:flex;align-items:center;gap:7px">
      <span class="statusdot ${state.online ? '' : 'off'}"></span>
      ${state.online ? 'Operational' : 'Offline — will sync'}
      ${state.pending ? `<span class="pendingpill">${state.pending} ⬆</span>` : ''}
    </div>
  </div>`;
}

function topbarHtml(r) {
  const inJob = ['job', 'inspect', 'report', 'jobform', 'aircraftDetail'].includes(r.view);
  const job = r.id ? state.jobs.find(j => j.id === r.id) : null;
  const title = job ? job.tail : (r.view === 'aircraftDetail' ? r.tail : TITLES[r.view] || 'Stratos Ops');
  return `
  ${inJob
    ? `<a class="btn btn-icon btn-ghost" href="${r.view === 'inspect' || r.view === 'report' ? `#/job/${r.id}` : (r.view === 'aircraftDetail' ? '#/aircraft' : '#/jobs')}">${icon('back')}</a>`
    : `<img src="/images/logo-emblem.png" alt="">`}
  <span class="t-title">${esc(title)}</span>
  ${state.pending ? `<span class="pendingpill">${state.pending} ⬆</span>` : ''}
  <span class="statusdot ${state.online ? '' : 'off'}" title="${state.online ? 'Online' : 'Offline'}"></span>`;
}

function tabbarHtml(r) {
  if (r.view === 'job' || (r.view === 'inspect' && false)) {
    const t = r.tab || 'job';
    return [
      ['job', 'Job', 'jobs'],
      ['photos', 'Photos', 'photo'],
      ['checklist', 'Checklist', 'checklist'],
      ['inventory', 'Inventory', 'inventory']
    ].map(([k, label, ic]) => `<a href="#/job/${r.id}/${k === 'job' ? '' : k}" class="${t === k ? 'on' : ''}">${icon(ic)} ${label}</a>`).join('');
  }
  const k = navKey(r.view);
  return [
    ['jobs', 'Jobs', 'jobs', '#/jobs'],
    ['aircraft', 'Aircraft', 'aircraft', '#/aircraft'],
    ['inventory', 'Inventory', 'inventory', '#/inventory'],
    ['menu', 'More', 'menu', '#/menu']
  ].map(([key, label, ic, href]) => `<a href="${href}" class="${k === key || (key === 'menu' && ['team', 'reports', 'settings'].includes(k)) ? 'on' : ''}">${icon(ic)} ${label}</a>`).join('');
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
let lastKey = null;
let stopCurrent = null;
let lastShareToken = null;

function show(el, on) { el.classList.toggle('hidden', !on); }

function render() {
  const r = route();
  const splash = $('splash'), authEl = $('auth'), pub = $('public'), app = $('app');

  // Public customer report — no sign-in.
  if (r.pub) {
    show(splash, false); show(authEl, false); show(app, false); show(pub, true);
    renderShare(r.token, pub);
    return;
  }

  if (!state.authReady) { show(splash, true); show(authEl, false); show(app, false); show(pub, false); return; }
  show(splash, false); show(pub, false);

  if (!state.user || state.noInvite || state.deactivated) {
    show(app, false); show(authEl, true);
    authEl.className = 'auth';
    const v = (!state.user ? Auth.login : Auth.noInvite)();
    const key = (!state.user ? 'login' : 'noinvite');
    if (key !== lastKey || !v.keep) { authEl.innerHTML = v.html; if (v.bind) v.bind(authEl); lastKey = key; }
    return;
  }

  show(authEl, false); show(app, true);
  const fn = VIEWS[r.view] || Jobs.dashboard;
  const v = fn(r);
  const key = JSON.stringify(r);
  const routeChanged = key !== lastKey;

  if (routeChanged && stopCurrent) { try { stopCurrent(); } catch (e) {} stopCurrent = null; }

  $('sidebar').innerHTML = sidebarHtml(r);
  $('topbar').innerHTML = topbarHtml(r);
  const tb = $('tabbar');
  if (v.hideTabbar) tb.innerHTML = ''; else tb.innerHTML = tabbarHtml(r);
  tb.style.display = v.hideTabbar ? 'none' : '';

  if (!routeChanged && v.keep) { lastKey = key; return; }
  const viewEl = $('view');
  viewEl.innerHTML = v.html;
  if (v.bind) v.bind(viewEl);
  if (routeChanged) {
    viewEl.scrollTop = 0; window.scrollTo(0, 0);
    if (v.start) stopCurrent = v.start() || null;
  }
  lastKey = key;
}

async function renderShare(token, pub) {
  if (lastShareToken === token) return;
  lastShareToken = token;
  pub.innerHTML = '<div class="splash" style="position:static;min-height:100vh"><img src="/images/logo-emblem.png" alt=""><div class="splash-word">LOADING REPORT</div></div>';
  try {
    const d = await fetchShare(token);
    if (!d) { pub.innerHTML = `<div class="auth"><div class="auth-box"><div class="auth-brand"><img src="/images/logo-emblem.png" alt=""><h1>Report not found</h1></div><p class="muted" style="text-align:center">This link is wrong or the report was removed.<br>Call Stratos Aviation Detailing: <a href="tel:4242888882" class="gold">424-288-8882</a></p></div></div>`; return; }
    pub.innerHTML = `
      <div class="view" style="padding-top:16px">
        <div class="rep-print-bar"><button class="btn btn-gold btn-sm" onclick="window.print()">${icon('print')} Print / Save PDF</button></div>
        ${Job.reportHtml(d)}
      </div>`;
  } catch (e) {
    console.error(e);
    pub.innerHTML = `<div class="auth"><div class="auth-box"><p class="muted" style="text-align:center">Could not load the report. Check the connection and reload.</p></div></div>`;
  }
}

// ---------------------------------------------------------------------------
// Global nav clicks (elements with data-nav), hash routing, SW, start.
// ---------------------------------------------------------------------------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-nav]');
  if (el) { location.hash = el.dataset.nav; }
});
window.addEventListener('hashchange', render);
subscribe(render);
boot();
render();
setInterval(() => { if (state.member) processQueue(); }, 45000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/ops/sw.js', { scope: '/ops/' }).catch(e => console.warn('sw', e));
}
