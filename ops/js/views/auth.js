// Sign in / create account / no-invite screens.
import { state, signIn, signUp, resetPassword, logOut } from '../store.js';
import { esc, toast, icon } from '../util.js';

let mode = 'in'; // 'in' | 'up'
let busy = false;

const ERR = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email yet — tap Create account.',
  'auth/email-already-in-use': 'That email already has an account — tap Sign in.',
  'auth/weak-password': 'Password needs at least 6 characters.',
  'auth/invalid-email': 'That email does not look right.',
  'auth/too-many-requests': 'Too many tries. Wait a minute, then try again.',
  'auth/network-request-failed': 'No connection. Check the internet and try again.',
  'auth/missing-password': 'Type the password.'
};
const friendly = e => ERR[e && e.code] || (e && e.message) || 'Something went wrong.';

export function login() {
  const html = `
  <div class="auth-box">
    <div class="auth-brand">
      <img src="/images/logo-emblem.png" alt="">
      <div class="word">STRATOS OPS</div>
      <h1>${mode === 'in' ? 'Welcome back' : 'Join the crew'}</h1>
    </div>
    <div class="auth-tabs">
      <button type="button" data-mode="in" class="${mode === 'in' ? 'on' : ''}">Sign in</button>
      <button type="button" data-mode="up" class="${mode === 'up' ? 'on' : ''}">Create account</button>
    </div>
    <form id="auth-form" novalidate>
      ${mode === 'up' ? `
      <div class="field">
        <label>Your name</label>
        <input class="input" name="name" autocomplete="name" placeholder="Full name">
      </div>` : ''}
      <div class="field">
        <label>Email</label>
        <input class="input" name="email" type="email" autocomplete="username" inputmode="email" placeholder="you@company.com" required>
      </div>
      <div class="field">
        <label>Password</label>
        <input class="input" name="password" type="password" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}" placeholder="••••••••" required>
      </div>
      <div class="form-error" id="auth-err"></div>
      <button class="btn btn-gold btn-block" type="submit" ${busy ? 'disabled' : ''}>${mode === 'in' ? 'Sign in' : 'Create account'}</button>
    </form>
    <div class="auth-note small">
      ${mode === 'in'
        ? '<a href="#" id="auth-forgot">Forgot password?</a>'
        : '<span class="muted">Accounts work only for invited emails. Ask your manager for an invite.</span>'}
    </div>
  </div>`;

  const bind = root => {
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      mode = b.dataset.mode; busy = false;
      // re-render just this container
      root.innerHTML = login().html; bind(root);
    });
    const form = root.querySelector('#auth-form');
    const err = () => root.querySelector('#auth-err');
    form.onsubmit = async e => {
      e.preventDefault();
      if (busy) return;
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const pw = String(fd.get('password') || '');
      if (!email || !pw) { err().textContent = 'Email and password are both needed.'; return; }
      busy = true; err().textContent = '';
      form.querySelector('button[type=submit]').disabled = true;
      try {
        if (mode === 'in') await signIn(email, pw);
        else await signUp(email, pw, String(fd.get('name') || '').trim());
      } catch (ex) {
        err().textContent = friendly(ex);
        busy = false;
        const btn = form.querySelector('button[type=submit]');
        if (btn) btn.disabled = false;
      }
    };
    const forgot = root.querySelector('#auth-forgot');
    if (forgot) forgot.onclick = async e => {
      e.preventDefault();
      const email = String(new FormData(form).get('email') || '').trim();
      if (!email) { err().textContent = 'Type the email first, then tap Forgot password.'; return; }
      try { await resetPassword(email); toast('Reset email sent to ' + email, 'ok'); }
      catch (ex) { err().textContent = friendly(ex); }
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
      <h1>${deactivated ? 'Account paused' : 'No invite yet'}</h1>
    </div>
    <div class="card">
      <p class="muted" style="margin-bottom:12px">
        ${deactivated
          ? `The account <b class="gold">${esc(email)}</b> was deactivated by a manager.`
          : `You are signed in as <b class="gold">${esc(email)}</b>, but that email has no crew invite.`}
      </p>
      <p class="muted">Ask the Stratos manager to ${deactivated ? 'reactivate you' : 'invite this email'} in <b>Team</b>, then tap the button below.</p>
      <div class="modal-actions" style="justify-content:stretch;flex-direction:column">
        <button class="btn btn-gold btn-block" id="ni-retry">${icon('refresh')} Check again</button>
        <button class="btn btn-ghost btn-block" id="ni-out">${icon('logout')} Sign out</button>
      </div>
    </div>
  </div>`;
  const bind = root => {
    root.querySelector('#ni-retry').onclick = () => location.reload();
    root.querySelector('#ni-out').onclick = () => logOut();
  };
  return { html, bind, keep: true };
}
