// Settings (org info, account, sync) and the mobile "More" menu.
import { state, isManager, saveOrg, logOut, processQueue, me } from '../store.js';
import { esc, icon, toast, formDialog } from '../util.js';
import { VERSION, ROLES } from '../constants.js';
import { F, db } from '../firebase.js';

export function page() {
  const mgr = isManager();
  const org = state.org || {};
  const m = state.member || {};

  const html = `
  <div class="page-head">
    <div>
      <div class="kicker">Setup</div>
      <h1 class="display">Settings</h1>
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title"><span class="kicker">Your account</span></div>
    <div class="list-row">
      <div class="avatar">${esc(String(m.name || '?')[0] || '?').toUpperCase()}</div>
      <div class="list-main">
        <div class="list-title">${esc(m.name || '')}</div>
        <div class="list-sub">${esc(m.email || '')} · ${esc(ROLES[m.role] || m.role || '')}</div>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="rename">${icon('edit')} Name</button>
    </div>
    <button class="btn btn-ghost" data-action="signout" style="margin-top:8px">${icon('logout')} Sign out</button>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title"><span class="kicker">Sync</span></div>
    <div class="muted small" style="margin-bottom:10px">
      ${state.online ? 'Online — everything saves straight to the cloud.' : 'Offline — work is saved on this phone and syncs by itself when signal returns.'}
      ${state.pending ? `<br>${state.pending} photo${state.pending === 1 ? '' : 's'} waiting to upload.` : ''}
    </div>
    <button class="btn btn-outline btn-sm" data-action="sync">${icon('refresh')} Sync now</button>
  </div>

  ${mgr ? `<form class="card" id="org-form" style="margin-bottom:14px">
    <div class="card-title"><span class="kicker">Company</span></div>
    <div class="field"><label>Name</label><input class="input" name="name" value="${esc(org.name || '')}"></div>
    <div class="field-row">
      <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(org.phone || '')}"></div>
      <div class="field"><label>Email</label><input class="input" name="email" value="${esc(org.email || '')}"></div>
    </div>
    <div class="field"><label>Website</label><input class="input" name="website" value="${esc(org.website || '')}"></div>
    <div class="field"><label>Address</label><input class="input" name="address" value="${esc(org.address || '')}"></div>
    <div class="small faint" style="margin-bottom:10px">This is what customers see on service reports.</div>
    <button class="btn btn-gold btn-sm" type="submit">Save company info</button>
  </form>` : ''}

  <div class="card">
    <div class="card-title"><span class="kicker">Install on a phone</span></div>
    <div class="muted small">
      Open <b class="gold">stratosjetdetail.com/ops</b> in Chrome or Safari → browser menu → <b>Add to Home Screen</b>.
      It installs like an app, works offline in the hangar, and photos upload when signal returns.
    </div>
    <hr class="hr">
    <div class="faint small">Stratos Ops v${VERSION}</div>
  </div>`;

  const bind = root => {
    root.onclick = async e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      if (el.dataset.action === 'signout') logOut();
      if (el.dataset.action === 'sync') { processQueue(); toast('Syncing…', 'ok'); }
      if (el.dataset.action === 'rename') {
        const r = await formDialog('Your name', `<div class="field"><label>Name</label><input class="input" name="name" required value="${esc(m.name || '')}"></div>`, { ok: 'Save' });
        if (r && r.name) {
          F.updateDoc(F.doc(db, 'members', me()), { name: r.name.trim() }).then(() => toast('Saved', 'ok')).catch(x => toast(x.message, 'error'));
        }
      }
    };
    const form = root.querySelector('#org-form');
    if (form) form.onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(form);
      saveOrg({ name: fd.get('name') || '', phone: fd.get('phone') || '', email: fd.get('email') || '', website: fd.get('website') || '', address: fd.get('address') || '' });
      toast('Company info saved', 'ok');
    };
  };
  return { html, bind };
}

// Mobile "More" tab — doors to everything that has no bottom-bar slot.
export function menu() {
  const m = state.member || {};
  const rows = [
    ['reports', 'Reports', 'Monthly numbers & CSV export', '#/reports'],
    ['team', 'Team', 'Members, roles, invites', '#/team'],
    ['settings', 'Settings', 'Company info, account, sync', '#/settings']
  ];
  const html = `
  <div class="page-head">
    <div>
      <div class="kicker">Stratos Ops</div>
      <h1 class="display">More</h1>
    </div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="list-row">
      <div class="avatar">${esc(String(m.name || '?')[0] || '?').toUpperCase()}</div>
      <div class="list-main">
        <div class="list-title">${esc(m.name || '')}</div>
        <div class="list-sub">${esc(m.email || '')} · ${esc(ROLES[m.role] || m.role || '')}</div>
      </div>
    </div>
  </div>
  <div class="card">
    ${rows.map(([ic, t, s, href]) => `
      <a class="list-row" href="${href}" style="color:inherit">
        <span class="avatar">${icon(ic)}</span>
        <div class="list-main"><div class="list-title">${t}</div><div class="list-sub">${s}</div></div>
        ${icon('next')}
      </a>`).join('')}
  </div>`;
  return { html };
}
