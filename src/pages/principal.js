import { config, money } from '../config.js';
import { audit, createUserAccount } from '../accounts.js';
import {
  classesWithPerformance,
  classLabel,
  listClasses,
  listStaff,
  listStudents,
  schoolCounts,
} from '../data.js';
import { esc, fmtDate, gradeFor, gradeTone, html, redirect } from '../http.js';
import {
  avatar,
  badge,
  documentPage,
  emptyState,
  icon,
  layout,
  panel,
  roleLabels,
  selectOptions,
  statCard,
  table,
} from '../views.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function dashboard(ctx) {
  const counts = schoolCounts();
  const classes = classesWithPerformance();
  const staff = listStaff();
  const classRows = classes.map((row) => [
    `<span class="table-name">${esc(row.name)} ${esc(row.stream)}</span>`,
    `<span class="mono">${row.students}</span>`,
    row.avg ? `<span class="mono">${Number(row.avg).toFixed(1)}%</span>` : '—',
    row.avg ? badge(gradeFor(row.avg), gradeTone(row.avg)) : badge('No marks', 'neutral'),
  ]);
  const recent = staff.slice(0, 6).map(
    (member) => `<div class="list-item">
      ${avatar(member.name)}
      <div class="list-copy"><strong>${esc(member.name)}</strong><small>${esc(member.position || roleLabels[member.role])} · ${esc(member.email)}</small></div>
      ${badge(member.role === 'teacher' ? 'Teacher' : member.role === 'worker' ? 'Support' : 'BOM', member.role === 'teacher' ? 'info' : 'neutral')}
    </div>`
  );
  return html(layout(
    ctx,
    'Principal overview',
    `<section class="welcome">
      <div>
        <h2>${greeting()}, ${esc(ctx.user.name.split(' ')[0])}.</h2>
        <p>The whole school at a glance — ${counts.students} students across ${counts.classes} classes.</p>
      </div>
      <a class="btn gold" href="/principal/staff">${icon('plus')} Add staff member</a>
    </section>
    <div class="stats">
      ${statCard({ label: 'Students', value: counts.students, meta: `${counts.classes} classes`, iconName: 'users', href: '/principal/students' })}
      ${statCard({ label: 'Teaching staff', value: counts.teachers, meta: 'Teachers on the register', iconName: 'award', href: '/principal/staff' })}
      ${statCard({ label: 'Support staff', value: counts.workers, meta: 'Workers & hostel managers', iconName: 'building', href: '/principal/staff' })}
      ${statCard({ label: 'BOM members', value: counts.bom, meta: 'Board of Management', iconName: 'shield', href: '/principal/staff' })}
      ${statCard({ label: 'Outstanding fees', value: esc(money(counts.arrears)), meta: `${config.term} balances`, iconName: 'wallet', tone: 'warn' })}
      ${statCard({ label: 'Open complaints', value: counts.openComplaints, meta: 'Handled by the Director of Studies', iconName: 'clipboard', tone: counts.openComplaints ? 'bad' : 'good' })}
    </div>
    <div class="split">
      ${panel({
        title: 'Class performance',
        subtitle: `${config.examName} · average score per class`,
        body: table(['Class', 'Students', 'Average', 'Grade'], classRows, { empty: 'No classes yet.' }),
        flush: true,
      })}
      ${panel({
        title: 'Quick actions',
        body: `<div class="list">
          <a class="list-item" href="/principal/staff">${icon('users')}<div class="list-copy"><strong>Add a teacher, worker or BOM member</strong><small>Create staff accounts and keep the register current.</small></div>${icon('arrowRight')}</a>
          <a class="list-item" href="/principal/students">${icon('report')}<div class="list-copy"><strong>Open any student report</strong><small>Search by name or admission number and print the report card.</small></div>${icon('arrowRight')}</a>
          <a class="list-item" href="/timetable/exam">${icon('calendar')}<div class="list-copy"><strong>View the exam timetable</strong><small>${esc(config.examName)} schedule.</small></div>${icon('arrowRight')}</a>
          <a class="list-item" href="/calendar">${icon('clock')}<div class="list-copy"><strong>School calendar</strong><small>Opening, closing and examination dates.</small></div>${icon('arrowRight')}</a>
        </div>`,
      })}
    </div>
    ${panel({
      title: 'Staff & BOM register',
      subtitle: 'Most recent records',
      actions: `<a class="btn small ghost" href="/principal/staff">View all ${staff.length}</a>`,
      body: recent.length ? `<div class="list">${recent.join('')}</div>` : emptyState('No staff records yet.'),
    })}`,
    { active: '/principal' }
  ));
}

function staffPage(ctx) {
  const staff = listStaff();
  const rows = staff.map((member) => [
    `<div class="table-avatar">${avatar(member.name)}<div><span class="table-name">${esc(member.name)}</span><span class="table-sub">${esc(member.email)}</span></div></div>`,
    member.role === 'teacher' ? badge('Teacher', 'info') : member.role === 'worker' ? badge('Support staff', 'neutral') : badge('BOM', 'gold'),
    esc(member.position || roleLabels[member.role]),
    esc(member.phone || '—'),
    esc(fmtDate(member.created_at)),
  ]);
  return html(layout(
    ctx,
    'Staff & BOM',
    `<div class="split">
      <div>
        ${panel({
          title: 'Staff & BOM register',
          subtitle: `${staff.length} accounts · teachers, support staff and board members`,
          body: table(['Member', 'Category', 'Position', 'Phone', 'Added'], rows, { empty: 'No staff records yet.' }),
          flush: true,
        })}
      </div>
      ${panel({
        title: 'Add a staff account',
        subtitle: 'Teachers, support staff and BOM members can all sign in.',
        body: `<form method="post" action="/principal/staff" class="form-grid">
          <div class="field span-2"><label for="staff-name">Full name</label><input id="staff-name" name="name" required></div>
          <div class="field"><label for="staff-email">Portal email (optional)</label><input id="staff-email" name="email" type="email" placeholder="Allocated automatically if blank"></div>
          <div class="field"><label for="staff-phone">Phone</label><input id="staff-phone" name="phone" placeholder="+254 ..."></div>
          <div class="field"><label for="staff-role">Role</label><select id="staff-role" name="role" required>
            ${selectOptions([
              { value: 'teacher', label: 'Teacher' },
              { value: 'worker', label: 'Support staff / worker' },
              { value: 'bom', label: 'BOM member' },
            ], 'teacher', null)}
          </select></div>
          <div class="field"><label for="staff-position">Position / title</label><input id="staff-position" name="position" placeholder="e.g. Mathematics Teacher"></div>
          <div class="field span-2"><label for="staff-password">Temporary password (optional)</label><input id="staff-password" name="password" type="text" placeholder="Generated automatically if blank"><span class="hint">The staff member must change it at first sign-in. It is shown once after creation.</span></div>
          <div class="form-actions span-2"><button class="btn" type="submit">${icon('plus')} Create account</button></div>
        </form>`,
      })}
    </div>`,
    { active: '/principal/staff' }
  ));
}

function createStaff(ctx) {
  const name = String(ctx.fields.name || '').trim();
  const email = String(ctx.fields.email || '').trim().toLowerCase();
  const phone = String(ctx.fields.phone || '').trim();
  const role = String(ctx.fields.role || '');
  const position = String(ctx.fields.position || '').trim();
  const password = String(ctx.fields.password || '').trim();
  const fail = (message) => redirect(`/principal/staff?err=${encodeURIComponent(message)}`);
  if (!name) return fail('Enter the staff member name.');
  if (!['teacher', 'worker', 'bom'].includes(role)) return fail('Choose a valid staff category.');
  const result = createUserAccount(ctx.db, {
    name,
    role,
    phone,
    position,
    email,
    password,
    createdBy: ctx.user.id,
  });
  if (!result.ok) return fail(result.message);
  audit(ctx.db, ctx.user.id, 'account.create', {
    targetUserId: result.id,
    detail: `Created ${result.role} account ${result.email}`,
  });
  return html(
    layout(
      ctx,
      'Staff account created',
      `<div class="print-note no-print">
        <button class="btn small" type="button" onclick="window.print()">${icon('report')} Print credential slip</button>
        <a class="btn ghost small" href="/principal/staff">${icon('users')} Back to staff</a>
      </div>
      <article class="credential-slip print-slip">
        <header class="credential-head">
          <span class="crest">M</span>
          <div><strong>${esc(config.school)}</strong><small>Portal credential slip · ${esc(fmtDate(new Date()))}</small></div>
        </header>
        <h2>Account created</h2>
        <div class="notice">${icon('check')}<div>${esc(result.name)} can now sign in as ${esc(roleLabels[result.role])}.</div></div>
        <div class="credential-rows">
          <div class="credential-row"><span>Full name</span>${esc(result.name)}</div>
          <div class="credential-row"><span>Sign-in email</span><code>${esc(result.email)}</code></div>
          <div class="credential-row"><span>Temporary password</span><code class="credential-password">${esc(result.password)}</code></div>
        </div>
        <p class="credential-warning">${icon('shield')} This temporary password is shown only once. The staff member must change it at first sign-in.</p>
      </article>`,
      { active: '/principal/staff' }
    )
  );
}

function studentsPage(ctx) {
  const classes = listClasses();
  const classId = ctx.query.class ? Number(ctx.query.class) : null;
  const search = String(ctx.query.q || '');
  const students = listStudents({ search, classId });
  const rows = students.map((student) => [
    `<div class="table-avatar">${avatar(student.name)}<div><span class="table-name">${esc(student.name)}</span><span class="table-sub">${esc(student.admission_no)} · ${esc(student.gender || '—')}</span></div></div>`,
    esc(classLabel(student)),
    student.average !== null ? `<span class="mono">${Number(student.average).toFixed(1)}%</span>` : '—',
    student.average !== null ? badge(gradeFor(student.average), gradeTone(student.average)) : badge('No marks', 'neutral'),
    `<span class="mono">${esc(money(student.balance))}</span>`,
    `<a class="btn small ghost" href="/reports/${student.id}">View report</a>`,
  ]);
  return html(layout(
    ctx,
    'Students & reports',
    `${panel({
      title: 'Student register',
      subtitle: `${students.length} students · open any report card`,
      actions: `<form class="search-form" method="get" action="/principal/students">
        <input name="q" value="${esc(search)}" placeholder="Name or admission no." aria-label="Search students">
        <select name="class" aria-label="Filter by class">
          ${selectOptions(classes.map((c) => ({ value: c.id, label: classLabel(c) })), classId || '', 'All classes')}
        </select>
        <button class="btn small ghost" type="submit">${icon('search')} Search</button>
      </form>`,
      body: table(['Student', 'Class', 'Average', 'Grade', 'Fee balance', ''], rows, { empty: 'No students match that search.' }),
      flush: true,
    })}`,
    { active: '/principal/students' }
  ));
}

export function register(r) {
  r.get('/principal', ['principal'], dashboard);
  r.get('/principal/staff', ['principal'], staffPage);
  r.post('/principal/staff', ['principal'], createStaff);
  r.get('/principal/students', ['principal'], studentsPage);
}
