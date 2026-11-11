import { config, money } from '../config.js';
import {
  attendanceForDate,
  attendanceStats,
  classesWithPerformance,
  classLabel,
  classRanking,
  classSubjectAverages,
  createMessage,
  getClass,
  hostels,
  listParents,
  messagesSentBy,
  setHostelManager,
  workerHistory,
} from '../data.js';
import {
  esc,
  fmtDate,
  fmtDateTime,
  fmtTime,
  gradeFor,
  gradeTone,
  html,
  redirect,
  todayISO,
} from '../http.js';
import {
  avatar,
  badge,
  emptyState,
  icon,
  layout,
  panel,
  selectOptions,
  statCard,
  table,
} from '../views.js';
import { accessDenied, notFound } from './shared.js';

function duration(signIn, signOut) {
  if (!signIn || !signOut) return '—';
  const [ih, im] = signIn.split(':').map(Number);
  const [oh, om] = signOut.split(':').map(Number);
  const minutes = Math.max(0, oh * 60 + om - (ih * 60 + im));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function attendanceRows(date) {
  return attendanceForDate(date).map((worker) => [
    `<div class="table-avatar">${avatar(worker.name)}<div><span class="table-name">${esc(worker.name)}</span><span class="table-sub">${esc(worker.position || 'Support staff')}</span></div></div>`,
    esc(fmtTime(worker.sign_in)),
    esc(fmtTime(worker.sign_out)),
    esc(duration(worker.sign_in, worker.sign_out)),
    !worker.sign_in
      ? badge('Absent', 'bad')
      : worker.sign_out
        ? badge('Signed out', 'neutral')
        : badge('On duty', 'good'),
  ]);
}

export function register(r) {
  r.get('/boarding', ['deputy_boarding'], (ctx) => {
    const today = todayISO();
    const stats = attendanceStats(today);
    const hostelList = hostels();
    const classes = classesWithPerformance();
    const assigned = hostelList.filter((h) => h.manager_id).length;
    const workerRows = attendanceRows(today).slice(0, 8);
    const classRows = classes.map((row) => [
      `<a class="table-name" href="/boarding/performance/${row.id}">${esc(row.name)} ${esc(row.stream)}</a>`,
      `<span class="mono">${row.students}</span>`,
      row.avg ? `<span class="mono">${Number(row.avg).toFixed(1)}%</span>` : '—',
      row.avg ? badge(gradeFor(row.avg), gradeTone(row.avg)) : badge('No marks', 'neutral'),
    ]);
    return html(
      layout(
        ctx,
        'Boarding overview',
        `<section class="welcome">
          <div>
            <h2>Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${esc(ctx.user.name.split(' ')[0])}.</h2>
            <p>Boarding, staff duty and class performance at a glance.</p>
          </div>
          <a class="btn gold" href="/boarding/messages">${icon('mail')} Message a parent</a>
        </section>
        <div class="stats">
          ${statCard({ label: 'Hostels', value: hostelList.length, meta: `${assigned} with a manager`, iconName: 'building', href: '/boarding/hostels' })}
          ${statCard({ label: 'Workers on duty', value: stats.onDuty, meta: `${stats.total} support staff on register`, iconName: 'user', tone: 'good', href: '/boarding/attendance' })}
          ${statCard({ label: 'Absent today', value: stats.absent, meta: 'No sign-in recorded', iconName: 'alert', tone: stats.absent ? 'warn' : 'good' })}
          ${statCard({ label: 'Classes', value: classes.length, meta: 'View performance per class', iconName: 'chart', href: '/boarding/performance' })}
        </div>
        <div class="split">
          ${panel({
            title: 'Today’s duty register',
            subtitle: esc(fmtDate(new Date())),
            actions: `<a class="btn small ghost" href="/boarding/attendance">Full register</a>`,
            body: table(['Worker', 'In', 'Out', 'Hours', 'Status'], workerRows, { empty: 'No support staff records.' }),
            flush: true,
          })}
          ${panel({
            title: 'Hostel managers',
            subtitle: 'Allocated by the Deputy Principal (Boarding)',
            actions: `<a class="btn small ghost" href="/boarding/hostels">Manage</a>`,
            body: `<div class="list">${hostelList
              .map(
                (hostel) => `<div class="list-item">
                  <span class="material-icon">${icon('building')}</span>
                  <div class="list-copy"><strong>${esc(hostel.name)} · ${esc(hostel.gender || '—')}</strong><small>${hostel.manager_name ? esc(hostel.manager_name) : 'No manager allocated'}</small></div>
                  ${hostel.manager_name ? badge('Allocated', 'good') : badge('Unassigned', 'warn')}
                </div>`
              )
              .join('')}</div>`,
          })}
        </div>
        ${panel({
          title: 'Class performance',
          subtitle: `${config.examName} · click a class for subject and student detail`,
          body: table(['Class', 'Students', 'Average', 'Grade'], classRows, { empty: 'No class data yet.' }),
          flush: true,
        })}`,
        { active: '/boarding' }
      )
    );
  });

  r.get('/boarding/hostels', ['deputy_boarding'], (ctx) => {
    const hostelList = hostels();
    const workers = ctx.db
      .prepare("SELECT id, name, position FROM users WHERE role = 'worker' AND active = 1 ORDER BY name")
      .all();
    const rows = hostelList.map((hostel) => [
      `<span class="table-name">${esc(hostel.name)}</span><span class="table-sub">${esc(hostel.gender || '—')} · capacity ${hostel.capacity}</span>`,
      hostel.manager_name
        ? `<div class="table-avatar">${avatar(hostel.manager_name, 'small')}<span>${esc(hostel.manager_name)}</span></div>`
        : badge('Unassigned', 'warn'),
      `<form class="inline-form" method="post" action="/boarding/hostels/${hostel.id}/manager">
        <select name="manager_id" aria-label="Manager for ${esc(hostel.name)}" style="width:190px">
          ${selectOptions(workers.map((w) => ({ value: w.id, label: w.name })), hostel.manager_id || '', 'No manager')}
        </select>
        <button class="btn small ghost" type="submit">Save</button>
      </form>`,
    ]);
    return html(
      layout(
        ctx,
        'Hostel managers',
        `${panel({
          title: 'Hostel allocation',
          subtitle: 'Assign a support staff member to each hostel. Their duty attendance is tracked separately.',
          body: table(['Hostel', 'Manager', 'Allocate manager'], rows, { empty: 'No hostels have been set up.' }),
          flush: true,
        })}
        <div class="notice">${icon('shield')}<div>Hostel managers sign in and out from their own staff portal. Their arrival and departure times are visible under <a href="/boarding/attendance">worker attendance</a>.</div></div>`,
        { active: '/boarding/hostels' }
      )
    );
  });

  r.post('/boarding/hostels/:id/manager', ['deputy_boarding'], (ctx) => {
    const hostel = ctx.db.prepare('SELECT id FROM hostels WHERE id = ?').get(Number(ctx.params.id));
    if (!hostel) return redirect('/boarding/hostels?err=Hostel+not+found');
    const managerId = ctx.fields.manager_id ? Number(ctx.fields.manager_id) : null;
    if (managerId) {
      const worker = ctx.db.prepare("SELECT id FROM users WHERE id = ? AND role = 'worker'").get(managerId);
      if (!worker) return redirect('/boarding/hostels?err=Choose+a+valid+worker');
    }
    setHostelManager(hostel.id, managerId);
    return redirect(`/boarding/hostels?ok=${encodeURIComponent('Hostel manager updated.')}`);
  });

  r.get('/boarding/attendance', ['deputy_boarding'], (ctx) => {
    const requested = String(ctx.query.date || '');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayISO();
    const stats = attendanceStats(date);
    const rows = attendanceRows(date);
    return html(
      layout(
        ctx,
        'Worker attendance',
        `<div class="stats">
          ${statCard({ label: 'On duty', value: stats.onDuty, meta: 'Signed in, not yet out', iconName: 'user', tone: 'good' })}
          ${statCard({ label: 'Signed out', value: stats.signedOut, meta: 'Completed duty', iconName: 'logout' })}
          ${statCard({ label: 'Absent', value: stats.absent, meta: 'No sign-in recorded', iconName: 'alert', tone: stats.absent ? 'bad' : 'good' })}
          ${statCard({ label: 'Workers', value: stats.total, meta: 'Active support staff', iconName: 'users' })}
        </div>
        ${panel({
          title: 'Duty register',
          subtitle: 'Sign-in and sign-out times recorded by staff',
          actions: `<form class="search-form" method="get" action="/boarding/attendance">
            <input type="date" name="date" value="${esc(date)}" aria-label="Attendance date">
            <button class="btn small ghost" type="submit">View date</button>
          </form>`,
          body: table(['Worker', 'In', 'Out', 'Hours', 'Status'], rows, { empty: 'No support staff on the register.' }),
          flush: true,
        })}`,
        { active: '/boarding/attendance' }
      )
    );
  });

  r.get('/boarding/performance', ['deputy_boarding'], (ctx) => {
    const classes = classesWithPerformance();
    const rows = classes.map((row) => [
      `<a class="table-name" href="/boarding/performance/${row.id}">${esc(row.name)} ${esc(row.stream)}</a>`,
      `<span class="mono">${row.students}</span>`,
      row.avg ? `<span class="mono">${Number(row.avg).toFixed(1)}%</span>` : '—',
      row.avg ? badge(gradeFor(row.avg), gradeTone(row.avg)) : badge('No marks', 'neutral'),
      `<a class="btn small ghost" href="/boarding/performance/${row.id}">View</a>`,
    ]);
    return html(
      layout(
        ctx,
        'Class performance',
        `${panel({
          title: 'Performance by class',
          subtitle: `${config.examName} · averages across all subjects`,
          body: table(['Class', 'Students', 'Average', 'Grade', ''], rows, { empty: 'No class performance data.' }),
          flush: true,
        })}`,
        { active: '/boarding/performance' }
      )
    );
  });

  r.get('/boarding/performance/:id', ['deputy_boarding'], (ctx) => {
    const cls = getClass(ctx.params.id);
    if (!cls) return notFound(ctx);
    const ranking = classRanking(cls.id);
    const subjects = classSubjectAverages(cls.id);
    const overall = ranking.length
      ? ranking.reduce((sum, row) => sum + Number(row.avg), 0) / ranking.length
      : null;
    const subjectRows = subjects.map((row) => [
      esc(row.subject_name),
      `<span class="mono">${Number(row.avg).toFixed(1)}%</span>`,
      badge(gradeFor(row.avg), gradeTone(row.avg)),
      `<span class="mono">${row.entries}</span>`,
    ]);
    const rankRows = ranking.map((row) => [
      `<span class="mono">${row.position}</span>`,
      `<div class="table-avatar">${avatar(row.name, 'small')}<span class="table-name">${esc(row.name)}</span></div>`,
      `<span class="mono">${Number(row.avg).toFixed(1)}%</span>`,
      badge(gradeFor(row.avg), gradeTone(row.avg)),
    ]);
    return html(
      layout(
        ctx,
        `${classLabel(cls)} performance`,
        `<div class="stats">
          ${statCard({ label: 'Class average', value: overall ? `${overall.toFixed(1)}%` : '—', meta: config.examName, iconName: 'chart', tone: overall ? 'good' : '' })}
          ${statCard({ label: 'Students ranked', value: ranking.length, meta: `Out of ${cls.students || ranking.length} on roll`, iconName: 'users' })}
          ${statCard({ label: 'Subjects examined', value: subjects.length, meta: 'With marks recorded', iconName: 'book' })}
        </div>
        <div class="split">
          ${panel({
            title: 'Student ranking',
            subtitle: 'Ordered by overall average',
            body: table(['Pos', 'Student', 'Average', 'Grade'], rankRows, { empty: 'No marks have been entered for this class yet.' }),
            flush: true,
          })}
          ${panel({
            title: 'Subject averages',
            body: table(['Subject', 'Average', 'Grade', 'Entries'], subjectRows, { empty: 'No subject data.' }),
            flush: true,
          })}
        </div>
        <div class="print-note no-print" style="max-width:none">
          <a class="btn ghost small" href="/boarding/performance">${icon('arrow')} All classes</a>
        </div>`,
        { active: '/boarding/performance' }
      )
    );
  });

  r.get('/boarding/messages', ['deputy_boarding'], (ctx) => {
    const parents = listParents();
    const sent = messagesSentBy(ctx.user.id);
    const sentRows = sent.map((message) => [
      `<span class="table-name">${esc(message.parent_name)}</span>`,
      esc(message.subject),
      esc(fmtDateTime(message.created_at)),
    ]);
    return html(
      layout(
        ctx,
        'Parent messages',
        `<div class="split">
          ${panel({
            title: 'Message a parent',
            subtitle: 'A copy is delivered to the parent portal and cannot be recalled.',
            body: `<form method="post" action="/boarding/messages" class="form-grid">
              <div class="field span-2"><label for="parent">Parent</label>
                <select id="parent" name="parent_id" required>
                  ${selectOptions(parents.map((p) => ({ value: p.id, label: `${p.name} — ${p.children || 'no children linked'}` })), '', 'Choose a parent')}
                </select>
              </div>
              <div class="field span-2"><label for="subject">Subject</label><input id="subject" name="subject" required placeholder="e.g. Brian's boarding conduct"></div>
              <div class="field span-2"><label for="body">Message</label><textarea id="body" name="body" required placeholder="Write your message to the parent"></textarea></div>
              <div class="form-actions span-2"><button class="btn" type="submit">${icon('mail')} Send message</button></div>
            </form>`,
          })}
          ${panel({
            title: 'Recently sent',
            subtitle: 'Last 10 messages you sent',
            body: table(['Parent', 'Subject', 'Sent'], sentRows, { empty: 'You have not messaged any parent yet.' }),
            flush: true,
          })}
        </div>`,
        { active: '/boarding/messages' }
      )
    );
  });

  r.post('/boarding/messages', ['deputy_boarding'], (ctx) => {
    const parentId = Number(ctx.fields.parent_id || 0);
    const subject = String(ctx.fields.subject || '').trim();
    const body = String(ctx.fields.body || '').trim();
    const parent = ctx.db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'parent'").get(parentId);
    if (!parent) return redirect('/boarding/messages?err=Choose+a+parent');
    if (!subject || !body) return redirect('/boarding/messages?err=Subject+and+message+are+required');
    createMessage({ senderId: ctx.user.id, parentId, subject, body });
    return redirect(`/boarding/messages?ok=${encodeURIComponent(`Message sent to ${parent.name}.`)}`);
  });
}
