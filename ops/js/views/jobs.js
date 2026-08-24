// Dashboard (job list + stats + panels) and the new/edit job form.
import { state, isManager, createJob, updateJob, jobById, aircraftByTail } from '../store.js';
import { esc, icon, fmtDate, fmtDateShort, fmtTime, fmtRel, toDate, isToday, todayRange, dateInputValue, timeInputValue, toast, plural } from '../util.js';
import { AIRPORTS, airportByCode, SERVICES, serviceById, statusOf, AIRCRAFT_TYPES } from '../constants.js';

const activeJobs = () => state.jobs.filter(j => j.status !== 'cancelled');
export const lowStock = () => state.inventory.filter(i => Number(i.qty) <= Number(i.minQty || 0));

function filterJobs(f) {
  const now = new Date();
  const { start, end } = todayRange();
  switch (f) {
    case 'today': return activeJobs().filter(j => { const d = toDate(j.scheduledAt); return d && d >= start && d < end; });
    case 'upcoming': return activeJobs().filter(j => { const d = toDate(j.scheduledAt); return d && d >= end; }).reverse();
    case 'qa': return state.jobs.filter(j => j.status === 'awaiting_qa');
    case 'open': return activeJobs().filter(j => ['scheduled', 'in_progress', 'awaiting_qa'].includes(j.status));
    case 'done': return state.jobs.filter(j => j.status === 'approved');
    default: return state.jobs;
  }
}

const rowHtml = j => {
  const st = statusOf(j.status);
  const ap = airportByCode(j.airport);
  return `
  <tr class="row" data-nav="#/job/${j.id}">
    <td class="tail">${esc(j.tail)}</td>
    <td>${esc(j.aircraftType || '—')}</td>
    <td>${esc(j.serviceName)}</td>
    <td><span class="badge ${st.cls}">${st.label}</span></td>
    <td>${fmtDateShort(j.scheduledAt)}<span class="muted"> · ${fmtTime(j.scheduledAt)}</span></td>
    <td>${esc(ap.icao || j.airport || '—')}</td>
  </tr>`;
};
const cardHtml = j => {
  const st = statusOf(j.status);
  const ap = airportByCode(j.airport);
  return `
  <a class="card job-card" href="#/job/${j.id}">
    <div class="r1"><span class="tail">${esc(j.tail)}</span><span class="badge ${st.cls}">${st.label}</span></div>
    <div class="r2">
      <span>${esc(j.aircraftType || '')}</span>
      <span class="gold">${esc(serviceById(j.service).short)}</span>
      <span>${fmtDateShort(j.scheduledAt)} · ${fmtTime(j.scheduledAt)}</span>
      <span>${esc(ap.icao || '')}</span>
    </div>
  </a>`;
};

export function dashboard(params) {
  const f = params.filter || 'today';
  const jobs = filterJobs(f);
  const today = filterJobs('today');
  const qa = state.jobs.filter(j => j.status === 'awaiting_qa');
  const low = lowStock();
  const now = new Date();
  const upcoming = activeJobs()
    .filter(j => { const d = toDate(j.scheduledAt); return d && d > now && j.status === 'scheduled'; })
    .sort((a, b) => toDate(a.scheduledAt) - toDate(b.scheduledAt))
    .slice(0, 4);
  const ba = state.jobs.find(j => j.coverBefore && j.coverAfter);

  const chips = [
    ['today', `Today (${today.length})`],
    ['upcoming', 'Upcoming'],
    ['qa', `Awaiting QA (${qa.length})`],
    ['open', 'All open'],
    ['done', 'Approved'],
    ['all', 'All']
  ].map(([k, label]) => `<button class="chip ${k === f ? 'on' : ''}" data-nav="#/jobs/${k}">${label}</button>`).join('');

  const html = `
  <div class="page-head">
    <div>
      <div class="kicker">Stratos Ops</div>
      <h1 class="display">Operations Dashboard</h1>
    </div>
    <div class="page-actions">
      <a class="btn btn-gold" href="#/job/new">${icon('plus')} New Job</a>
    </div>
  </div>

  <div class="stat-grid">
    <div class="card stat" data-nav="#/jobs/today">${icon('calendar')}<div><div class="n">${today.length}</div><div class="l">Today's Jobs</div></div></div>
    <div class="card stat ${qa.length ? 'warn' : ''}" data-nav="#/jobs/qa">${icon('qa')}<div><div class="n">${qa.length}</div><div class="l">Awaiting QA</div></div></div>
    <div class="card stat" data-nav="#/aircraft">${icon('aircraft')}<div><div class="n">${state.aircraft.length}</div><div class="l">Aircraft Records</div></div></div>
    <div class="card stat ${low.length ? 'warn' : ''}" data-nav="#/inventory">${icon('inventory')}<div><div class="n">${low.length}</div><div class="l">Low Stock</div></div></div>
  </div>

  <div class="dash-grid">
    <div>
      <div class="card">
        <div class="card-title"><span class="kicker">${f === 'today' ? "Today's Jobs" : 'Jobs'}</span></div>
        <div class="chip-row">${chips}</div>
        ${jobs.length ? `
        <table class="jobs-table">
          <thead><tr><th>Tail Number</th><th>Aircraft</th><th>Service</th><th>Status</th><th>Scheduled</th><th>Location</th></tr></thead>
          <tbody>${jobs.slice(0, 60).map(rowHtml).join('')}</tbody>
        </table>
        <div class="job-cards">${jobs.slice(0, 60).map(cardHtml).join('')}</div>`
        : `<div class="empty">${icon('aircraft')}<div>No jobs here.</div><div class="small" style="margin-top:6px">Tap <b class="gold">New Job</b> to schedule one.</div></div>`}
      </div>

      ${ba ? `
      <div class="card" style="margin-top:14px">
        <div class="card-title"><span class="kicker">Before &amp; After</span><a class="small gold" href="#/job/${ba.id}">${esc(ba.tail)} →</a></div>
        <div class="ba">
          <figure><img src="${esc(ba.coverBefore)}" alt="Before"><figcaption>Before</figcaption></figure>
          <figure class="after"><img src="${esc(ba.coverAfter)}" alt="After"><figcaption>After</figcaption></figure>
        </div>
      </div>` : ''}
    </div>

    <div>
      <div class="card">
        <div class="card-title"><span class="kicker">Inventory</span><a class="small gold" href="#/inventory">All →</a></div>
        ${state.inventory.slice().sort((a, b) => (Number(a.qty) <= Number(a.minQty || 0) ? 0 : 1) - (Number(b.qty) <= Number(b.minQty || 0) ? 0 : 1)).slice(0, 5).map(i => `
          <div class="inv-row">
            <span>${esc(i.name)}</span>
            <span class="inv-qty">${Number(i.qty) <= Number(i.minQty || 0) ? '<span class="lowstock">Low stock</span> ' : ''}${esc(String(i.qty))} ${esc(i.unit || '')}</span>
          </div>`).join('') || '<div class="empty small">No items yet.</div>'}
      </div>

      <div class="card" style="margin-top:14px">
        <div class="card-title"><span class="kicker">Upcoming Service</span></div>
        ${upcoming.length ? `<div class="tl">${upcoming.map(j => `
          <div class="tl-item" data-nav="#/job/${j.id}">
            <div class="tl-rail"><div class="tl-dot"></div><div class="tl-line"></div></div>
            <div class="tl-body">
              <div style="display:flex;justify-content:space-between;gap:8px">
                <span class="tl-date">${fmtDate(j.scheduledAt)}</span>
                <span class="tl-loc">${esc(airportByCode(j.airport).icao || '')}</span>
              </div>
              <div class="tl-main">${esc(j.tail)} – ${esc(j.aircraftType || 'Aircraft')}</div>
              <div class="tl-sub">${esc(j.serviceName)}</div>
            </div>
          </div>`).join('')}</div>`
        : '<div class="empty small">Nothing scheduled ahead.</div>'}
      </div>
    </div>
  </div>

  <div class="footline">
    <span>${icon('clock')} ${fmtDate(now)} · ${fmtTime(now)}</span>
    <span class="sep">•</span>
    <span><span class="statusdot ${state.online ? '' : 'off'}" style="display:inline-block"></span> System status: ${state.online ? 'Operational' : 'Offline — changes will sync'}</span>
    <span class="sep">•</span>
    <span>Data sync: ${state.lastSync ? fmtRel(state.lastSync) : '—'}</span>
  </div>`;

  return { html };
}

// ---------------------------------------------------------------------------
// New / edit job form
// ---------------------------------------------------------------------------
export function jobForm(params) {
  const editing = params.id ? jobById(params.id) : null;
  const j = editing || {};
  const d = editing ? toDate(j.scheduledAt) : (() => { const x = new Date(); x.setMinutes(0, 0, 0); x.setHours(x.getHours() + 1); return x; })();
  const ap = airportByCode(j.airport || 'VNY');
  const crew = state.members.filter(m => m.active !== false);

  const html = `
  <div class="page-head">
    <div>
      <div class="kicker">${editing ? 'Edit Job' : 'New Job'}</div>
      <h1 class="display">${editing ? esc(j.tail) : 'Schedule a job'}</h1>
    </div>
  </div>
  <form id="job-form" class="card" style="max-width:720px">
    <div class="field-row">
      <div class="field">
        <label>Tail number</label>
        <input class="input" name="tail" list="tails" required placeholder="N650SA" style="text-transform:uppercase"
          value="${esc(j.tail || '')}" ${editing ? 'disabled' : ''} autocapitalize="characters" autocomplete="off">
        <datalist id="tails">${state.aircraft.map(a => `<option value="${esc(a.tail)}">${esc(a.type || '')}</option>`).join('')}</datalist>
      </div>
      <div class="field">
        <label>Aircraft type</label>
        <input class="input" name="aircraftType" list="actypes" placeholder="Gulfstream G650" value="${esc(j.aircraftType || '')}" autocomplete="off">
        <datalist id="actypes">${AIRCRAFT_TYPES.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      </div>
    </div>
    <div class="field">
      <label>Service</label>
      <select class="input" name="service" ${editing ? 'disabled' : ''}>
        ${SERVICES.map(s => `<option value="${s.id}" ${j.service === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field-row">
      <div class="field"><label>Date</label><input class="input" type="date" name="date" required value="${dateInputValue(d)}"></div>
      <div class="field"><label>Time</label><input class="input" type="time" name="time" required value="${timeInputValue(d)}"></div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Airport</label>
        <select class="input" name="airport" id="jf-airport">
          ${AIRPORTS.map(a => `<option value="${a.code}" ${ap.code === a.code ? 'selected' : ''}>${a.code === 'OTHER' ? 'Other location' : `${esc(a.code)} — ${esc(a.name)}`}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>FBO / position</label>
        <input class="input" name="fbo" id="jf-fbo" list="fbos" placeholder="Signature Aviation, Hangar 5…" value="${esc(j.fbo || '')}" autocomplete="off">
        <datalist id="fbos"></datalist>
      </div>
    </div>
    <div class="field">
      <label>Customer / operator</label>
      <input class="input" name="customerName" placeholder="Name or company" value="${esc((j.customer && j.customer.name) || '')}">
    </div>
    <div class="field-row">
      <div class="field"><label>Customer email</label><input class="input" type="email" name="customerEmail" placeholder="ops@operator.com" value="${esc((j.customer && j.customer.email) || '')}"></div>
      <div class="field"><label>Customer phone</label><input class="input" type="tel" name="customerPhone" placeholder="424-…" value="${esc((j.customer && j.customer.phone) || '')}"></div>
    </div>
    <div class="field">
      <label>Assign crew</label>
      ${crew.length ? crew.map(m => `
        <label class="check-row" style="cursor:pointer">
          <input type="checkbox" name="assigned" value="${esc(m.id)}" ${(j.assigned || []).includes(m.id) ? 'checked' : ''} hidden>
          <span class="checkbox ${(j.assigned || []).includes(m.id) ? '' : ''}">${icon('check')}</span>
          <span class="cl-label">${esc(m.name)} <span class="faint small">· ${esc(m.role)}</span></span>
        </label>`).join('') : '<div class="muted small">No team members yet.</div>'}
    </div>
    <div class="field">
      <label>Notes</label>
      <textarea class="input" name="notes" placeholder="Gate codes, special requests, lease-return standard…">${esc(j.notes || '')}</textarea>
    </div>
    <div class="form-error" id="jf-err"></div>
    <div class="modal-actions" style="justify-content:flex-start">
      <button class="btn btn-gold" type="submit">${editing ? 'Save changes' : 'Create job'}</button>
      <a class="btn btn-ghost" href="${editing ? `#/job/${params.id}` : '#/jobs'}">Cancel</a>
    </div>
  </form>`;

  const bind = root => {
    // checkbox visual toggle
    root.querySelectorAll('#job-form .check-row input[type=checkbox]').forEach(cb => {
      const paint = () => cb.parentElement.classList.toggle('done', cb.checked);
      paint();
      cb.parentElement.onclick = e => { e.preventDefault(); cb.checked = !cb.checked; paint(); };
    });
    // FBO suggestions follow the airport
    const apSel = root.querySelector('#jf-airport');
    const fillFbos = () => {
      const a = airportByCode(apSel.value);
      const dl = root.querySelector('#fbos');
      if (dl) dl.innerHTML = a.fbos.map(f => `<option value="${esc(f)}">`).join('');
      const fbo = root.querySelector('#jf-fbo');
      if (!fbo.value && a.fbos.length) fbo.placeholder = a.fbos.join(' · ');
    };
    apSel.onchange = fillFbos; fillFbos();

    root.querySelector('#job-form').onsubmit = e => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      const err = root.querySelector('#jf-err');
      const tail = editing ? j.tail : String(fd.get('tail') || '').trim().toUpperCase();
      const when = new Date(`${fd.get('date')}T${fd.get('time') || '09:00'}`);
      if (!tail) { err.textContent = 'Tail number is needed.'; return; }
      if (isNaN(when)) { err.textContent = 'Pick a date and time.'; return; }
      const assigned = Array.from(form.querySelectorAll('input[name=assigned]:checked')).map(c => c.value);
      const data = {
        tail,
        aircraftType: String(fd.get('aircraftType') || '').trim(),
        service: editing ? j.service : String(fd.get('service')),
        scheduledAt: when,
        airport: String(fd.get('airport')),
        fbo: String(fd.get('fbo') || '').trim(),
        customerName: String(fd.get('customerName') || '').trim(),
        customerEmail: String(fd.get('customerEmail') || '').trim(),
        customerPhone: String(fd.get('customerPhone') || '').trim(),
        assigned,
        notes: String(fd.get('notes') || '').trim()
      };
      if (editing) {
        updateJobSchedule(params.id, data);
        toast('Job updated', 'ok');
        location.hash = `#/job/${params.id}`;
      } else {
        const id = createJob(data);
        toast('Job created', 'ok');
        location.hash = `#/job/${id}`;
      }
    };
  };

  return { html, bind, keep: true };
}

// Separate helper so the edit path sets the Timestamp correctly via store.updateJob.
import { F } from '../firebase.js';
function updateJobSchedule(id, d) {
  updateJob(id, {
    aircraftType: d.aircraftType,
    scheduledAt: F.Timestamp.fromDate(d.scheduledAt),
    airport: d.airport,
    fbo: d.fbo,
    'customer.name': d.customerName,
    'customer.email': d.customerEmail,
    'customer.phone': d.customerPhone,
    assigned: d.assigned,
    notes: d.notes
  }, 'Job details updated');
}
