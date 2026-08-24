// Reports — monthly KPIs, breakdowns, CSV export.
import { state } from '../store.js';
import { esc, icon, toDate, fmtDate, fmtTime } from '../util.js';
import { airportByCode, serviceById, statusOf, AIRPORTS } from '../constants.js';

let offset = 0; // months back from current

function monthRange(off) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - off, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - off + 1, 1);
  return { start, end };
}
const monthName = off => monthRange(off).start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

function bars(counts) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return entries.map(([label, n]) => `
    <div class="bar-row">
      <span class="bar-label">${esc(label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round(n / max * 100)}%"></span></span>
      <span class="bar-n">${n}</span>
    </div>`).join('') || '<div class="empty small">Nothing in this month.</div>';
}

export function page() {
  const { start, end } = monthRange(offset);
  const inMonth = state.jobs.filter(j => { const d = toDate(j.scheduledAt); return d && d >= start && d < end && j.status !== 'cancelled'; });
  const approved = inMonth.filter(j => j.status === 'approved');
  const photos = inMonth.reduce((s, j) => s + (j.photoCount || 0), 0);
  const tails = new Set(inMonth.map(j => j.tail));

  const byAirport = {}; const byService = {};
  inMonth.forEach(j => {
    const ap = airportByCode(j.airport);
    byAirport[ap.code === 'OTHER' ? 'Other' : `${ap.code} — ${ap.name}`] = (byAirport[ap.code === 'OTHER' ? 'Other' : `${ap.code} — ${ap.name}`] || 0) + 1;
    byService[serviceById(j.service).short] = (byService[serviceById(j.service).short] || 0) + 1;
  });

  const html = `
  <div class="page-head">
    <div>
      <div class="kicker">Numbers</div>
      <h1 class="display">Reports</h1>
    </div>
    <div class="page-actions">
      <button class="btn btn-ghost btn-sm" data-action="prev">${icon('back')}</button>
      <span class="btn btn-ghost btn-sm" style="pointer-events:none">${monthName(offset)}</span>
      <button class="btn btn-ghost btn-sm" data-action="next" ${offset === 0 ? 'disabled' : ''}>${icon('next')}</button>
      <button class="btn btn-outline btn-sm" data-action="csv">${icon('download')} CSV</button>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="card stat">${icon('jobs')}<div><div class="n">${inMonth.length}</div><div class="l">Jobs</div></div></div>
    <div class="card stat">${icon('check')}<div><div class="n">${approved.length}</div><div class="l">QA Approved</div></div></div>
    <div class="card stat">${icon('aircraft')}<div><div class="n">${tails.size}</div><div class="l">Aircraft Served</div></div></div>
    <div class="card stat">${icon('photo')}<div><div class="n">${photos}</div><div class="l">Photos</div></div></div>
  </div>

  <div class="dash-grid">
    <div class="card"><div class="card-title"><span class="kicker">Jobs by airport</span></div>${bars(byAirport)}</div>
    <div class="card"><div class="card-title"><span class="kicker">Jobs by service</span></div>${bars(byService)}</div>
  </div>

  <div class="card" style="margin-top:14px">
    <div class="card-title"><span class="kicker">Fleet — most serviced</span></div>
    ${state.aircraft.slice().sort((a, b) => (b.jobCount || 0) - (a.jobCount || 0)).slice(0, 8).map(a => `
      <a class="list-row" href="#/aircraft/${esc(a.tail)}" style="color:inherit">
        <div class="list-main"><div class="list-title">${esc(a.tail)}</div><div class="list-sub">${esc(a.type || '')}</div></div>
        <span class="muted small">${a.jobCount || 0} jobs · last ${a.lastServiceAt ? fmtDate(a.lastServiceAt) : '—'}</span>
      </a>`).join('') || '<div class="empty small">No aircraft yet.</div>'}
  </div>`;

  const bind = root => {
    root.onclick = e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      if (el.dataset.action === 'prev') { offset += 1; refresh(root); }
      if (el.dataset.action === 'next' && offset > 0) { offset -= 1; refresh(root); }
      if (el.dataset.action === 'csv') exportCsv(inMonth);
    };
  };
  const refresh = root => { const v = page(); root.innerHTML = v.html; v.bind(root); };
  return { html, bind };
}

function exportCsv(jobs) {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['Tail', 'Aircraft', 'Service', 'Status', 'Scheduled', 'Airport', 'FBO', 'Customer', 'Crew', 'Photos', 'QA by', 'QA at', 'Notes'];
  const rows = jobs.map(j => [
    j.tail, j.aircraftType || '', j.serviceName, j.status,
    (toDate(j.scheduledAt) || '').toLocaleString ? toDate(j.scheduledAt).toLocaleString('en-US') : '',
    airportByCode(j.airport).code, j.fbo || '', (j.customer && j.customer.name) || '',
    '', j.photoCount || 0,
    (j.qa && j.qa.byName) || '', j.qa && j.qa.at ? toDate(j.qa.at).toLocaleString('en-US') : '',
    j.notes || ''
  ].map(q).join(','));
  const csv = [head.map(q).join(','), ...rows].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `stratos-jobs-${monthName(offset).replace(/\s/g, '-').toLowerCase()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
