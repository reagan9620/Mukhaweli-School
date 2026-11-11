import { config } from '../config.js';
import {
  clearLoginFailures,
  createSession,
  findUserForLogin,
  loginBlocked,
  recordLoginFailure,
} from '../auth.js';
import { verifyPassword } from '../password.js';
import {
  CREATABLE_ROLES,
  audit,
  createStudentAccount,
  createUserAccount,
  linkChildrenByAdmission,
  setAccountActive,
  setTempPassword,
} from '../accounts.js';
import { classLabel, listClasses, listParents } from '../data.js';
import { enquiryCounts, publishedAnnouncementCount } from '../public-data.js';
import { clientIp, esc, fmtDate, fmtDateTime, html, redirect, setCookie } from '../http.js';
import {
  avatar,
  badge,
  icon,
  layout,
  panel,
  publicPage,
  roleLabels,
  selectOptions,
  statCard,
  table,
} from '../views.js';

const AUDIT_LABELS = {
  'account.create': 'Account created',
  'account.reset': 'Password reset',
  'account.activate': 'Account reactivated',
  'account.deactivate': 'Account deactivated',
  'password.change': 'Password changed',
  'admin.login': 'Administrator sign-in',
  'announcement.create': 'Announcement created',
  'announcement.update': 'Announcement updated',
  'announcement.visibility': 'Announcement visibility',
  'announcement.delete': 'Announcement deleted',
  'enquiry.status': 'Enquiry updated',
};

function adminLoginView({ error = '', identifier = '' } = {}) {
  return publicPage(
    'Administrator sign in',
    `<div class="login">
      <section class="login-hero">
        <div class="hero-brand">
          <span class="crest">M</span>
          <div><strong>${esc(config.school)}</strong><small>Administration</small></div>
        </div>
        <div class="hero-main">
          <span class="hero-kicker"><span class="dot"></span>Restricted access</span>
          <h1>School <span>administration.</span></h1>
          <p>This console is for the system administrator. Accounts, portal emails and temporary passwords for every party are managed here.</p>
          <ul class="hero-features">
            <li><span class="feature-check">${icon('check')}</span>Create leadership, staff, student and parent accounts</li>
            <li><span class="feature-check">${icon('check')}</span>Allocate school emails automatically</li>
            <li><span class="feature-check">${icon('check')}</span>Issue one-time passwords and audit every change</li>
          </ul>
        </div>
        <div class="hero-foot">
          <span>${esc(config.school)}</span>
          <span>${esc(config.address)}</span>
        </div>
      </section>
      <section class="login-side">
        <div class="login-card">
          <h2>Administrator sign in</h2>
          <p>Use the super-admin credentials configured for this installation.</p>
          <form method="post" action="/admin/login" class="login-form">
            <div class="field">
              <label for="admin-identifier">Administrator email</label>
              <input id="admin-identifier" name="identifier" type="email" value="${esc(identifier)}" autocomplete="username" required autofocus>
            </div>
            <div class="field">
              <label for="admin-password">Password</label>
              <input id="admin-password" name="password" type="password" autocomplete="current-password" required>
            </div>
            <button class="btn block" type="submit">${icon('shield')} Sign in</button>
          </form>
          ${error ? `<div class="flash error login-error">${icon('alert')}<span>${esc(error)}</span></div>` : ''}
          <p class="login-help">This page is not linked from the school portal. Keep the URL private.</p>
        </div>
      </section>
    </div>`
  );
}

function dashboard(ctx) {
  const db = ctx.db;
  const roleCount = (role) =>
    Number(db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ? AND active = 1').get(role).n);
  const total = Number(
    db.prepare("SELECT COUNT(*) AS n FROM users WHERE role != 'admin' AND active = 1").get().n
  );
  const pending = Number(
    db.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role != 'admin' AND active = 1 AND must_change_password = 1"
    ).get().n
  );
  const enquiries = enquiryCounts();
  const recent = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.active, u.must_change_password, u.created_at,
              s.admission_no
       FROM users u LEFT JOIN students s ON s.user_id = u.id
       WHERE u.role != 'admin' ORDER BY u.id DESC LIMIT 8`
    )
    .all();
  const recentRows = recent.map((row) => [
    `<div class="table-avatar">${avatar(row.name)}<div><span class="table-name">${esc(row.name)}</span><span class="table-sub">${esc(row.admission_no || row.email)}</span></div></div>`,
    esc(roleLabels[row.role] || row.role),
    row.active ? badge('Active', 'good') : badge('Inactive', 'bad'),
    Number(row.must_change_password) ? badge('First login pending', 'warn') : badge('Password set', 'neutral'),
    esc(fmtDate(row.created_at)),
  ]);
  return html(
    layout(
      ctx,
      'Administration overview',
      `<section class="welcome">
        <div>
          <h2>School control centre.</h2>
          <p>Manage every portal account and publish to the public website from one private console.</p>
        </div>
        <a class="btn gold" href="/admin/users/new">${icon('plus')} Create account</a>
      </section>
      <div class="stats">
        ${statCard({ label: 'Active accounts', value: total, meta: 'All parties except administrator', iconName: 'users', href: '/admin/users' })}
        ${statCard({ label: 'Students', value: roleCount('student'), meta: 'Portal logins by admission number', iconName: 'award', href: '/admin/users?role=student' })}
        ${statCard({ label: 'Teachers', value: roleCount('teacher'), meta: 'Teaching staff accounts', iconName: 'book', href: '/admin/users?role=teacher' })}
        ${statCard({ label: 'Support staff', value: roleCount('worker'), meta: 'Workers and hostel managers', iconName: 'building', href: '/admin/users?role=worker' })}
        ${statCard({ label: 'Parents', value: roleCount('parent'), meta: 'Guardian portal accounts', iconName: 'user', href: '/admin/users?role=parent' })}
        ${statCard({ label: 'Awaiting first sign-in', value: pending, meta: 'Temporary password still in use', iconName: 'shield', tone: pending ? 'warn' : 'good', href: '/admin/users?status=pending' })}
        ${statCard({ label: 'New enquiries', value: enquiries.new, meta: 'From the public website', iconName: 'inbox', tone: enquiries.new ? 'warn' : '', href: '/admin/enquiries?status=new' })}
        ${statCard({ label: 'Published notices', value: publishedAnnouncementCount(), meta: 'Visible on the public site', iconName: 'note', href: '/admin/announcements' })}
      </div>
      <div class="split">
        ${panel({
          title: 'Recently created accounts',
          subtitle: 'Newest portal identities',
          actions: `<a class="btn small ghost" href="/admin/users">View all accounts</a>`,
          body: table(['Account', 'Role', 'Status', 'Password', 'Created'], recentRows, {
            empty: 'No accounts have been created yet.',
          }),
          flush: true,
        })}
        ${panel({
          title: 'Administration',
          body: `<div class="list">
            <a class="list-item" href="/admin/users/new">${icon('plus')}<div class="list-copy"><strong>Create an account</strong><small>Leadership, staff, students and parents.</small></div>${icon('arrowRight')}</a>
            <a class="list-item" href="/admin/users">${icon('users')}<div class="list-copy"><strong>Manage accounts</strong><small>Reset a password or deactivate a leaver.</small></div>${icon('arrowRight')}</a>
            <a class="list-item" href="/admin/announcements">${icon('note')}<div class="list-copy"><strong>Public announcements</strong><small>Publish news and notices to the school website.</small></div>${icon('arrowRight')}</a>
            <a class="list-item" href="/admin/enquiries">${icon('inbox')}<div class="list-copy"><strong>Public enquiries</strong><small>Admissions and general messages from visitors.</small></div>${icon('arrowRight')}</a>
            <a class="list-item" href="/admin/settings">${icon('settings')}<div class="list-copy"><strong>Website settings</strong><small>School name, motto, contact details and term.</small></div>${icon('arrowRight')}</a>
            <a class="list-item" href="/" target="_blank" rel="noopener">${icon('link')}<div class="list-copy"><strong>View public website</strong><small>Open the separate school website.</small></div>${icon('arrowRight')}</a>
            <a class="list-item" href="/admin/audit">${icon('clipboard')}<div class="list-copy"><strong>Audit log</strong><small>Every account and public site change is recorded.</small></div>${icon('arrowRight')}</a>
            <a class="list-item" href="/account/password">${icon('shield')}<div class="list-copy"><strong>Change my password</strong><small>Keep the super-admin account private.</small></div>${icon('arrowRight')}</a>
          </div>`,
        })}
      </div>
      <div class="notice gold">${icon('shield')}<div><strong>This console is private.</strong> It is not shown in the school portal navigation. Keep the administrator URL, email and password away from staff, students and parents.</div></div>`,
      { active: '/admin' }
    )
  );
}

function userRows(rows) {
  return rows.map((row) => {
    const toggleLabel = Number(row.active) ? 'Deactivate' : 'Reactivate';
    return [
      `<div class="table-avatar">${avatar(row.name)}<div><span class="table-name">${esc(row.name)}</span><span class="table-sub">${esc(row.email)}</span></div></div>`,
      badge(
        roleLabels[row.role] || row.role,
        ['student', 'teacher'].includes(row.role) ? 'info' : row.role === 'parent' ? 'neutral' : 'gold'
      ),
      row.admission_no ? `<span class="mono">${esc(row.admission_no)}</span>` : '—',
      esc(row.phone || '—'),
      Number(row.active) ? badge('Active', 'good') : badge('Inactive', 'bad'),
      Number(row.must_change_password) && Number(row.active) ? badge('First login pending', 'warn') : badge('Set', 'neutral'),
      esc(fmtDateTime(row.last_login_at)),
      `<div class="account-actions">
        <form method="post" action="/admin/users/${row.id}/reset" data-confirm="Issue a new temporary password for ${esc(row.name)}? Their current sessions will be signed out.">
          <button class="btn small ghost" type="submit">Reset password</button>
        </form>
        <form method="post" action="/admin/users/${row.id}/status" data-confirm="${toggleLabel} ${esc(row.name)}?">
          <button class="btn small ${Number(row.active) ? 'danger' : 'ghost'}" type="submit">${toggleLabel}</button>
        </form>
      </div>`,
    ];
  });
}

function usersPage(ctx) {
  const q = String(ctx.query.q || '').trim();
  const role = CREATABLE_ROLES.includes(ctx.query.role) ? ctx.query.role : '';
  const status = ['active', 'inactive', 'pending'].includes(ctx.query.status) ? ctx.query.status : '';
  const where = ["u.role != 'admin'"];
  const params = [];
  if (q) {
    where.push('(lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR lower(s.admission_no) LIKE ?)');
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (role) {
    where.push('u.role = ?');
    params.push(role);
  }
  if (status === 'active') where.push('u.active = 1');
  if (status === 'inactive') where.push('u.active = 0');
  if (status === 'pending') where.push('u.active = 1 AND u.must_change_password = 1');
  const rows = ctx.db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.active, u.must_change_password,
              u.last_login_at, s.admission_no
       FROM users u LEFT JOIN students s ON s.user_id = u.id
       WHERE ${where.join(' AND ')}
       ORDER BY u.name LIMIT 300`
    )
    .all(...params);
  return html(
    layout(
      ctx,
      'Portal accounts',
      `${panel({
        title: 'All portal accounts',
        subtitle: `${rows.length} account${rows.length === 1 ? '' : 's'} shown · the super-admin account is hidden`,
        actions: `<a class="btn small" href="/admin/users/new">${icon('plus')} Create account</a>`,
        body: `<form class="search-form" method="get" action="/admin/users">
            <input name="q" value="${esc(q)}" placeholder="Name, email or admission no." aria-label="Search accounts">
            <select name="role" aria-label="Filter by role">
              ${selectOptions(CREATABLE_ROLES.map((value) => ({ value, label: roleLabels[value] })), role, 'All roles')}
            </select>
            <select name="status" aria-label="Filter by status">
              ${selectOptions([
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'pending', label: 'First login pending' },
              ], status, 'Any status')}
            </select>
            <button class="btn small ghost" type="submit">${icon('search')} Search</button>
            ${q || role || status ? '<a class="btn small ghost" href="/admin/users">Clear</a>' : ''}
          </form>
          ${table(['Account', 'Role', 'Admission no.', 'Phone', 'Status', 'Password', 'Last sign-in', ''], userRows(rows), {
            empty: 'No accounts match those filters.',
          })}`,
        flush: true,
      })}`,
      { active: '/admin/users' }
    )
  );
}

function roleGroup(role) {
  if (role === 'student') return 'student';
  if (role === 'parent') return 'parent';
  return 'staff';
}

function newUserPage(ctx, { values = {}, error = '' } = {}) {
  const classes = listClasses();
  const parents = listParents();
  const role = CREATABLE_ROLES.includes(values.role) ? values.role : 'teacher';
  const group = roleGroup(role);
  const guardianMode = ['existing', 'new'].includes(values.guardian_mode) ? values.guardian_mode : 'none';
  return html(
    layout(
      ctx,
      'Create an account',
      `<div class="split">
        <div>
          ${panel({
            title: 'New portal account',
            subtitle: 'The email is allocated automatically and the password is shown once.',
            body: `${error ? `<div class="flash error">${icon('alert')}<span>${esc(error)}</span></div>` : ''}
            <form method="post" action="/admin/users" class="form-grid" data-account-form>
              <div class="field span-2"><label for="acct-role">Account type</label>
                <select id="acct-role" name="role" data-account-role required>
                  ${selectOptions(CREATABLE_ROLES.map((value) => ({ value, label: roleLabels[value] })), role, null)}
                </select>
              </div>
              <div class="field span-2"><label for="acct-name">Full name</label>
                <input id="acct-name" name="name" value="${esc(values.name || '')}" required>
              </div>
              <div class="field"><label for="acct-phone">Phone</label>
                <input id="acct-phone" name="phone" value="${esc(values.phone || '')}" placeholder="+254 ...">
              </div>
              <div class="field"><label for="acct-email">Portal email</label>
                <input id="acct-email" name="email" type="email" value="${esc(values.email || '')}" placeholder="Leave blank to allocate automatically">
                <span class="hint">Staff and parents get name-based emails. Students get admission-based emails.</span>
              </div>
              <div class="field span-2"><label for="acct-password">Temporary password</label>
                <input id="acct-password" name="password" value="${esc(values.password || '')}" placeholder="Leave blank to generate a strong one">
                <span class="hint">The account holder must change this at first sign-in.</span>
              </div>
              <div class="field span-2" data-role-group="staff"><label for="acct-position">Position / title</label>
                <input id="acct-position" name="position" value="${esc(values.position || '')}" placeholder="e.g. Mathematics Teacher">
              </div>

              <div class="section-title span-2" data-role-group="student">Student details</div>
              <div class="field" data-role-group="student"><label for="acct-admission">Admission number</label>
                <input id="acct-admission" name="admission_no" value="${esc(values.admission_no || '')}" placeholder="Auto-generated, e.g. MUK/025">
              </div>
              <div class="field" data-role-group="student"><label for="acct-class">Class</label>
                <select id="acct-class" name="class_id">
                  ${selectOptions(classes.map((cls) => ({ value: cls.id, label: classLabel(cls) })), values.class_id || '', 'Choose class')}
                </select>
              </div>
              <div class="field" data-role-group="student"><label for="acct-gender">Gender</label>
                <select id="acct-gender" name="gender">
                  ${selectOptions([{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }], values.gender || 'Female', null)}
                </select>
              </div>
              <div class="field" data-role-group="student"><label for="acct-guardian-mode">Guardian</label>
                <select id="acct-guardian-mode" name="guardian_mode" data-guardian-mode>
                  ${selectOptions([
                    { value: 'none', label: 'No guardian account' },
                    { value: 'existing', label: 'Link an existing parent' },
                    { value: 'new', label: 'Create a parent account' },
                  ], guardianMode, null)}
                </select>
              </div>
              <div class="field span-2" data-role-group="student" data-guardian-field="existing">
                <label for="acct-parent">Existing parent</label>
                <select id="acct-parent" name="parent_id">
                  ${selectOptions(parents.map((parent) => ({ value: parent.id, label: `${parent.name} — ${parent.children || 'no children linked'}` })), values.parent_id || '', 'Choose parent')}
                </select>
              </div>
              <div class="field" data-role-group="student" data-guardian-field="new"><label for="acct-parent-name">Parent name</label>
                <input id="acct-parent-name" name="parent_name" value="${esc(values.parent_name || '')}">
              </div>
              <div class="field" data-role-group="student" data-guardian-field="new"><label for="acct-parent-phone">Parent phone</label>
                <input id="acct-parent-phone" name="parent_phone" value="${esc(values.parent_phone || '')}" placeholder="+254 ...">
              </div>
              <div class="field span-2" data-role-group="student" data-guardian-field="new"><label for="acct-parent-email">Parent email</label>
                <input id="acct-parent-email" name="parent_email" type="email" value="${esc(values.parent_email || '')}" placeholder="Leave blank to allocate automatically">
              </div>

              <div class="section-title span-2" data-role-group="parent">Children</div>
              <div class="field span-2" data-role-group="parent"><label for="acct-children">Admission numbers</label>
                <textarea id="acct-children" name="children" placeholder="e.g. MUK/001, MUK/015">${esc(values.children || '')}</textarea>
                <span class="hint">Separate multiple admission numbers with commas. Students that are not found will be reported on the credential slip.</span>
              </div>

              <div class="form-actions span-2">
                <button class="btn" type="submit">${icon('plus')} Create account and issue password</button>
                <a class="btn ghost" href="/admin/users">Cancel</a>
              </div>
            </form>`,
          })}
        </div>
        ${panel({
          title: 'How allocation works',
          body: `<div class="list">
            <div class="list-item"><span class="material-icon">${icon('mail')}</span><div class="list-copy"><strong>Staff & parents</strong><small>firstname.lastname@${esc(config.domain)}, with a number added if the name is already taken.</small></div></div>
            <div class="list-item"><span class="material-icon">${icon('user')}</span><div class="list-copy"><strong>Students</strong><small>Admission-based login such as MUK/025 or muk025@${esc(config.studentDomain)}.</small></div></div>
            <div class="list-item"><span class="material-icon">${icon('shield')}</span><div class="list-copy"><strong>One-time password</strong><small>Shown once on the credential slip. The holder must set a private password at first sign-in.</small></div></div>
            <div class="list-item"><span class="material-icon">${icon('clipboard')}</span><div class="list-copy"><strong>Audited</strong><small>Every creation, reset and status change is recorded in the audit log.</small></div></div>
          </div>`,
        })}
      </div>`,
      { active: '/admin/users/new' }
    )
  );
}

function credentialsPage(ctx, { title, entries, notice = '', linked = '', missing = '', actions = true }) {
  const rows = entries
    .map(
      ([label, value]) => `<div class="credential-row"><span>${esc(label)}</span>${value}</div>`
    )
    .join('');
  return html(
    layout(
      ctx,
      title,
      `<div class="print-note no-print">
        <button class="btn small" type="button" onclick="window.print()">${icon('report')} Print credential slip</button>
        <a class="btn ghost small" href="/admin/users/new">${icon('plus')} Create another</a>
        <a class="btn ghost small" href="/admin/users">${icon('users')} All accounts</a>
      </div>
      <article class="credential-slip print-slip">
        <header class="credential-head">
          <span class="crest">M</span>
          <div><strong>${esc(config.school)}</strong><small>Portal credential slip · ${esc(fmtDate(new Date()))}</small></div>
        </header>
        <h2>${esc(title)}</h2>
        ${notice ? `<div class="notice">${icon('check')}<div>${esc(notice)}</div></div>` : ''}
        <div class="credential-rows">${rows}</div>
        ${linked ? `<p class="hint" style="margin-top:12px">Linked students: ${esc(linked)}</p>` : ''}
        ${missing ? `<p class="hint" style="margin-top:4px">Not found — check the admission numbers: ${esc(missing)}</p>` : ''}
        <p class="credential-warning">${icon('shield')} This temporary password is shown only once. The account holder must change it at first sign-in. Do not send it in a group message.</p>
        ${actions ? '<p class="credential-note">Keep this slip secure and hand it to the account holder directly.</p>' : ''}
      </article>`,
      { active: '/admin/users' }
    )
  );
}

function createUser(ctx) {
  const values = {
    role: String(ctx.fields.role || ''),
    name: String(ctx.fields.name || '').trim(),
    phone: String(ctx.fields.phone || '').trim(),
    email: String(ctx.fields.email || '').trim(),
    password: String(ctx.fields.password || '').trim(),
    position: String(ctx.fields.position || '').trim(),
    admission_no: String(ctx.fields.admission_no || '').trim(),
    class_id: String(ctx.fields.class_id || ''),
    gender: String(ctx.fields.gender || ''),
    guardian_mode: String(ctx.fields.guardian_mode || 'none'),
    parent_id: String(ctx.fields.parent_id || ''),
    parent_name: String(ctx.fields.parent_name || '').trim(),
    parent_phone: String(ctx.fields.parent_phone || '').trim(),
    parent_email: String(ctx.fields.parent_email || '').trim(),
    children: String(ctx.fields.children || '').trim(),
  };
  const fail = (message) => newUserPage(ctx, { values, error: message });
  if (!CREATABLE_ROLES.includes(values.role)) return fail('Choose a valid account type.');
  if (!values.name) return fail('Enter the full name.');

  let result;
  if (values.role === 'student') {
    const guardian =
      values.guardian_mode === 'existing'
        ? { mode: 'existing', parentId: Number(values.parent_id) }
        : values.guardian_mode === 'new'
          ? { mode: 'new', name: values.parent_name, phone: values.parent_phone, email: values.parent_email }
          : { mode: 'none' };
    result = createStudentAccount(ctx.db, {
      name: values.name,
      admissionNo: values.admission_no,
      classId: Number(values.class_id),
      gender: values.gender,
      phone: values.phone,
      email: values.email,
      password: values.password,
      guardian,
      createdBy: ctx.user.id,
    });
  } else {
    result = createUserAccount(ctx.db, {
      name: values.name,
      role: values.role,
      phone: values.phone,
      position: values.position,
      email: values.email,
      password: values.password,
      createdBy: ctx.user.id,
    });
  }
  if (!result.ok) return fail(result.message);

  let linked = '';
  let missing = '';
  if (values.role === 'parent' && values.children) {
    const links = linkChildrenByAdmission(ctx.db, result.id, values.children);
    linked = links.linked.join(', ');
    missing = links.missing.join(', ');
  }
  audit(ctx.db, ctx.user.id, 'account.create', {
    targetUserId: result.id,
    detail: `Created ${result.role} account ${result.email}${result.admission ? ` (${result.admission})` : ''}`,
  });

  const entries = [
    ['Full name', esc(result.name)],
    ['Account type', esc(roleLabels[result.role] || result.role)],
  ];
  if (result.admission) entries.push(['Admission number', `<code>${esc(result.admission)}</code>`]);
  entries.push(['Sign-in email', `<code>${esc(result.email)}</code>`]);
  entries.push(['Temporary password', `<code class="credential-password">${esc(result.password)}</code>`]);
  if (result.parent) {
    entries.push(['Guardian', esc(result.parent.name)]);
    if (result.parent.created) {
      entries.push(['Guardian sign-in', `<code>${esc(result.parent.email)}</code>`]);
      entries.push(['Guardian password', `<code class="credential-password">${esc(result.parentPassword)}</code>`]);
    } else {
      entries.push(['Guardian account', 'Existing parent account linked']);
    }
  }
  return credentialsPage(ctx, {
    title: 'Account created',
    entries,
    notice: `${result.name} can now sign in. Share the slip below securely.`,
    linked,
    missing,
  });
}

function resetPassword(ctx) {
  const result = setTempPassword(ctx.db, ctx.params.id);
  if (!result.ok) return redirect(`/admin/users?err=${encodeURIComponent(result.message)}`);
  audit(ctx.db, ctx.user.id, 'account.reset', {
    targetUserId: result.target.id,
    detail: `Issued a new temporary password for ${result.target.email}`,
  });
  return credentialsPage(ctx, {
    title: 'Password reset',
    entries: [
      ['Full name', esc(result.target.name)],
      ['Account type', esc(roleLabels[result.target.role] || result.target.role)],
      ['Sign-in email', `<code>${esc(result.target.email)}</code>`],
      ['Temporary password', `<code class="credential-password">${esc(result.password)}</code>`],
    ],
    notice: 'A new one-time password has been issued and existing sessions were signed out.',
  });
}

function toggleStatus(ctx) {
  const target = ctx.db.prepare('SELECT id, name, role, active FROM users WHERE id = ?').get(Number(ctx.params.id));
  if (!target || target.role === 'admin') {
    return redirect(`/admin/users?err=${encodeURIComponent('That account cannot be changed.')}`);
  }
  if (target.id === ctx.user.id) {
    return redirect(`/admin/users?err=${encodeURIComponent('You cannot deactivate your own account.')}`);
  }
  const next = Number(target.active) ? 0 : 1;
  const result = setAccountActive(ctx.db, target.id, next);
  if (!result.ok) return redirect(`/admin/users?err=${encodeURIComponent(result.message)}`);
  audit(ctx.db, ctx.user.id, next ? 'account.activate' : 'account.deactivate', {
    targetUserId: target.id,
    detail: `${next ? 'Reactivated' : 'Deactivated'} ${target.name} (${target.role})`,
  });
  const message = next
    ? `${target.name} can sign in again.`
    : `${target.name} has been deactivated and signed out.`;
  return redirect(`/admin/users?ok=${encodeURIComponent(message)}`);
}

function auditPage(ctx) {
  const rows = ctx.db
    .prepare(
      `SELECT a.id, a.action, a.detail, a.created_at,
              actor.name AS actor_name, target.name AS target_name, target.role AS target_role
       FROM audit_log a
       LEFT JOIN users actor ON actor.id = a.actor_id
       LEFT JOIN users target ON target.id = a.target_user_id
       ORDER BY a.id DESC LIMIT 250`
    )
    .all()
    .map((row) => [
      `<span class="table-name">${esc(fmtDateTime(row.created_at))}</span>`,
      esc(row.actor_name || 'System'),
      esc(AUDIT_LABELS[row.action] || row.action),
      row.target_name
        ? `<span class="table-name">${esc(row.target_name)}</span><span class="table-sub">${esc(roleLabels[row.target_role] || row.target_role || '')}</span>`
        : '—',
      esc(row.detail || '—'),
    ]);
  return html(
    layout(
      ctx,
      'Audit log',
      `${panel({
        title: 'Account audit log',
        subtitle: 'Most recent 250 administration actions',
        body: table(['When', 'Administrator', 'Action', 'Account', 'Detail'], rows, {
          empty: 'No administration actions have been recorded yet.',
        }),
        flush: true,
      })}`,
      { active: '/admin/audit' }
    )
  );
}

export function register(r) {
  r.get('/admin/login', ['public'], (ctx) => {
    if (ctx.user?.role === 'admin') return redirect('/admin');
    return html(adminLoginView({ identifier: ctx.query.email || '' }));
  });

  r.post('/admin/login', ['public'], (ctx) => {
    const identifier = String(ctx.fields.identifier || '').trim();
    const password = String(ctx.fields.password || '');
    const ip = clientIp(ctx.req);
    const key = `admin:${identifier}`;
    if (!identifier || !password) {
      return html(adminLoginView({ error: 'Enter the administrator email and password.', identifier }), 400);
    }
    if (loginBlocked(ctx.db, key, ip)) {
      return html(
        adminLoginView({ error: 'Too many failed attempts. Please wait 15 minutes.', identifier }),
        429
      );
    }
    const user = findUserForLogin(ctx.db, identifier);
    if (!user || user.role !== 'admin' || !verifyPassword(password, user.password_hash)) {
      recordLoginFailure(ctx.db, key, ip);
      return html(adminLoginView({ error: 'Those credentials do not match our records.', identifier }), 401);
    }
    clearLoginFailures(ctx.db, key, ip);
    ctx.db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    const token = createSession(ctx.db, user.id);
    audit(ctx.db, user.id, 'admin.login', { targetUserId: user.id, detail: 'Administrator signed in' });
    return redirect(Number(user.must_change_password) ? '/account/password' : '/admin', 303, {
      'Set-Cookie': setCookie('sid', token, { maxAge: Math.floor(config.sessionTtlMs / 1000) }),
    });
  });

  r.get('/admin', ['admin'], dashboard);
  r.get('/admin/users', ['admin'], usersPage);
  r.get('/admin/users/new', ['admin'], (ctx) => newUserPage(ctx));
  r.post('/admin/users', ['admin'], createUser);
  r.post('/admin/users/:id/reset', ['admin'], resetPassword);
  r.post('/admin/users/:id/status', ['admin'], toggleStatus);
  r.get('/admin/audit', ['admin'], auditPage);
}
