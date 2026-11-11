import { config } from '../config.js';
import {
  clearLoginFailures,
  createSession,
  destroySession,
  destroyUserSessions,
  findUserForLogin,
  loginBlocked,
  recordLoginFailure,
  roleHome,
} from '../auth.js';
import { hashPassword, verifyPassword } from '../password.js';
import { audit } from '../accounts.js';
import { clientIp, esc, html, redirect, setCookie } from '../http.js';
import { icon, layout, panel, publicPage } from '../views.js';

export const ALL_ROLES = Object.keys(roleHome).filter((role) => role !== 'admin');

function loginView({ error = '', identifier = '', next = '' } = {}) {
  return publicPage(
    'Sign in',
    `<div class="login">
      <section class="login-hero">
        <div class="hero-brand">
          <span class="crest">M</span>
          <div><strong>${esc(config.school)}</strong><small>${esc(config.motto)}</small></div>
        </div>
        <div class="hero-main">
          <span class="hero-kicker"><span class="dot"></span>School portal · ${esc(config.term)} ${config.year}</span>
          <h1>One portal for the <span>whole school.</span></h1>
          <p>Reports, fees, timetables, revision and complaints — each person sees exactly what their role allows.</p>
          <ul class="hero-features">
            <li><span class="feature-check">${icon('check')}</span>Separate portals for leadership, staff, students and parents</li>
            <li><span class="feature-check">${icon('check')}</span>Live fee balances, receipts and printable report cards</li>
            <li><span class="feature-check">${icon('check')}</span>Timetables, exam dates and a school-wide complaint box</li>
          </ul>
        </div>
        <div class="hero-foot">
          <span>${esc(config.address)}</span>
          <span>${esc(config.phone)}</span>
        </div>
      </section>
      <section class="login-side">
        <div class="login-card">
          <a class="login-site-link" href="/">← Back to the school website</a>
          <h2>Welcome back</h2>
          <p>Sign in with the school account allocated to you. Students may use their admission number.</p>
          <form method="post" action="/login" class="login-form">
            <input type="hidden" name="next" value="${esc(next)}">
            <div class="field">
              <label for="identifier">Email or admission number</label>
              <input id="identifier" name="identifier" value="${esc(identifier)}" autocomplete="username" required autofocus>
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required>
            </div>
            <button class="btn block" type="submit">Sign in ${icon('arrow')}</button>
          </form>
          ${error ? `<div class="flash error login-error">${icon('alert')}<span>${esc(error)}</span></div>` : ''}
          <p class="login-help">Forgotten your password or need an account? Contact the school office on ${esc(config.phone)}.</p>
        </div>
      </section>
    </div>`
  );
}

function passwordView(ctx, { error = '' } = {}) {
  const forced = Number(ctx.user.must_change_password) === 1;
  return html(
    layout(
      ctx,
      forced ? 'Choose a new password' : 'Change password',
      `<div class="split">
        <div>
          ${panel({
            title: forced ? 'Set your own password' : 'Change your password',
            subtitle: forced
              ? 'Your account was created with a temporary password. Choose a private password to continue.'
              : 'Use at least 8 characters, including a letter and a number.',
            body: `<form method="post" action="/account/password" class="form-grid">
              <div class="field span-2"><label for="current">Current password</label>
                <input id="current" name="current" type="password" autocomplete="current-password" required autofocus>
              </div>
              <div class="field"><label for="next">New password</label>
                <input id="next" name="next" type="password" autocomplete="new-password" minlength="8" required>
              </div>
              <div class="field"><label for="confirm">Confirm new password</label>
                <input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" required>
              </div>
              <div class="form-actions span-2">
                <button class="btn" type="submit">${icon('shield')} Save password</button>
              </div>
            </form>${error ? `<div class="flash error" style="margin-top:14px">${icon('alert')}<span>${esc(error)}</span></div>` : ''}`,
          })}
        </div>
        ${panel({
          title: 'Keeping your account safe',
          body: `<div class="list">
            <div class="list-item"><span class="material-icon">${icon('shield')}</span><div class="list-copy"><strong>Private to you</strong><small>Never share your password with another student, parent or member of staff.</small></div></div>
            <div class="list-item"><span class="material-icon">${icon('user')}</span><div class="list-copy"><strong>Your school email</strong><small>${esc(ctx.user.email)}</small></div></div>
            <div class="list-item"><span class="material-icon">${icon('mail')}</span><div class="list-copy"><strong>Need help?</strong><small>Contact the school administrator on ${esc(config.phone)}.</small></div></div>
          </div>`,
        })}
      </div>`,
      { active: '' }
    )
  );
}

export function register(r) {
  r.get('/login', ['public'], (ctx) => {
    if (ctx.user) return redirect(roleHome[ctx.user.role]);
    const next =
      typeof ctx.query.next === 'string' && ctx.query.next.startsWith('/') && !ctx.query.next.startsWith('//')
        ? ctx.query.next
        : '';
    return html(loginView({ identifier: ctx.query.email || '', next }));
  });

  r.post('/login', ['public'], (ctx) => {
    const identifier = String(ctx.fields.identifier || '').trim();
    const password = String(ctx.fields.password || '');
    const next = String(ctx.fields.next || '');
    const ip = clientIp(ctx.req);
    if (!identifier || !password) {
      return html(loginView({ error: 'Enter your email or admission number and password.', identifier, next }), 400);
    }
    if (loginBlocked(ctx.db, identifier, ip)) {
      return html(
        loginView({
          error: 'Too many failed attempts. Please wait 15 minutes before trying again.',
          identifier,
          next,
        }),
        429
      );
    }
    const user = findUserForLogin(ctx.db, identifier);
    if (!user || user.role === 'admin' || !verifyPassword(password, user.password_hash)) {
      recordLoginFailure(ctx.db, identifier, ip);
      return html(loginView({ error: 'Those credentials do not match our records.', identifier, next }), 401);
    }
    clearLoginFailures(ctx.db, identifier, ip);
    ctx.db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    const token = createSession(ctx.db, user.id);
    const destination = Number(user.must_change_password)
      ? '/account/password'
      : next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login')
        ? next
        : roleHome[user.role] || '/dashboard';
    return redirect(destination, 303, {
      'Set-Cookie': setCookie('sid', token, { maxAge: Math.floor(config.sessionTtlMs / 1000) }),
    });
  });

  r.post('/logout', null, (ctx) => {
    const wasAdmin = ctx.user?.role === 'admin';
    destroySession(ctx.db, ctx.sessionToken);
    return redirect(wasAdmin ? '/admin/login' : '/login', 303, {
      'Set-Cookie': setCookie('sid', '', { clear: true }),
    });
  });

  r.get('/account/password', null, (ctx) => passwordView(ctx));

  r.post('/account/password', null, (ctx) => {
    const current = String(ctx.fields.current || '');
    const next = String(ctx.fields.next || '').trim();
    const confirm = String(ctx.fields.confirm || '');
    const row = ctx.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(ctx.user.id);
    const fail = (message) => ({ ...passwordView(ctx, { error: message }), status: 400 });
    if (!row || !verifyPassword(current, row.password_hash)) return fail('Your current password is not correct.');
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      return fail('Choose at least 8 characters and include a letter and a number.');
    }
    if (next !== confirm) return fail('The two new passwords do not match.');
    if (next === current) return fail('Choose a password that is different from your current one.');
    ctx.db
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(hashPassword(next), ctx.user.id);
    destroyUserSessions(ctx.db, ctx.user.id, ctx.sessionToken);
    audit(ctx.db, ctx.user.id, 'password.change', {
      targetUserId: ctx.user.id,
      detail: 'Password changed by account owner',
    });
    return redirect(
      `${roleHome[ctx.user.role] || '/dashboard'}?ok=${encodeURIComponent('Your password has been updated.')}`
    );
  });

  r.get('/dashboard', null, (ctx) => redirect(roleHome[ctx.user.role] || '/login'));
}
