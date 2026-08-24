// Team — members, roles, invites.
import { state, isManager, isOwner, invite, removeInvite, setMemberActive, setMemberRole, me } from '../store.js';
import { esc, icon, fmtDateShort, formDialog, confirmDialog, toast } from '../util.js';
import { ROLES, APP_URL } from '../constants.js';

const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

export function page() {
  const mgr = isManager();
  const owner = isOwner();
  const memberEmails = new Set(state.members.map(m => (m.email || '').toLowerCase()));
  const pending = (state.invites || []).filter(i => !memberEmails.has(i.id));

  const html = `
  <div class="page-head">
    <div>
      <div class="kicker">People</div>
      <h1 class="display">Team</h1>
    </div>
    ${mgr ? `<div class="page-actions"><button class="btn btn-gold" data-action="invite">${icon('plus')} Invite</button></div>` : ''}
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title"><span class="kicker">Members</span></div>
    ${state.members.map(m => `
      <div class="list-row" style="${m.active === false ? 'opacity:.5' : ''}">
        <div class="avatar">${esc(initials(m.name))}</div>
        <div class="list-main">
          <div class="list-title">${esc(m.name)}${m.id === me() ? ' <span class="faint small">(you)</span>' : ''}</div>
          <div class="list-sub">${esc(m.email)}</div>
        </div>
        ${mgr && m.id !== me() && (owner || m.role !== 'owner')
          ? `<select class="input" style="width:auto;padding:7px 30px 7px 10px" data-action="role" data-uid="${esc(m.id)}">
              ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${m.role === k ? 'selected' : ''} ${k === 'owner' && !owner ? 'disabled' : ''}>${v}</option>`).join('')}
            </select>
            <button class="btn btn-sm ${m.active === false ? 'btn-outline' : 'btn-ghost'}" data-action="active" data-uid="${esc(m.id)}" data-to="${m.active === false ? 'true' : 'false'}">${m.active === false ? 'Reactivate' : 'Deactivate'}</button>`
          : `<span class="badge badge-muted">${esc(ROLES[m.role] || m.role)}</span>`}
      </div>`).join('') || '<div class="empty small">Nobody yet.</div>'}
  </div>

  ${mgr ? `<div class="card">
    <div class="card-title"><span class="kicker">Invites waiting</span></div>
    ${pending.map(i => `
      <div class="list-row">
        <div class="avatar">${icon('mail')}</div>
        <div class="list-main">
          <div class="list-title">${esc(i.name || i.id)}</div>
          <div class="list-sub">${esc(i.id)} · ${esc(ROLES[i.role] || i.role)} · invited ${fmtDateShort(i.createdAt)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="copy-invite" data-email="${esc(i.id)}">Copy invite</button>
        <button class="btn btn-danger btn-sm" data-action="rm-invite" data-email="${esc(i.id)}">${icon('trash')}</button>
      </div>`).join('') || '<div class="empty small">No open invites. Tap Invite to add crew.</div>'}
    <div class="small faint" style="margin-top:10px">An invited person opens <b>stratosjetdetail.com/ops</b>, taps <b>Create account</b>, and uses the invited email. Access starts immediately.</div>
  </div>` : ''}`;

  const inviteText = email => `You're invited to Stratos Ops.\n1. Open ${APP_URL}\n2. Tap "Create account"\n3. Use this email: ${email}\nThat's it — you're in.`;

  const bind = root => {
    root.onclick = async e => {
      const el = e.target.closest('[data-action]');
      if (!el || el.tagName === 'SELECT') return;
      const a = el.dataset.action;
      if (a === 'invite') {
        const r = await formDialog('Invite to Stratos Ops', `
          <div class="field"><label>Email</label><input class="input" name="email" type="email" required placeholder="crew@stratosjetdetail.com"></div>
          <div class="field"><label>Name</label><input class="input" name="name" placeholder="Full name"></div>
          <div class="field"><label>Role</label><select class="input" name="role">
            <option value="crew">Crew — jobs, photos, checklists</option>
            <option value="manager">Manager — everything + QA + team</option>
            ${owner ? '<option value="owner">Owner — full control</option>' : ''}
          </select></div>`, { ok: 'Create invite' });
        if (r && r.email) {
          const em = invite(r.email, r.name, r.role || 'crew');
          try { await navigator.clipboard.writeText(inviteText(em)); toast('Invite created — instructions copied', 'ok'); }
          catch (x) { toast('Invite created for ' + em, 'ok'); }
        }
      }
      if (a === 'copy-invite') {
        try { await navigator.clipboard.writeText(inviteText(el.dataset.email)); toast('Invite instructions copied', 'ok'); }
        catch (x) { toast(inviteText(el.dataset.email)); }
      }
      if (a === 'rm-invite' && await confirmDialog('Remove invite?', el.dataset.email + ' will not be able to join.', { ok: 'Remove', danger: true })) removeInvite(el.dataset.email);
      if (a === 'active') {
        const to = el.dataset.to === 'true';
        if (to || await confirmDialog('Deactivate member?', 'They lose access until reactivated. Their history stays.', { ok: 'Deactivate', danger: true }))
          setMemberActive(el.dataset.uid, to);
      }
    };
    root.querySelectorAll('select[data-action="role"]').forEach(s => s.onchange = () => {
      setMemberRole(s.dataset.uid, s.value);
      toast('Role updated', 'ok');
    });
  };
  return { html, bind };
}
