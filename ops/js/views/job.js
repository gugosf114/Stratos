// Job detail (tabs: job / photos / checklist / inventory), the 8-step camera
// walk-around, and the printable customer report.
import {
  state, watchJob, jobById, isManager, me, myName, memberName,
  startJob, submitForQA, approveQA, requestRework, cancelJob, deleteJob,
  toggleChecklist, setStepData, markPhaseDone, capturePhoto, deletePhoto,
  useStock, createShare, updateJob, annotatePhoto
} from '../store.js';
import { openAnnotator, marksToSVG, hasMarks } from '../annotate.js';
import {
  esc, icon, toast, fmtDate, fmtDateShort, fmtTime, fmtDateTime, toDate,
  confirmDialog, formDialog, openModal, closeModal, plural
} from '../util.js';
import { STEPS, stepById, CONDITIONS, statusOf, airportByCode, serviceById, APP_URL } from '../constants.js';

const photosOf = id => state.photos[id] || [];
const photoSrc = p => p.url || state.previews[p.id] || '';
const annoLayer = a => hasMarks(a) ? `<span class="anno-layer">${marksToSVG(a)}</span>` : '';
const stepPhotos = (id, phase, stepId) => photosOf(id).filter(p => p.phase === phase && p.stepId === stepId);
const phaseLabel = ph => ph === 'before' ? 'Pre-Service Inspection' : 'After Photos';

function stepInfo(job, phase, stepId) {
  return (job.inspection && job.inspection[phase] && job.inspection[phase][stepId]) || {};
}
function phaseDone(job, phase) {
  return !!(job.inspection && job.inspection[phase] && job.inspection[phase].completedAt);
}

// ---------------------------------------------------------------------------
// Job detail
// ---------------------------------------------------------------------------
let photoFilter = 'all';

export function detail(params) {
  const job = jobById(params.id);
  if (!job) return { html: `<div class="empty">${icon('aircraft')}<div>Loading job…</div><div class="small" style="margin-top:8px"><a class="gold" href="#/jobs">← Back to jobs</a></div></div>`, start: () => watchJob(params.id) };

  const tab = params.tab || 'job';
  const st = statusOf(job.status);
  const ap = airportByCode(job.airport);
  const mgr = isManager();
  const ph = photosOf(job.id);
  const beforeDone = phaseDone(job, 'before');
  const afterDone = phaseDone(job, 'after');

  // CTA row by status
  const ctas = [];
  if (job.status === 'scheduled') {
    ctas.push(`<a class="btn btn-gold" href="#/job/${job.id}/inspect/before/0">${icon('camera')} Start Pre-Service Inspection</a>`);
  } else if (job.status === 'in_progress') {
    if (!beforeDone) ctas.push(`<a class="btn btn-outline" href="#/job/${job.id}/inspect/before/0">${icon('camera')} Before photos</a>`);
    ctas.push(`<a class="btn ${beforeDone && !afterDone ? 'btn-gold' : 'btn-outline'}" href="#/job/${job.id}/inspect/after/0">${icon('camera')} After photos</a>`);
    ctas.push(`<button class="btn ${afterDone ? 'btn-gold' : 'btn-outline'}" data-action="submit-qa">${icon('qa')} Submit for QA</button>`);
  } else if (job.status === 'awaiting_qa') {
    if (mgr) {
      ctas.push(`<button class="btn btn-gold" data-action="approve-qa">${icon('check')} Approve QA</button>`);
      ctas.push(`<button class="btn btn-outline" data-action="rework">${icon('refresh')} Request rework</button>`);
    } else {
      ctas.push(`<span class="badge badge-gold">${icon('clock')} Waiting on QA review</span>`);
    }
  } else if (job.status === 'approved') {
    ctas.push(`<a class="btn btn-gold" href="#/job/${job.id}/report">${icon('print')} Customer report</a>`);
    ctas.push(`<button class="btn btn-outline" data-action="share">${icon('share')} Share link</button>`);
  }
  if (job.status === 'in_progress' && mgr) ctas.push(`<button class="btn btn-outline" data-action="approve-qa">${icon('check')} QA now</button>`);
  if (job.status !== 'approved' && job.status !== 'cancelled') ctas.push(`<a class="btn btn-ghost" href="#/job/${job.id}/edit">${icon('edit')} Edit</a>`);
  if (job.status !== 'approved') ctas.push(`<a class="btn btn-ghost" href="#/job/${job.id}/report">${icon('print')} Report</a>`);
  if (mgr && job.status !== 'cancelled' && job.status !== 'approved') ctas.push(`<button class="btn btn-danger btn-sm" data-action="cancel-job">Cancel job</button>`);
  if (mgr && job.status === 'cancelled') ctas.push(`<button class="btn btn-danger btn-sm" data-action="delete-job">${icon('trash')} Delete</button>`);

  const tabs = ['job', 'photos', 'checklist', 'inventory'].map(t =>
    `<a href="#/job/${job.id}/${t}" class="${tab === t ? 'on' : ''}">${t === 'job' ? 'Job' : t}</a>`).join('');

  let body = '';
  if (tab === 'photos') body = photosTab(job, ph);
  else if (tab === 'checklist') body = checklistTab(job);
  else if (tab === 'inventory') body = inventoryTab(job);
  else body = jobTab(job, ph);

  const html = `
  <div class="card job-head">
    <div class="r1">
      <div>
        <h1>${esc(job.tail)}</h1>
        <div class="type">${esc(job.aircraftType || 'Aircraft')} · ${esc(job.serviceName)}</div>
      </div>
      <span class="badge ${st.cls}">${st.label}</span>
    </div>
    <div class="job-meta">
      <span class="m">${icon('calendar')} ${fmtDate(job.scheduledAt)} · ${fmtTime(job.scheduledAt)}</span>
      ${(() => { const q = encodeURIComponent([ap.icao || ap.name, job.fbo].filter(Boolean).join(' ')); return q
        ? `<a class="m m-link" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${icon('location')} ${esc(ap.name)}${job.fbo ? ' · ' + esc(job.fbo) : ''}</a>`
        : `<span class="m">${icon('location')} ${esc(ap.name)}</span>`; })()}
      ${job.customer && job.customer.name ? `<span class="m">${icon('user')} ${esc(job.customer.name)}</span>` : ''}
      ${(job.assigned || []).length ? `<span class="m">${icon('team')} ${esc((job.assigned || []).map(memberName).join(', '))}</span>` : ''}
      <span class="m">${icon('photo')} ${plural(job.photoCount || 0, 'photo')}</span>
    </div>
    <div class="job-cta">${ctas.join('')}</div>
  </div>
  <div class="subtabs">${tabs}</div>
  ${body}`;

  const bind = root => {
    // onclick assignment (not addEventListener): #view is reused across renders,
    // assignment replaces the old handler instead of stacking duplicates.
    root.onclick = async e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const a = el.dataset.action;
      if (a === 'submit-qa') {
        const sure = afterDone || await confirmDialog('Submit for QA?', 'After photos are not finished yet. Submit anyway?', { ok: 'Submit' });
        if (sure) { submitForQA(job.id); toast('Sent to QA', 'ok'); }
      }
      if (a === 'approve-qa') {
        const r = await formDialog('Approve QA', `
          <p class="modal-text">Signing off <b>${esc(job.tail)}</b> — ${esc(job.serviceName)}.</p>
          <div class="field"><label>QA note (optional)</label><textarea class="input" name="note" placeholder="Condition on release, remarks…"></textarea></div>`, { ok: 'Approve' });
        if (r) { approveQA(job.id, r.note); toast('QA approved', 'ok'); }
      }
      if (a === 'rework') {
        const r = await formDialog('Request rework', `
          <div class="field"><label>What needs another pass?</label><textarea class="input" name="note" required placeholder="Left leading edge still hazy…"></textarea></div>`, { ok: 'Send back' });
        if (r) { requestRework(job.id, r.note); toast('Sent back to crew', 'ok'); }
      }
      if (a === 'share') shareFlow(job);
      if (a === 'cancel-job' && await confirmDialog('Cancel this job?', `${job.tail} — ${job.serviceName} will be marked cancelled.`, { ok: 'Cancel job', danger: true })) cancelJob(job.id);
      if (a === 'delete-job' && await confirmDialog('Delete this job?', 'This removes the job and its records for everyone. There is no undo.', { ok: 'Delete', danger: true })) { deleteJob(job.id); location.hash = '#/jobs'; }
      if (a === 'toggle-check') toggleChecklist(job.id, Number(el.dataset.idx));
      if (a === 'stock') useStock(job.id, el.dataset.item, Number(el.dataset.delta));
      if (a === 'open-photo') openLightbox(job, el.dataset.photo);
      if (a === 'photo-filter') { photoFilter = el.dataset.f; el.closest('.chip-row').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); root.querySelector('#photo-grid').innerHTML = photoGridHtml(job); }
    };
  };

  return { html, bind, start: () => watchJob(params.id) };
}

async function shareFlow(job) {
  try {
    toast('Building report link…');
    const token = await createShare(job.id);
    const url = `${APP_URL}#/share/${token}`;
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch (e) {}
    openModal(`
      <h3 class="modal-title">Customer report link</h3>
      <p class="modal-text">${copied ? 'Copied to the clipboard.' : 'Copy and send it:'} Anyone with this link sees the report — no sign-in needed.</p>
      <input class="input" readonly value="${esc(url)}" onclick="this.select()">
      <div class="modal-actions">
        ${navigator.share ? `<button class="btn btn-outline" id="sh-native">${icon('share')} Share…</button>` : ''}
        <button class="btn btn-gold" data-close="1">Done</button>
      </div>`);
    const nb = document.getElementById('sh-native');
    if (nb) nb.onclick = () => navigator.share({ title: `Service report — ${job.tail}`, url }).catch(() => {});
  } catch (e) {
    console.error(e);
    toast('Share failed: ' + (e.message || e), 'error');
  }
}

// ---- tab bodies -----------------------------------------------------------
function jobTab(job, ph) {
  const steps = ['before', 'after'].map(phase => {
    const rows = STEPS.map(s => {
      const pics = stepPhotos(job.id, phase, s.id);
      const info = stepInfo(job, phase, s.id);
      if (!pics.length && !(info.conditions || []).length && !info.note) return '';
      return `
      <div class="card step-row">
        <div class="step-thumbs">${pics.slice(0, 3).map(p => `<span class="st-thumb" data-action="open-photo" data-photo="${esc(p.id)}"><img src="${esc(photoSrc(p))}" alt="">${hasMarks(p.annotation) ? '<span class="ph-mark sm">✎</span>' : ''}</span>`).join('')}</div>
        <div class="step-info">
          <div class="step-name">${esc(s.name)}</div>
          ${(info.conditions || []).length ? `<div class="step-conds">${esc((info.conditions || []).join(' · '))}</div>` : ''}
          ${info.note ? `<div class="step-note">${esc(info.note)}</div>` : ''}
        </div>
        <div class="step-count">${plural(pics.length, 'photo')}</div>
      </div>`;
    }).filter(Boolean).join('');
    if (!rows) return '';
    return `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><span class="kicker">${phaseLabel(phase)}</span>
        <span class="small ${phaseDone(job, phase) ? 'gold' : 'faint'}">${phaseDone(job, phase) ? '✓ Complete' : 'In progress'}</span></div>
      <div class="steps-grid">${rows}</div>
    </div>`;
  }).join('');

  const acts = (state.activity[job.id] || []).map(a => `
    <div class="act-row"><span class="act-when">${fmtDateShort(a.at)} ${fmtTime(a.at)}</span>
    <span><b>${esc(a.byName || '')}</b> — ${esc(a.text)}</span></div>`).join('');

  return `
  ${job.notes ? `<div class="card" style="margin-bottom:14px"><div class="card-title"><span class="kicker">Notes</span></div><div class="muted">${esc(job.notes)}</div></div>` : ''}
  ${job.qa && job.qa.at ? `<div class="card" style="margin-bottom:14px"><div class="card-title"><span class="kicker">QA sign-off</span></div>
    <div>${icon('check')} Approved by <b>${esc(job.qa.byName || '')}</b> · ${fmtDateTime(job.qa.at)}${job.qa.note ? `<div class="muted small" style="margin-top:4px">${esc(job.qa.note)}</div>` : ''}</div></div>` : ''}
  ${steps || `<div class="card" style="margin-bottom:14px"><div class="empty">${icon('camera')}<div>No inspection yet.</div><div class="small" style="margin-top:6px">Start the walk-around to document this aircraft panel by panel.</div></div></div>`}
  <div class="card"><div class="card-title"><span class="kicker">Activity</span></div>${acts || '<div class="empty small">Nothing logged yet.</div>'}</div>`;
}

function photoGridHtml(job) {
  const list = photosOf(job.id).filter(p => photoFilter === 'all' || p.phase === photoFilter);
  if (!list.length) return `<div class="empty">${icon('photo')}<div>No photos${photoFilter === 'all' ? '' : ' in ' + photoFilter} yet.</div></div>`;
  return list.map(p => `
    <figure class="${p.phase === 'after' ? 'after' : ''}" data-action="open-photo" data-photo="${esc(p.id)}">
      ${photoSrc(p) ? `<img src="${esc(photoSrc(p))}" alt="" loading="lazy">` : ''}
      <span class="ph-tag">${esc(p.phase)}</span>
      ${hasMarks(p.annotation) ? '<span class="ph-mark" title="Marked">✎</span>' : ''}
      ${p.pending && !p.url ? '<span class="pending-mark" title="Waiting to upload"></span>' : ''}
    </figure>`).join('');
}

function photosTab(job, ph) {
  const chips = [['all', `All (${ph.length})`], ['before', 'Before'], ['after', 'After']]
    .map(([k, l]) => `<button class="chip ${photoFilter === k ? 'on' : ''}" data-action="photo-filter" data-f="${k}">${l}</button>`).join('');
  return `
  <div class="card">
    <div class="chip-row">${chips}</div>
    <div class="photo-grid" id="photo-grid">${photoGridHtml(job)}</div>
    ${state.pending ? `<div class="small gold" style="margin-top:10px">${state.pending} photo${state.pending === 1 ? '' : 's'} waiting to upload — they go automatically when online.</div>` : ''}
  </div>`;
}

function checklistTab(job) {
  const list = job.checklist || [];
  const done = list.filter(c => c.done).length;
  const pct = list.length ? Math.round(done / list.length * 100) : 0;
  return `
  <div class="card">
    <div class="card-title"><span class="kicker">Trip-Ready checklist</span><span class="small gold">${done}/${list.length}</span></div>
    <div class="progressbar"><i style="width:${pct}%"></i></div>
    ${list.map((c, i) => `
      <div class="check-row ${c.done ? 'done' : ''}" data-action="toggle-check" data-idx="${i}">
        <span class="checkbox">${icon('check')}</span>
        <span style="flex:1"><span class="cl-label">${esc(c.label)}</span>
        ${c.done && c.by ? `<div class="cl-by">${esc(c.by)} · ${fmtDateShort(c.at)} ${fmtTime(c.at)}</div>` : ''}</span>
      </div>`).join('') || '<div class="empty small">This service has no checklist.</div>'}
  </div>`;
}

function inventoryTab(job) {
  const used = job.consumables || {};
  return `
  <div class="card">
    <div class="card-title"><span class="kicker">Products used on this job</span></div>
    ${state.inventory.map(i => {
      const u = Number(used[i.id] || 0);
      const low = Number(i.qty) <= Number(i.minQty || 0);
      return `
      <div class="inv-row">
        <div class="list-main">
          <div class="list-title">${esc(i.name)}</div>
          <div class="list-sub">${low ? '<span class="lowstock">Low stock</span> ' : ''}${esc(String(i.qty))} ${esc(i.unit || '')} in stock</div>
        </div>
        <div class="stepper">
          <button data-action="stock" data-item="${esc(i.id)}" data-delta="-1" ${u <= 0 ? 'disabled style="opacity:.35"' : ''}>−</button>
          <span class="val">${u}</span>
          <button data-action="stock" data-item="${esc(i.id)}" data-delta="1">+</button>
        </div>
      </div>`;
    }).join('') || '<div class="empty small">No inventory items yet — add them in Inventory.</div>'}
    <div class="small faint" style="margin-top:10px">Every tap updates the stock count and the job record.</div>
  </div>`;
}

// ---- lightbox -------------------------------------------------------------
function openLightbox(job, photoId) {
  const p = photosOf(job.id).find(x => x.id === photoId);
  if (!p || !photoSrc(p)) return;
  const root = document.getElementById('modal-root');
  const marked = hasMarks(p.annotation);
  root.innerHTML = `
  <div class="lightbox" id="lb">
    <div class="lb-bar">
      <span>${esc(job.tail)} · ${esc(p.phase)}${p.stepId ? ' · ' + esc(stepById(p.stepId).name) : ''}</span>
      <button class="btn btn-icon btn-ghost" id="lb-close">${icon('close')}</button>
    </div>
    <div class="lb-stage">
      <div class="lb-imgwrap"><img src="${esc(photoSrc(p))}" alt="">${annoLayer(p.annotation)}</div>
    </div>
    ${marked && p.annotation.note ? `<div class="lb-note">${esc(p.annotation.note)}</div>` : ''}
    <div class="lb-bar">
      <span class="small faint">${esc(p.takenByName || '')} · ${fmtDateShort(p.takenAt)}${p.url ? '' : ' · waiting'}</span>
      <span style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" id="lb-mark">${icon('edit')} ${marked ? 'Edit marks' : 'Mark'}</button>
        <button class="btn btn-danger btn-sm" id="lb-del">${icon('trash')}</button>
      </span>
    </div>
  </div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('#lb-close').onclick = close;
  root.querySelector('#lb').onclick = e => { if (e.target.id === 'lb' || e.target.classList.contains('lb-stage')) close(); };
  root.querySelector('#lb-mark').onclick = () => openAnnotator({
    src: photoSrc(p), w: p.w, h: p.h, annotation: p.annotation, title: 'Mark the condition',
    onSave: a => { annotatePhoto(job.id, p.id, a); toast('Saved', 'ok'); setTimeout(() => openLightbox(job, photoId), 300); }
  });
  root.querySelector('#lb-del').onclick = async () => {
    if (await confirmDialog('Delete photo?', 'It disappears from the job and the report.', { ok: 'Delete', danger: true })) {
      deletePhoto(job.id, p);
      close();
    }
  };
}

// ---------------------------------------------------------------------------
// Inspection walk-around (before / after)
// ---------------------------------------------------------------------------
const noteDrafts = {}; // `${jobId}|${phase}|${stepId}` -> note text

export function inspect(params) {
  const job = jobById(params.id);
  const phase = params.phase === 'after' ? 'after' : 'before';
  const idx = Math.min(Math.max(0, params.step || 0), STEPS.length - 1);
  const step = STEPS[idx];
  if (!job) return { html: '<div class="empty">Loading…</div>', start: () => watchJob(params.id) };

  const info = stepInfo(job, phase, step.id);
  const key = `${job.id}|${phase}|${step.id}`;
  const note = noteDrafts[key] !== undefined ? noteDrafts[key] : (info.note || '');
  const pics = stepPhotos(job.id, phase, step.id);
  const last = pics[pics.length - 1];
  const pct = Math.round(((idx + 1) / STEPS.length) * 100);
  const conds = info.conditions || [];

  const html = `
  <div class="inspect">
    <div class="inspect-head">
      <a class="btn btn-icon btn-ghost" href="#/job/${job.id}">${icon('back')}</a>
      <div class="inspect-title">${phaseLabel(phase)}</div>
      <span style="width:36px"></span>
    </div>
    <div class="card ac-card">
      <img src="/images/jet.png" alt="" style="width:74px;border-radius:8px">
      <div>
        <div class="ac-type">${esc(job.aircraftType || 'Aircraft')}</div>
        <div class="ac-sub">${esc(job.tail)} · ${esc(airportByCode(job.airport).code)}</div>
      </div>
    </div>
    <div class="stepline">
      <span class="kicker">Step ${idx + 1} of ${STEPS.length}</span>
      <span class="small faint">${pics.length ? plural(pics.length, 'photo') : ''}</span>
    </div>
    <div class="progressbar"><i style="width:${pct}%"></i></div>

    <div class="viewfinder" id="vf" style="${last && last.w && last.h ? `aspect-ratio:${last.w}/${last.h}` : ''}">
      <span class="corner c1"></span><span class="corner c2"></span><span class="corner c3"></span><span class="corner c4"></span>
      ${last && photoSrc(last)
        ? `<img src="${esc(photoSrc(last))}" alt="">${annoLayer(last.annotation)}`
        : `<div class="vf-empty">${icon('camera')}<div>Tap to capture</div></div>`}
    </div>

    <div class="step-title display">${esc(step.name)}</div>
    <div class="step-hint">${esc(step.hint)}</div>

    <div class="shutter-row">
      <button class="side-btn" id="pick-gallery" title="Add from gallery">${icon('photo')}</button>
      <button class="shutter" id="shutter" title="Take photo">${icon('camera')}</button>
      <button class="side-btn" id="skip-step" title="Skip step">${icon('next')}</button>
    </div>

    ${last && photoSrc(last) ? `<button class="btn btn-outline btn-block anno-cta" id="mark-btn">${icon('edit')} ${hasMarks(last.annotation) ? 'Edit marks on this photo' : 'Circle / note damage on this photo'}</button>` : ''}

    ${phase === 'before' ? `<div class="cond-row">${CONDITIONS.map(c =>
      `<button class="chip ${conds.includes(c) ? 'on' : ''}" data-cond="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}

    <div class="field">
      <textarea class="input" id="step-note" placeholder="Notes for this panel — existing damage, remarks…">${esc(note)}</textarea>
    </div>

    ${pics.length ? `<div class="inspect-thumbs">${pics.map(p => `
      <span class="thumb-wrap">
        <img class="thumb" src="${esc(photoSrc(p))}" alt="">
        ${hasMarks(p.annotation) ? '<span class="ph-mark sm">✎</span>' : ''}
        <span class="thumb-x" data-del="${esc(p.id)}">✕</span>
      </span>`).join('')}</div>` : ''}

    <div class="inspect-nav">
      ${idx > 0 ? `<a class="btn btn-ghost" href="#/job/${job.id}/inspect/${phase}/${idx - 1}">${icon('back')} Back</a>` : ''}
      ${idx < STEPS.length - 1
        ? `<a class="btn btn-gold" href="#/job/${job.id}/inspect/${phase}/${idx + 1}" id="next-btn">Next ${icon('next')}</a>`
        : `<button class="btn btn-gold" id="finish-btn">${icon('check')} Finish ${phase === 'before' ? 'inspection' : 'photos'}</button>`}
    </div>
  </div>`;

  const bind = root => {
    const cam = document.getElementById('camera-input');
    const gal = document.getElementById('gallery-input');
    const fire = files => capturePhoto(files, { jobId: job.id, phase, stepId: step.id });
    cam.onchange = () => { if (cam.files.length) fire(cam.files); cam.value = ''; };
    gal.onchange = () => { if (gal.files.length) fire(gal.files); gal.value = ''; };
    root.querySelector('#shutter').onclick = () => cam.click();
    root.querySelector('#vf').onclick = () => cam.click();
    root.querySelector('#pick-gallery').onclick = () => gal.click();
    const markBtn = root.querySelector('#mark-btn');
    if (markBtn && last) markBtn.onclick = () => openAnnotator({
      src: photoSrc(last), w: last.w, h: last.h, annotation: last.annotation, title: 'Mark the condition',
      onSave: a => { annotatePhoto(job.id, last.id, a); toast('Saved', 'ok'); }
    });
    root.querySelector('#skip-step').onclick = () => {
      saveNote();
      location.hash = idx < STEPS.length - 1 ? `#/job/${job.id}/inspect/${phase}/${idx + 1}` : `#/job/${job.id}`;
    };

    const noteEl = root.querySelector('#step-note');
    noteEl.oninput = () => { noteDrafts[key] = noteEl.value; };
    const saveNote = () => {
      if (noteDrafts[key] !== undefined && noteDrafts[key] !== (info.note || '')) {
        setStepData(job.id, phase, step.id, { note: noteDrafts[key] });
        delete noteDrafts[key];
      }
    };
    root.querySelectorAll('[data-cond]').forEach(b => b.onclick = () => {
      const c = b.dataset.cond;
      const cur = stepInfo(jobById(job.id) || job, phase, step.id).conditions || [];
      const next = cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c];
      setStepData(job.id, phase, step.id, { conditions: next });
    });
    const nextBtn = root.querySelector('#next-btn');
    if (nextBtn) nextBtn.addEventListener('click', saveNote);
    const backBtn = root.querySelector('.inspect-nav .btn-ghost');
    if (backBtn) backBtn.addEventListener('click', saveNote);
    const fin = root.querySelector('#finish-btn');
    if (fin) fin.onclick = () => {
      saveNote();
      markPhaseDone(job.id, phase);
      toast(phase === 'before' ? 'Inspection complete' : 'After photos complete', 'ok');
      location.hash = `#/job/${job.id}`;
    };
    root.querySelectorAll('[data-del]').forEach(x => x.onclick = async e => {
      e.stopPropagation();
      const p = pics.find(pp => pp.id === x.dataset.del);
      if (p && await confirmDialog('Delete photo?', 'Removes it from this panel.', { ok: 'Delete', danger: true })) deletePhoto(job.id, p);
    });
  };

  return { html, bind, start: () => watchJob(params.id), hideTabbar: true };
}

// ---------------------------------------------------------------------------
// Report (live + shared snapshot share the same renderer)
// ---------------------------------------------------------------------------
export function liveReportData(job) {
  const photos = photosOf(job.id).filter(p => photoSrc(p))
    .map(p => ({ phase: p.phase, stepId: p.stepId || '', url: photoSrc(p), note: p.note || '' }));
  return {
    tail: job.tail, aircraftType: job.aircraftType, serviceName: job.serviceName,
    airport: job.airport, fbo: job.fbo,
    scheduledAt: job.scheduledAt, completedAt: job.completedAt,
    customer: job.customer || {}, crewNames: (job.assigned || []).map(memberName),
    checklist: (job.checklist || []).map(c => ({ label: c.label, done: !!c.done })),
    inspection: job.inspection || {},
    photos,
    qa: job.qa && job.qa.at ? { byName: job.qa.byName, at: job.qa.at, note: job.qa.note } : null,
    org: state.org
  };
}

export function reportHtml(d) {
  const org = d.org || { name: 'Stratos Aviation Detailing', phone: '424-288-8882', website: 'stratosjetdetail.com' };
  const ap = airportByCode(d.airport);
  const byStep = {};
  (d.photos || []).forEach(p => {
    const k = p.stepId || '_general';
    (byStep[k] = byStep[k] || { before: [], after: [] })[p.phase === 'after' ? 'after' : 'before'].push(p);
  });
  const fig = (p, label, after) => `<figure class="rep-fig">${after ? '' : ''}<img src="${esc(p.url)}" alt="">${hasMarks(p.annotation) ? `<span class="anno-layer">${marksToSVG(p.annotation)}</span>` : ''}<figcaption${after ? ' style="background:#C6A24B;color:#14210F"' : ''}>${esc(label)}</figcaption></figure>`;
  const stepSecs = STEPS.filter(s => byStep[s.id]).map(s => {
    const g = byStep[s.id];
    const info = (d.inspection && d.inspection.before && d.inspection.before[s.id]) || {};
    const b = g.before[0], a = g.after[0];
    const extras = [...g.before.slice(1), ...g.after.slice(1)];
    return `
    <div class="rep-panel">
      <h3>${esc(s.name)}</h3>
      ${(info.conditions || []).length ? `<div class="small gold" style="margin-bottom:6px">${esc(info.conditions.join(' · '))}</div>` : ''}
      <div class="rep-pair">
        ${b ? fig(b, 'Before', false) : ''}
        ${a ? fig(a, 'After', true) : ''}
      </div>
      ${extras.length ? `<div class="rep-pair" style="margin-top:10px">${extras.slice(0, 4).map(p => fig(p, p.phase, false)).join('')}</div>` : ''}
      ${info.note ? `<div class="rep-note">${esc(info.note)}</div>` : ''}
    </div>`;
  }).join('');
  const gen = byStep._general;
  const damaged = (d.photos || []).filter(p => hasMarks(p.annotation));
  const checklist = (d.checklist || []).filter(c => c.done);

  return `
  <div class="report">
    <div class="rep-head">
      <img src="/images/logo-emblem.png" alt="">
      <div class="rep-org">${esc(org.name || 'Stratos Aviation Detailing')}</div>
      <h1>Service Report</h1>
      <div class="muted">${esc(d.tail)} · ${esc(d.aircraftType || 'Aircraft')}</div>
    </div>
    <div class="rep-meta">
      <div><div class="k">Service</div><div class="v">${esc(d.serviceName)}</div></div>
      <div><div class="k">Date</div><div class="v">${fmtDate(d.completedAt || d.scheduledAt)}</div></div>
      <div><div class="k">Location</div><div class="v">${esc(ap.name)}${d.fbo ? ' · ' + esc(d.fbo) : ''}</div></div>
      <div><div class="k">Crew</div><div class="v">${esc((d.crewNames || []).join(', ') || '—')}</div></div>
      ${d.customer && d.customer.name ? `<div><div class="k">Operator</div><div class="v">${esc(d.customer.name)}</div></div>` : ''}
      ${d.qa ? `<div><div class="k">QA sign-off</div><div class="v">${esc(d.qa.byName || '')} · ${fmtDate(d.qa.at)}</div></div>` : ''}
    </div>
    ${damaged.length ? `<div class="rep-sec"><h2>Condition noted on arrival</h2>
      <div class="small muted" style="margin-bottom:12px">Areas documented before service. Marked photos below are part of the permanent job record.</div>
      <div class="rep-damage">${damaged.map(p => `
        <div class="rep-dmg-item">
          <figure class="rep-fig"><img src="${esc(p.url)}" alt="">${marksToSVG(p.annotation)}</figure>
          <div>
            <div class="small gold">${esc(p.stepId ? stepById(p.stepId).name : (p.phase === 'after' ? 'After service' : 'On arrival'))}</div>
            ${p.annotation.note ? `<div class="rep-note" style="margin-top:4px">${esc(p.annotation.note)}</div>` : '<div class="rep-note faint" style="margin-top:4px">Marked — see photo.</div>'}
          </div>
        </div>`).join('')}</div></div>` : ''}
    ${stepSecs ? `<div class="rep-sec"><h2>Condition &amp; Results</h2>${stepSecs}</div>` : ''}
    ${gen && (gen.before.length + gen.after.length) ? `<div class="rep-sec"><h2>Additional photos</h2>
      <div class="rep-pair">${[...gen.before, ...gen.after].slice(0, 8).map(p => `<figure><img src="${esc(p.url)}" alt=""><figcaption>${esc(p.phase)}</figcaption></figure>`).join('')}</div></div>` : ''}
    ${checklist.length ? `<div class="rep-sec"><h2>Work performed</h2>
      ${checklist.map(c => `<div class="act-row"><span class="gold">✓</span><span>${esc(c.label)}</span></div>`).join('')}</div>` : ''}
    ${d.qa && d.qa.note ? `<div class="rep-sec"><h2>QA remarks</h2><div class="muted">${esc(d.qa.note)}</div></div>` : ''}
    <div class="rep-foot">
      <span><b>${esc(org.name || '')}</b>${org.phone ? ' · ' + esc(org.phone) : ''}${org.email ? ' · ' + esc(org.email) : ''}</span>
      <span>${esc(org.website || '')}</span>
    </div>
  </div>`;
}

export function report(params) {
  const job = jobById(params.id);
  if (!job) return { html: '<div class="empty">Loading report…</div>', start: () => watchJob(params.id) };
  const html = `
  <div class="rep-print-bar">
    <a class="btn btn-ghost btn-sm" href="#/job/${job.id}">${icon('back')} Job</a>
    <button class="btn btn-outline btn-sm" data-action="share">${icon('share')} Share link</button>
    <button class="btn btn-gold btn-sm" onclick="window.print()">${icon('print')} Print / PDF</button>
  </div>
  ${reportHtml(liveReportData(job))}`;
  const bind = root => {
    root.onclick = e => {
      if (e.target.closest('[data-action="share"]')) shareFlow(job);
    };
  };
  return { html, bind, start: () => watchJob(params.id), hideTabbar: true };
}
