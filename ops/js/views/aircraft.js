// Aircraft records — fleet list + per-tail history.
import { state, isManager, upsertAircraft, deleteAircraft } from '../store.js';
import { esc, icon, fmtDate, fmtDateShort, fmtTime, toDate, formDialog, confirmDialog, toast, plural } from '../util.js';
import { statusOf, airportByCode, AIRCRAFT_TYPES, AIRPORTS } from '../constants.js';

let search = '';

export function list() {
  const q = search.trim().toUpperCase();
  const rows = state.aircraft.filter(a =>
    !q || a.tail.includes(q) || (a.type || '').toUpperCase().includes(q) || (a.operator || '').toUpperCase().includes(q));

  const html = `
  <div class="page-head">
    <div>
      <div class="kicker">Fleet</div>
      <h1 class="display">Aircraft Records</h1>
    </div>
    <div class="page-actions"><button class="btn btn-gold" data-action="add">${icon('plus')} Add aircraft</button></div>
  </div>
  <div class="field"><input class="input" id="ac-search" placeholder="Search tail, type, operator…" value="${esc(search)}" autocomplete="off"></div>
  ${rows.length ? `<div class="job-cards" style="display:flex">${rows.map(a => `
    <a class="card job-card" href="#/aircraft/${esc(a.tail)}">
      <div class="r1"><span class="tail">${esc(a.tail)}</span><span class="small faint">${plural(a.jobCount || 0, 'job')}</span></div>
      <div class="r2">
        <span class="gold">${esc(a.type || 'Type unknown')}</span>
        ${a.operator ? `<span>${esc(a.operator)}</span>` : ''}
        ${a.base ? `<span>${esc(airportByCode(a.base).code)}</span>` : ''}
        <span>Last service: ${a.lastServiceAt ? fmtDateShort(a.lastServiceAt) : '—'}</span>
      </div>
    </a>`).join('')}</div>`
  : `<div class="empty">${icon('aircraft')}<div>No aircraft yet.</div><div class="small" style="margin-top:6px">They appear automatically when you create jobs.</div></div>`}`;

  const bind = root => {
    const s = root.querySelector('#ac-search');
    s.oninput = () => { search = s.value; };
    s.onchange = () => { search = s.value; rerender(root); };
    s.onkeyup = e => { if (e.key === 'Enter') { search = s.value; rerender(root); } else { search = s.value; rerender(root, true); } };
    root.onclick = async e => {
      if (!e.target.closest('[data-action="add"]')) return;
      const r = await formDialog('Add aircraft', acFields({}), { ok: 'Add' });
      if (r && r.tail) { upsertAircraft(r.tail, clean(r)); toast('Aircraft added', 'ok'); }
    };
  };
  // lightweight local rerender that keeps the search box focused
  const rerender = (root, keepFocus) => {
    const v = list();
    const active = document.activeElement === root.querySelector('#ac-search');
    root.innerHTML = v.html; v.bind(root);
    if (keepFocus || active) { const s2 = root.querySelector('#ac-search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
  };

  return { html, bind, keep: true };
}

const acFields = a => `
  <div class="field"><label>Tail number</label><input class="input" name="tail" required placeholder="N650SA" style="text-transform:uppercase" value="${esc(a.tail || '')}" ${a.tail ? 'readonly' : ''}></div>
  <div class="field"><label>Type</label><input class="input" name="type" list="ac-type-list" placeholder="Gulfstream G650" value="${esc(a.type || '')}">
    <datalist id="ac-type-list">${AIRCRAFT_TYPES.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
  <div class="field"><label>Operator / owner</label><input class="input" name="operator" value="${esc(a.operator || '')}"></div>
  <div class="field"><label>Home base</label><select class="input" name="base">
    <option value="">—</option>
    ${AIRPORTS.filter(x => x.code !== 'OTHER').map(x => `<option value="${x.code}" ${a.base === x.code ? 'selected' : ''}>${x.code} — ${esc(x.name)}</option>`).join('')}</select></div>
  <div class="field"><label>Notes</label><textarea class="input" name="notes" placeholder="Hangar, access, paint sensitivities…">${esc(a.notes || '')}</textarea></div>`;

const clean = r => ({ tail: String(r.tail).toUpperCase().trim(), type: r.type || '', operator: r.operator || '', base: r.base || '', notes: r.notes || '' });

export function detail(params) {
  const tail = String(params.tail || '').toUpperCase();
  const a = state.aircraft.find(x => x.id === tail);
  const jobs = state.jobs.filter(j => j.tail === tail);
  if (!a && !jobs.length) return { html: `<div class="empty">${icon('aircraft')}<div>No record for ${esc(tail)}.</div><div class="small" style="margin-top:8px"><a class="gold" href="#/aircraft">← All aircraft</a></div></div>` };
  const ac = a || { tail };

  const html = `
  <div class="page-head">
    <div>
      <div class="kicker"><a href="#/aircraft" class="gold">Aircraft</a> / record</div>
      <h1 class="display">${esc(tail)}</h1>
      <div class="gold">${esc(ac.type || '')}</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-outline" data-action="edit">${icon('edit')} Edit</button>
      <a class="btn btn-gold" href="#/job/new">${icon('plus')} New job</a>
    </div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="job-meta" style="margin-top:0">
      ${ac.operator ? `<span class="m">${icon('user')} ${esc(ac.operator)}</span>` : ''}
      ${ac.base ? `<span class="m">${icon('location')} ${esc(airportByCode(ac.base).name)}</span>` : ''}
      <span class="m">${icon('jobs')} ${plural(jobs.length, 'job')}</span>
      <span class="m">${icon('clock')} Last service: ${ac.lastServiceAt ? fmtDate(ac.lastServiceAt) : '—'}</span>
    </div>
    ${ac.notes ? `<hr class="hr"><div class="muted small">${esc(ac.notes)}</div>` : ''}
  </div>
  <div class="card">
    <div class="card-title"><span class="kicker">Service history</span></div>
    ${jobs.length ? jobs.map(j => {
      const st = statusOf(j.status);
      return `<a class="list-row" href="#/job/${j.id}" style="color:inherit">
        <div class="list-main">
          <div class="list-title">${esc(j.serviceName)}</div>
          <div class="list-sub">${fmtDate(j.scheduledAt)} · ${esc(airportByCode(j.airport).code)}${j.qa && j.qa.byName ? ' · QA: ' + esc(j.qa.byName) : ''}</div>
        </div>
        <span class="badge ${st.cls}">${st.label}</span>
      </a>`;
    }).join('') : '<div class="empty small">No jobs for this aircraft yet.</div>'}
  </div>`;

  const bind = root => {
    root.onclick = async e => {
      if (!e.target.closest('[data-action="edit"]')) return;
      const r = await formDialog(`Edit ${tail}`, acFields(ac), { ok: 'Save' });
      if (r) { upsertAircraft(tail, { type: r.type || '', operator: r.operator || '', base: r.base || '', notes: r.notes || '' }); toast('Saved', 'ok'); }
    };
  };
  return { html, bind };
}
