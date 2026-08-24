// Sign in — username + password only. Two friends, no email, no invites, no reset.
// (An "Owner sign-in" fallback lets the owner in with their email if ever needed.)
import { state, signIn, logOut } from '../store.js';
import { esc, toast, icon } from '../util.js';
import { USERS, emailForUser } from '../constants.js';

let selected = null;   // chosen username
let ownerMode = false; // owner email fallback
let busy = false;

const ERR = {
  'auth/invalid-credential': 'Wrong password. Try again.',
  'auth/wrong-password': 'Wrong password. Try again.',
  'auth/user-not-found': 'That name is not set up yet.',
  'auth/invalid-email': 'That does not look right.',
  'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
  'auth/network-request-failed': 'No connection. Check the internet and try again.',
  'auth/missing-password': 'Type the password.'
};
const friendly = e => ERR[e && e.code] || (e && e.message) || 'Something went wrong.';
const initial = s => String(s || '?').trim().charAt(0).toUpperCase();

export function login() {
  const html = `
  <div class="auth-box">
    <div class="auth-brand">
      <img src="/images/logo-emblem.png" alt="">
      <div class="word">STRATOS OPS</div>
      <h1>${ownerMode ? 'Owner sign-in' : "Who's working?"}</h1>
    </div>

    ${ownerMode ? `
    <form id="auth-form" novalidate>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" inputmode="email" autocomplete="username" placeholder="you@email.com" required></div>
      <div class="field"><label>Password</label><input class="input" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required></div>
      <div class="form-error" id="auth-err"></div>
      <button class="btn btn-gold btn-block" type="submit" ${busy ? 'disabled' : ''}>Sign in</button>
    </form>
    <div class="auth-note small"><a href="#" id="auth-back">← Back</a></div>
    ` : `
    <div class="who-grid">
      ${USERS.map(u => `
        <button type="button" class="who-card ${selected === u.username ? 'on' : ''}" data-user="${esc(u.username)}">
          <span class="who-av">${esc(initial(u.label))}</span>
          <span class="who-name">${esc(u.label)}</span>
        </button>`).join('')}
    </div>
    <form id="auth-form" novalidate>
      <div class="field">
        <input class="input" name="password" type="password" autocomplete="current-password" placeholder="${selected ? 'Password' : 'Pick your name first'}" ${selected ? '' : 'disabled'} required>
      </div>
      <div class="form-error" id="auth-err"></div>
      <button class="btn btn-gold btn-block" type="submit" ${selected && !busy ? '' : 'disabled'}>Enter</button>
    </form>
    <div class="auth-note small"><a href="#" id="auth-owner">Owner sign-in</a></div>
    `}
  </div>`;

  const bind = root => {
    const rerender = () => { root.innerHTML = login().html; bind(root); };
    const errEl = () => root.querySelector('#auth-err');

    root.querySelectorAll('.who-card').forEach(b => b.onclick = () => {
      selected = b.dataset.user;
      root.querySelectorAll('.who-card').forEach(x => x.classList.toggle('on', x === b));
      const pw = root.querySelector('input[name=password]');
      pw.disabled = false; pw.placeholder = 'Password'; pw.focus();
      root.querySelector('button[type=submit]').disabled = false;
    });

    const owner = root.querySelector('#auth-owner');
    if (owner) owner.onclick = e => { e.preventDefault(); ownerMode = true; rerender(); };
    const back = root.querySelector('#auth-back');
    if (back) back.onclick = e => { e.preventDefault(); ownerMode = false; rerender(); };

    const form = root.querySelector('#auth-form');
    form.onsubmit = async e => {
      e.preventDefault();
      if (busy) return;
      const fd = new FormData(form);
      const pw = String(fd.get('password') || '');
      const email = ownerMode ? String(fd.get('email') || '').trim() : (selected ? emailForUser(selected) : '');
      if (!email) { errEl().textContent = 'Pick your name first.'; return; }
      if (!pw) { errEl().textContent = 'Type the password.'; return; }
      busy = true; errEl().textContent = '';
      const btn = form.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
      try {
        await signIn(email, pw);
      } catch (ex) {
        errEl().textContent = friendly(ex);
        busy = false; if (btn) btn.disabled = false;
      }
    };
  };

  return { html, bind, keep: true };
}

export function noInvite() {
  const email = state.user ? state.user.email : '';
  const deactivated = state.deactivated;
  const html = `
  <div class="auth-box">
    <div class="auth-brand">
      <img src="/images/logo-emblem.png" alt="">
      <div class="word">STRATOS OPS</div>
      <h1>${deactivated ? 'Account paused' : 'Not set up'}</h1>
    </div>
    <div class="card">
      <p class="muted" style="margin-bottom:12px">
        ${deactivated
          ? `This account was turned off by an owner.`
          : `This login (<b class="gold">${esc(email)}</b>) is not set up in Stratos Ops yet.`}
      </p>
      <p class="muted">Ask George to set it up, then sign in again.</p>
      <div class="modal-actions" style="justify-content:stretch;flex-direction:column">
        <button class="btn btn-gold btn-block" id="ni-retry">${icon('refresh')} Try again</button>
        <button class="btn btn-ghost btn-block" id="ni-out">${icon('logout')} Back to sign-in</button>
      </div>
    </div>
  </div>`;
  const bind = root => {
    root.querySelector('#ni-retry').onclick = () => location.reload();
    root.querySelector('#ni-out').onclick = () => logOut();
  };
  return { html, bind, keep: true };
}
