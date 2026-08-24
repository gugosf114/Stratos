// Stratos Ops — data layer: auth, live Firestore watchers, offline photo queue, all actions.
import { auth, db, storage, A, F, S } from './firebase.js';
import { uid, toast, toDate } from './util.js';
import { serviceById } from './constants.js';

export const state = {
  user: null,            // firebase user
  member: null,          // members/{uid} doc (null until enrolled)
  noInvite: false,       // signed in but no invite for this email
  deactivated: false,    // member exists but active=false
  authReady: false,
  org: null,
  jobs: [], aircraft: [], inventory: [], members: [], invites: [], stockLog: [],
  photos: {},            // jobId -> [photo]
  activity: {},          // jobId -> [entry]
  previews: {},          // photoId -> objectURL (local, pre-upload)
  pending: 0,            // photos waiting for upload
  online: navigator.onLine,
  lastSync: null
};

const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = () => { listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); };

const fireAndForget = (p, what) => { p.catch(e => { console.error(what, e); toast(`${what} failed: ${e.code || e.message}`, 'error'); }); return p; };

export const me = () => (state.user ? state.user.uid : null);
export const myName = () => (state.member && state.member.name) || (state.user && (state.user.displayName || state.user.email)) || 'Unknown';
export const isManager = () => !!state.member && ['owner', 'manager'].includes(state.member.role);
export const isOwner = () => !!state.member && state.member.role === 'owner';

export const jobById = id => state.jobs.find(j => j.id === id) || null;
export const aircraftByTail = tail => state.aircraft.find(a => a.id === String(tail || '').toUpperCase()) || null;
export const memberName = uid_ => { const m = state.members.find(x => x.id === uid_); return m ? m.name : '—'; };

// ---------------------------------------------------------------------------
// Boot + auth
// ---------------------------------------------------------------------------
let unsubs = [];

export function boot() {
  window.addEventListener('online', () => { state.online = true; emit(); processQueue(); });
  window.addEventListener('offline', () => { state.online = false; emit(); });
  loadPreviews();
  A.onAuthStateChanged(auth, async user => {
    stopWatchers();
    state.user = user; state.member = null; state.noInvite = false; state.deactivated = false;
    state.jobs = []; state.aircraft = []; state.inventory = []; state.members = []; state.invites = [];
    state.photos = {}; state.activity = {};
    if (user) await resolveMember(user);
    state.authReady = true;
    emit();
    if (state.member) { await ensureClaims(user); startWatchers(); processQueue(); }
  });
}

// Storage rules gate photo uploads on a custom auth claim ("stratos": role),
// stamped by the stratos-claims Cloud Function. Firebase idToken travels in
// X-Auth-Token because Cloud Run intercepts foreign Authorization headers.
const CLAIMS_URL = 'https://stratos-claims-qfv7mm5hva-uc.a.run.app';
async function ensureClaims(user) {
  try {
    const tok = await user.getIdTokenResult();
    if (tok.claims.stratos === (state.member && state.member.role)) return;
    const r = await fetch(CLAIMS_URL, { method: 'POST', headers: { 'X-Auth-Token': tok.token } });
    if (r.ok) await user.getIdToken(true); // refresh so the new claim is live
  } catch (e) { console.warn('claims', e); }
}

async function resolveMember(user) {
  try {
    const mref = F.doc(db, 'members', user.uid);
    let snap = await F.getDoc(mref);
    if (!snap.exists()) {
      const email = (user.email || '').toLowerCase();
      if (!email) { state.noInvite = true; return; }
      const inv = await F.getDoc(F.doc(db, 'invites', email));
      if (!inv.exists()) { state.noInvite = true; return; }
      await F.setDoc(mref, {
        email,
        name: inv.data().name || user.displayName || email.split('@')[0],
        role: inv.data().role,
        active: true,
        createdAt: F.serverTimestamp()
      });
      snap = await F.getDoc(mref);
    }
    const m = { id: user.uid, ...snap.data() };
    if (m.active === false) { state.deactivated = true; return; }
    state.member = m;
  } catch (e) {
    console.error('resolveMember', e);
    state.noInvite = true;
  }
}

export const signIn = (email, pw) => A.signInWithEmailAndPassword(auth, email.trim(), pw);
export async function signUp(email, pw, name) {
  const cred = await A.createUserWithEmailAndPassword(auth, email.trim(), pw);
  if (name) { try { await A.updateProfile(cred.user, { displayName: name }); } catch (e) { console.warn(e); } }
  return cred;
}
export const resetPassword = email => A.sendPasswordResetEmail(auth, email.trim());
export const logOut = () => A.signOut(auth);

// ---------------------------------------------------------------------------
// Live watchers
// ---------------------------------------------------------------------------
function startWatchers() {
  const watch = (q, key) => unsubs.push(F.onSnapshot(q, snap => {
    state[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.lastSync = new Date();
    emit();
  }, err => console.error('watch', key, err)));

  watch(F.query(F.collection(db, 'jobs'), F.orderBy('scheduledAt', 'desc'), F.limit(500)), 'jobs');
  watch(F.query(F.collection(db, 'aircraft'), F.orderBy('tail')), 'aircraft');
  watch(F.query(F.collection(db, 'inventory'), F.orderBy('name')), 'inventory');
  watch(F.query(F.collection(db, 'members'), F.orderBy('name')), 'members');
  watch(F.query(F.collection(db, 'stockLog'), F.orderBy('at', 'desc'), F.limit(50)), 'stockLog');
  if (isManager()) watch(F.query(F.collection(db, 'invites'), F.orderBy('createdAt', 'desc')), 'invites');
  unsubs.push(F.onSnapshot(F.doc(db, 'settings', 'org'), s => { state.org = s.exists() ? s.data() : null; emit(); }, err => console.error('org', err)));
}
function stopWatchers() { unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; }

// Per-job photos + activity. Returns an unsubscribe fn.
export function watchJob(jobId) {
  const u1 = F.onSnapshot(
    F.query(F.collection(db, 'jobs', jobId, 'photos'), F.orderBy('takenAt', 'asc')),
    snap => { state.photos[jobId] = snap.docs.map(d => ({ id: d.id, ...d.data() })); emit(); },
    err => console.error('photos', err));
  const u2 = F.onSnapshot(
    F.query(F.collection(db, 'jobs', jobId, 'activity'), F.orderBy('at', 'desc'), F.limit(200)),
    snap => { state.activity[jobId] = snap.docs.map(d => ({ id: d.id, ...d.data() })); emit(); },
    err => console.error('activity', err));
  return () => { u1(); u2(); };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
const act = (type, text) => ({ type, text, by: me(), byName: myName(), at: F.Timestamp.now() });

export function addActivity(jobId, type, text) {
  fireAndForget(F.setDoc(F.doc(db, 'jobs', jobId, 'activity', uid(12)), act(type, text)), 'Log');
}

export function createJob(d) {
  const id = uid(12);
  const svc = serviceById(d.service);
  const tail = d.tail.toUpperCase().trim();
  const job = {
    tail,
    aircraftType: d.aircraftType || '',
    service: d.service,
    serviceName: svc.name,
    status: 'scheduled',
    scheduledAt: F.Timestamp.fromDate(d.scheduledAt),
    airport: d.airport || 'OTHER',
    fbo: d.fbo || '',
    customer: { name: d.customerName || '', email: d.customerEmail || '', phone: d.customerPhone || '' },
    assigned: d.assigned || [],
    notes: d.notes || '',
    checklist: svc.checklist.map(label => ({ label, done: false, by: '', at: null })),
    inspection: { before: {}, after: {} },
    consumables: {},
    photoCount: 0, beforeCount: 0, afterCount: 0,
    shareToken: '',
    createdBy: me(), createdByName: myName(),
    createdAt: F.Timestamp.now(), updatedAt: F.serverTimestamp()
  };
  const b = F.writeBatch(db);
  b.set(F.doc(db, 'jobs', id), job);
  const existing = aircraftByTail(tail);
  const ac = {
    tail,
    type: job.aircraftType || (existing ? existing.type : ''),
    operator: job.customer.name || (existing ? existing.operator : ''),
    base: job.airport !== 'OTHER' ? job.airport : (existing ? existing.base : ''),
    jobCount: F.increment(1),
    lastScheduledAt: job.scheduledAt,
    updatedAt: F.serverTimestamp()
  };
  if (!existing) ac.createdAt = F.Timestamp.now();
  b.set(F.doc(db, 'aircraft', tail), ac, { merge: true });
  b.set(F.doc(db, 'jobs', id, 'activity', uid(12)), act('created', `Job created — ${svc.name}`));
  fireAndForget(b.commit(), 'Create job');
  return id;
}

export function updateJob(id, patch, activityText) {
  patch.updatedAt = F.serverTimestamp();
  const b = F.writeBatch(db);
  b.update(F.doc(db, 'jobs', id), patch);
  if (activityText) b.set(F.doc(db, 'jobs', id, 'activity', uid(12)), act('update', activityText));
  fireAndForget(b.commit(), 'Update');
}

export function startJob(id) {
  updateJob(id, { status: 'in_progress' }, 'Work started');
}
export function submitForQA(id) {
  updateJob(id, { status: 'awaiting_qa' }, 'Submitted for QA');
}
export function approveQA(id, note) {
  const job = jobById(id);
  updateJob(id, {
    status: 'approved',
    'qa.by': me(), 'qa.byName': myName(), 'qa.at': F.Timestamp.now(), 'qa.note': note || '',
    completedAt: F.Timestamp.now()
  }, note ? `QA approved — ${note}` : 'QA approved');
  if (job) fireAndForget(F.setDoc(F.doc(db, 'aircraft', job.tail), { lastServiceAt: F.Timestamp.now(), updatedAt: F.serverTimestamp() }, { merge: true }), 'Aircraft update');
}
export function requestRework(id, note) {
  updateJob(id, { status: 'in_progress' }, `Rework requested${note ? ' — ' + note : ''}`);
}
export function cancelJob(id) {
  updateJob(id, { status: 'cancelled' }, 'Job cancelled');
}
export function deleteJob(id) {
  fireAndForget(F.deleteDoc(F.doc(db, 'jobs', id)), 'Delete job');
}

export function toggleChecklist(jobId, idx) {
  const job = jobById(jobId); if (!job || !Array.isArray(job.checklist)) return;
  const list = job.checklist.map(it => ({ ...it }));
  if (!list[idx]) return;
  const done = !list[idx].done;
  list[idx] = { ...list[idx], done, by: done ? myName() : '', at: done ? F.Timestamp.now() : null };
  updateJob(jobId, { checklist: list });
}

export function setStepData(jobId, phase, stepId, patch) {
  const upd = { updatedAt: F.serverTimestamp() };
  Object.keys(patch).forEach(k => { upd[`inspection.${phase}.${stepId}.${k}`] = patch[k]; });
  fireAndForget(F.updateDoc(F.doc(db, 'jobs', jobId), upd), 'Save step');
}

export function markPhaseDone(jobId, phase) {
  const job = jobById(jobId);
  const upd = { [`inspection.${phase}.completedAt`]: F.Timestamp.now() };
  if (phase === 'before' && job && job.status === 'scheduled') upd.status = 'in_progress';
  updateJob(jobId, upd, phase === 'before' ? 'Pre-service inspection complete' : 'After photos complete');
}

// ---------------------------------------------------------------------------
// Photos — capture, offline queue, upload
// ---------------------------------------------------------------------------
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('stratos-ops', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('uploads', { keyPath: 'photoId' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(rec) { const d = await idbOpen(); return new Promise((res, rej) => { const t = d.transaction('uploads', 'readwrite'); t.objectStore('uploads').put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function idbAll() { const d = await idbOpen(); return new Promise((res, rej) => { const q = d.transaction('uploads').objectStore('uploads').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); }
async function idbDel(id) { const d = await idbOpen(); return new Promise((res, rej) => { const t = d.transaction('uploads', 'readwrite'); t.objectStore('uploads').delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }

async function loadPreviews() {
  try {
    const recs = await idbAll();
    recs.forEach(r => { if (r.blob) state.previews[r.photoId] = URL.createObjectURL(r.blob); });
    state.pending = recs.length;
    if (recs.length) emit();
  } catch (e) { console.warn('previews', e); }
}

async function downscale(file, max = 1600, quality = 0.85) {
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch (e) {
    bmp = await new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = rej;
      img.src = url;
    });
  }
  const W = bmp.width || bmp.naturalWidth, H = bmp.height || bmp.naturalHeight;
  const scale = Math.min(1, max / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
  return { blob: blob || file, w, h };
}

export async function capturePhoto(files, ctx) {
  const list = Array.from(files || []).filter(f => f && f.type.startsWith('image/'));
  if (!list.length) return;
  for (const file of list) {
    try {
      const { blob, w, h } = await downscale(file);
      const photoId = uid(18);
      const path = `jobs/${ctx.jobId}/${photoId}.jpg`;
      state.previews[photoId] = URL.createObjectURL(blob);
      await idbPut({ photoId, jobId: ctx.jobId, phase: ctx.phase, stepId: ctx.stepId || '', path, blob, at: Date.now() });
      state.pending += 1;
      fireAndForget(F.setDoc(F.doc(db, 'jobs', ctx.jobId, 'photos', photoId), {
        phase: ctx.phase, stepId: ctx.stepId || '', note: ctx.note || '',
        url: '', path, w, h, pending: true,
        takenBy: me(), takenByName: myName(), takenAt: F.Timestamp.now()
      }), 'Save photo');
      const counters = { photoCount: F.increment(1), updatedAt: F.serverTimestamp() };
      if (ctx.phase === 'before') counters.beforeCount = F.increment(1);
      if (ctx.phase === 'after') counters.afterCount = F.increment(1);
      fireAndForget(F.updateDoc(F.doc(db, 'jobs', ctx.jobId), counters), 'Counters');
    } catch (e) { console.error('capture', e); toast('Photo failed: ' + (e.message || e), 'error'); }
  }
  emit();
  processQueue();
}

let processing = false;
export async function processQueue() {
  if (processing || !state.member || !navigator.onLine) return;
  processing = true;
  try {
    const recs = await idbAll();
    state.pending = recs.length; emit();
    for (const r of recs) {
      try {
        const sref = S.ref(storage, r.path);
        await S.uploadBytes(sref, r.blob, { contentType: 'image/jpeg' });
        const url = await S.getDownloadURL(sref);
        await F.updateDoc(F.doc(db, 'jobs', r.jobId, 'photos', r.photoId), { url, pending: false });
        // First uploaded photo of each phase becomes the job's dashboard cover.
        const jb = jobById(r.jobId);
        if (jb) {
          if (r.phase === 'before' && !jb.coverBefore) fireAndForget(F.updateDoc(F.doc(db, 'jobs', r.jobId), { coverBefore: url }), 'Cover');
          if (r.phase === 'after' && !jb.coverAfter) fireAndForget(F.updateDoc(F.doc(db, 'jobs', r.jobId), { coverAfter: url }), 'Cover');
        }
        await idbDel(r.photoId);
        state.pending = Math.max(0, state.pending - 1);
        emit();
      } catch (e) {
        console.warn('upload', r.photoId, e.code || e.message);
        break; // stop the loop; retried on next online/processQueue
      }
    }
  } catch (e) { console.error('queue', e); }
  finally { processing = false; }
}

export function deletePhoto(jobId, photo) {
  const b = F.writeBatch(db);
  b.delete(F.doc(db, 'jobs', jobId, 'photos', photo.id));
  const counters = { photoCount: F.increment(-1), updatedAt: F.serverTimestamp() };
  if (photo.phase === 'before') counters.beforeCount = F.increment(-1);
  if (photo.phase === 'after') counters.afterCount = F.increment(-1);
  b.update(F.doc(db, 'jobs', jobId), counters);
  fireAndForget(b.commit(), 'Delete photo');
  idbDel(photo.id).catch(() => {});
  if (photo.path && photo.url) fireAndForget(S.deleteObject(S.ref(storage, photo.path)).catch(e => { if (e.code !== 'storage/object-not-found') throw e; }), 'Delete file');
}

// Vector marks + a note saved onto a photo. This is the condition/damage record.
export function annotatePhoto(jobId, photoId, annotation) {
  const marks = (annotation.marks || []).slice(0, 200);
  const note = (annotation.note || '').slice(0, 500);
  const clean = { marks, note, by: me(), byName: myName(), at: F.Timestamp.now() };
  const marked = marks.length > 0 || !!note;
  fireAndForget(F.updateDoc(F.doc(db, 'jobs', jobId, 'photos', photoId), { annotation: clean, marked }), 'Mark');
  if (marked) addActivity(jobId, 'mark', `Marked condition on a photo${note ? ' — ' + note : ''}`);
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
export function useStock(jobId, itemId, delta) {
  if (!delta) return;
  const item = state.inventory.find(i => i.id === itemId);
  const b = F.writeBatch(db);
  b.update(F.doc(db, 'inventory', itemId), { qty: F.increment(-delta), updatedAt: F.serverTimestamp() });
  b.update(F.doc(db, 'jobs', jobId), { [`consumables.${itemId}`]: F.increment(delta), updatedAt: F.serverTimestamp() });
  b.set(F.doc(db, 'stockLog', uid(14)), {
    itemId, itemName: item ? item.name : itemId, delta: -delta,
    reason: 'job', jobId, by: me(), byName: myName(), at: F.Timestamp.now()
  });
  fireAndForget(b.commit(), 'Stock');
}

export function adjustStock(itemId, delta, reason) {
  const item = state.inventory.find(i => i.id === itemId);
  const b = F.writeBatch(db);
  b.update(F.doc(db, 'inventory', itemId), { qty: F.increment(delta), updatedAt: F.serverTimestamp() });
  b.set(F.doc(db, 'stockLog', uid(14)), {
    itemId, itemName: item ? item.name : itemId, delta,
    reason: reason || 'adjustment', jobId: '', by: me(), byName: myName(), at: F.Timestamp.now()
  });
  fireAndForget(b.commit(), 'Stock');
}

export function saveInventoryItem(id, data) {
  const ref = F.doc(db, 'inventory', id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || uid(10));
  fireAndForget(F.setDoc(ref, { ...data, updatedAt: F.serverTimestamp() }, { merge: true }), 'Inventory');
}
export function deleteInventoryItem(id) {
  fireAndForget(F.deleteDoc(F.doc(db, 'inventory', id)), 'Inventory');
}

// ---------------------------------------------------------------------------
// Aircraft
// ---------------------------------------------------------------------------
export function upsertAircraft(tail, data) {
  const T = String(tail).toUpperCase().trim();
  const patch = { ...data, tail: T, updatedAt: F.serverTimestamp() };
  if (!aircraftByTail(T)) patch.createdAt = F.Timestamp.now();
  fireAndForget(F.setDoc(F.doc(db, 'aircraft', T), patch, { merge: true }), 'Aircraft');
}
export function deleteAircraft(tail) {
  fireAndForget(F.deleteDoc(F.doc(db, 'aircraft', String(tail).toUpperCase())), 'Aircraft');
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------
export function invite(email, name, role) {
  const em = email.trim().toLowerCase();
  fireAndForget(F.setDoc(F.doc(db, 'invites', em), {
    role, name: name || '', invitedBy: myName(), createdAt: F.Timestamp.now()
  }), 'Invite');
  return em;
}
export function removeInvite(email) {
  fireAndForget(F.deleteDoc(F.doc(db, 'invites', email)), 'Invite');
}
export function setMemberActive(uid_, active) {
  fireAndForget(F.updateDoc(F.doc(db, 'members', uid_), { active }), 'Member');
}
export function setMemberRole(uid_, role) {
  fireAndForget(F.updateDoc(F.doc(db, 'members', uid_), { role }), 'Member');
}

// ---------------------------------------------------------------------------
// Settings + share links
// ---------------------------------------------------------------------------
export function saveOrg(data) {
  fireAndForget(F.setDoc(F.doc(db, 'settings', 'org'), { ...data, updatedAt: F.serverTimestamp() }, { merge: true }), 'Settings');
}

const ms = v => { const d = toDate(v); return d ? d.getTime() : null; };

export async function createShare(jobId) {
  const job = jobById(jobId);
  if (!job) throw new Error('Job not found');
  const snap = await F.getDocs(F.query(F.collection(db, 'jobs', jobId, 'photos'), F.orderBy('takenAt', 'asc')));
  const photos = snap.docs.map(d => d.data()).filter(p => p.url)
    .map(p => ({ phase: p.phase, stepId: p.stepId || '', url: p.url, note: p.note || '', annotation: p.annotation || null, takenAt: ms(p.takenAt) }));
  const token = uid(24);
  const inspection = {};
  ['before', 'after'].forEach(ph => {
    inspection[ph] = {};
    const src = (job.inspection && job.inspection[ph]) || {};
    Object.keys(src).forEach(k => {
      if (k === 'completedAt') { inspection[ph].completedAt = ms(src[k]); return; }
      inspection[ph][k] = { conditions: src[k].conditions || [], note: src[k].note || '' };
    });
  });
  const doc = {
    jobId, tail: job.tail, aircraftType: job.aircraftType || '', serviceName: job.serviceName,
    airport: job.airport, fbo: job.fbo || '',
    scheduledAt: ms(job.scheduledAt), completedAt: ms(job.completedAt),
    customer: job.customer || {}, crewNames: (job.assigned || []).map(memberName),
    checklist: (job.checklist || []).map(c => ({ label: c.label, done: !!c.done })),
    inspection, photos,
    qa: job.qa ? { byName: job.qa.byName || '', at: ms(job.qa.at), note: job.qa.note || '' } : null,
    org: state.org ? { name: state.org.name, phone: state.org.phone, email: state.org.email, website: state.org.website, address: state.org.address } : null,
    createdAt: Date.now(), createdByName: myName()
  };
  await F.setDoc(F.doc(db, 'shares', token), doc);
  updateJob(jobId, { shareToken: token });
  return token;
}

export async function fetchShare(token) {
  const s = await F.getDoc(F.doc(db, 'shares', token));
  return s.exists() ? s.data() : null;
}
