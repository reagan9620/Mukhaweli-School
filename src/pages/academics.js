import { config, money } from '../config.js';
import {
  classesWithPerformance,
  classLabel,
  createMessage,
  enrollStudent,
  feeAccount,
  feeOverview,
  getClass,
  listClasses,
  listParents,
  listStudents,
  listSubjects,
  messagesSentBy,
  schoolCounts,
  teachingTimetable,
  updateCalendar,
  updateFeeBalance,
} from '../data.js';
import {
  esc,
  fmtCountdown,
  fmtDate,
  fmtDateTime,
  fmtTime,
  html,
  parseDateOnly,
  redirect,
  todayISO,
} from '../http.js';
import {
  avatar,
  badge,
  calendarCard,
  icon,
  layout,
  panel,
  selectOptions,
  statCard,
  table,
} from '../views.js';
import { accessDenied, notFound, renderTimetableGrid } from './shared.js';

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !!parseDateOnly(value);
}

function dashboard(ctx) {
  const counts = schoolCounts();
  const calendar = ctx.db.prepare('SELECT * FROM calendar WHERE id = 1').get() || {};
  const overview = feeOverview();
  const classes = listClasses();
  const byClass = new Map();
  for (const student of overview.students) {
    const key = student.class_id;
    if (!byClass.has(key)) byClass.set(key, { students: 0, balance: 0 });
    const entry = byClass.get(key);
    entry.students += 1;
    entry.balance += Number(student.balance || 0);
  }
  const classRows = classes.map((cls) => {
    const stat = byClass.get(cls.id) || { students: 0, balance: 0 };
    return [
      `<a class="table-name" href="/academics/students?class=${cls.id}">${esc(classLabel(cls))}</a>`,
      `<span class="mono">${stat.students}</span>`,
      `<span class="mono">${esc(money(stat.balance))}</span>`,
    ];
  });
  const recent = ctx.db
    .prepare(
      `SELECT st.id, st.admission_no, u.name, c.name AS class_name, c.stream AS class_stream
       FROM students st JOIN users u ON u.id = st.user_id LEFT JOIN classes c ON c.id = st.class_id
       ORDER BY st.id DESC LIMIT 5`
    )
    .all();
  const examCountdown = calendar.exam_start ? fmtCountdown(calendar.exam_start) : null;
  return html(layout(
    ctx,
    'Academics overview',
    `<section class="welcome">
      <div>
        <h2>${esc(ctx.user.name.split(' ')[0])}’s academics desk.</h2>
        <p>Enrolment, fees and the school timetable — changes publish to every portal immediately.</p>
      </div>
      <a class="btn gold" href="/academics/students/new">${icon('plus')} Enrol a student</a>
    </section>
    <div class="stats">
      ${statCard({ label: 'Students', value: counts.students, meta: `${counts.classes} classes`, iconName: 'users', href: '/academics/students' })}
      ${statCard({ label: 'Outstanding fees', value: esc(money(overview.totalBalance)), meta: `${overview.withBalance} students with a balance`, iconName: 'wallet', tone: 'warn', href: '/academics/fees' })}
      ${statCard({ label: 'Exam period', value: examCountdown || '—', meta: calendar.exam_start ? esc(fmtDate(calendar.exam_start)) : 'Dates not set', iconName: 'calendar', href: '/academics/calendar' })}
      ${statCard({ label: 'Term closes', value: calendar.closing_date ? esc(fmtDate(calendar.closing_date, 'short')) : '—', meta: `${calendar.term || config.term} ${calendar.year || config.year}`, iconName: 'clock', href: '/academics/calendar' })}
    </div>
    <div class="split">
      ${panel({
        title: 'Students & fees by class',
        subtitle: `${config.term} fee position`,
        body: table(['Class', 'Students', 'Outstanding'], classRows, { empty: 'No classes yet.' }),
        flush: true,
      })}
      ${panel({
        title: 'Quick actions',
        body: `<div class="list">
          <a class="list-item" href="/academics/students/new">${icon('plus')}<div class="list-copy"><strong>Enrol a new student</strong><small>Create the student account and link a parent.</small></div>${icon('arrowRight')}</a>
          <a class="list-item" href="/academics/fees">${icon('wallet')}<div class="list-copy"><strong>Update fee balances</strong><small>Balances are visible to the student and parent.</small></div>${icon('arrowRight')}</a>
          <a class="list-item" href="/academics/timetable">${icon('grid')}<div class="list-copy"><strong>Edit the school timetable</strong><small>Add or remove lessons for any class.</small></div>${icon('arrowRight')}</a>
          <a class="list-item" href="/academics/calendar">${icon('calendar')}<div class="list-copy"><strong>Exam and term dates</strong><small>Publish opening, closing and exam dates.</small></div>${icon('arrowRight')}</a>
          <a class="list-item" href="/academics/messages">${icon('mail')}<div class="list-copy"><strong>Contact a parent</strong><small>Send a message to any parent's portal.</small></div>${icon('arrowRight')}</a>
        </div>`,
      })}
    </div>
    <div class="split">
      ${panel({
        title: 'Recent enrolments',
        subtitle: 'Latest students added to the school',
        actions: `<a class="btn small ghost" href="/academics/students">All students</a>`,
        body: recent.length
          ? `<div class="list">${recent
              .map(
                (student) => `<div class="list-item">${avatar(student.name)}<div class="list-copy"><strong>${esc(student.name)}</strong><small>${esc(student.admission_no)} · ${esc(student.class_name)} ${esc(student.stream || '')}</small></div><a class="btn small ghost" href="/reports/${student.id}">Report</a></div>`
              )
              .join('')}</div>`
          : `<p class="muted">No students yet.</p>`,
      })}
      ${panel({
        title: 'Term dates',
        actions: `<a class="btn small ghost" href="/academics/calendar">Edit</a>`,
        body: calendarCard(calendar, { compact: true }),
      })}
    </div>`,
    { active: '/academics' }
  ));
}

function studentsPage(ctx) {
  const classes = listClasses();
  const classId = ctx.query.class ? Number(ctx.query.class) : null;
  const search = String(ctx.query.q || '');
  const students = listStudents({ search, classId });
  const rows = students.map((student) => [
    `<div class="table-avatar">${avatar(student.name)}<div><span class="table-name">${esc(student.name)}</span><span class="table-sub">${esc(student.admission_no)}</span></div></div>`,
    esc(classLabel(student)),
    student.average !== null ? `<span class="mono">${Number(student.average).toFixed(1)}%</span>` : '—',
    `<span class="mono">${esc(money(student.balance))}</span>`,
    `<span class="pill-row"><a class="btn small ghost" href="/reports/${student.id}">Report</a><a class="btn small ghost" href="/academics/fees?q=${encodeURIComponent(student.admission_no)}">Fees</a></span>`,
  ]);
  return html(layout(
    ctx,
    'Students',
    `${panel({
      title: 'Student register',
      subtitle: `${students.length} students${classId ? ` in ${esc(classLabel(getClass(classId)))}` : ''}`,
      actions: `<div class="pill-row">
        <form class="search-form" method="get" action="/academics/students">
          <input name="q" value="${esc(search)}" placeholder="Name or admission no." aria-label="Search students">
          <select name="class" aria-label="Filter by class">${selectOptions(classes.map((c) => ({ value: c.id, label: classLabel(c) })), classId || '', 'All classes')}</select>
          <button class="btn small ghost" type="submit">${icon('search')} Search</button>
        </form>
        <a class="btn small" href="/academics/students/new">${icon('plus')} Add student</a>
      </div>`,
      body: table(['Student', 'Class', 'Average', 'Fee balance', ''], rows, { empty: 'No students match that search.' }),
      flush: true,
    })}`,
    { active: '/academics/students' }
  ));
}

function newStudentPage(ctx) {
  const classes = listClasses();
  return html(layout(
    ctx,
    'Enrol a student',
    `<div class="split">
      ${panel({
        title: 'Student details',
        subtitle: 'A student portal account is created automatically.',
        body: `<form method="post" action="/academics/students/new" class="form-grid">
          <div class="field span-2"><label for="name">Full name</label><input id="name" name="name" required></div>
          <div class="field"><label for="gender">Gender</label><select id="gender" name="gender">
            ${selectOptions([{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }], 'Female', 'Select')}
          </select></div>
          <div class="field"><label for="class_id">Class</label><select id="class_id" name="class_id" required>
            ${selectOptions(classes.map((c) => ({ value: c.id, label: classLabel(c) })), '', 'Choose class')}
          </select></div>
          <div class="field"><label for="admission">Admission number</label><input id="admission" name="admission_no" placeholder="Auto-generated if blank"></div>
          <div class="field"><label for="student-email">Student email</label><input id="student-email" name="email" type="email" placeholder="Auto-generated if blank"></div>
          <div class="field span-2"><label for="phone">Phone (optional)</label><input id="phone" name="phone" placeholder="+254 ..."></div>
          <div class="section-title span-2">Parent / guardian</div>
          <div class="field span-2"><label for="parent-name">Parent name</label><input id="parent-name" name="parent_name" placeholder="Required when creating a new parent account"></div>
          <div class="field"><label for="parent-email">Parent email</label><input id="parent-email" name="parent_email" type="email" placeholder="Links to an existing parent if found"></div>
          <div class="field"><label for="parent-phone">Parent phone</label><input id="parent-phone" name="parent_phone" placeholder="+254 ..."></div>
          <div class="form-actions span-2">
            <button class="btn" type="submit">${icon('plus')} Enrol student</button>
            <span class="hint">A one-time password is generated and shown after enrolment.</span>
          </div>
        </form>`,
      })}
      ${panel({
        title: 'What happens next',
        body: `<div class="list">
          <div class="list-item"><span class="material-icon">${icon('user')}</span><div class="list-copy"><strong>Student portal</strong><small>The student can sign in with their admission number or email.</small></div></div>
          <div class="list-item"><span class="material-icon">${icon('users')}</span><div class="list-copy"><strong>Parent linked</strong><small>If the parent email already exists, the student is linked to that parent. Otherwise a new parent account is created.</small></div></div>
          <div class="list-item"><span class="material-icon">${icon('wallet')}</span><div class="list-copy"><strong>Fee account</strong><small>Set the student's fee balance under Fee balances after enrolment.</small></div></div>
          <div class="list-item"><span class="material-icon">${icon('report')}</span><div class="list-copy"><strong>Reports</strong><small>Marks added by teachers flow straight into the student's report card.</small></div></div>
        </div>`,
      })}
    </div>`,
    { active: '/academics/students' }
  ));
}

function createStudent(ctx) {
  const name = String(ctx.fields.name || '').trim();
  const classId = Number(ctx.fields.class_id || 0);
  const parentEmail = String(ctx.fields.parent_email || '').trim();
  const parentName = String(ctx.fields.parent_name || '').trim();
  const fail = (message) => redirect(`/academics/students/new?err=${encodeURIComponent(message)}`);
  if (!name) return fail('Enter the student name.');
  if (!getClass(classId)) return fail('Choose a valid class.');
  if (parentEmail && !parentName) {
    const existing = ctx.db
      .prepare("SELECT 1 AS ok FROM users WHERE lower(email) = ? AND role = 'parent'")
      .get(parentEmail.toLowerCase());
    if (!existing) return fail('Provide the parent name so a parent account can be created.');
  }
  const result = enrollStudent({
    name,
    email: String(ctx.fields.email || '').trim(),
    phone: String(ctx.fields.phone || '').trim(),
    gender: String(ctx.fields.gender || '').trim(),
    admissionNo: String(ctx.fields.admission_no || '').trim(),
    classId,
    parentName,
    parentEmail,
    parentPhone: String(ctx.fields.parent_phone || '').trim(),
    createdBy: ctx.user.id,
  });
  if (!result.ok) return fail(result.message);
  const cls = getClass(classId);
  const parentLine = result.parent
    ? result.parentCreated
      ? `A new parent account was created for ${esc(result.parent.name)} (${esc(result.parent.email)}).`
      : `Linked to the existing parent account: ${esc(result.parent.name)} (${esc(result.parent.email)}).`
    : 'No parent account was linked.';
  return html(
    layout(
      ctx,
      'Student enrolled',
      `${panel({
        title: `${name} enrolled successfully`,
        subtitle: `${classLabel(cls)} · ${config.term} ${config.year}`,
        body: `<div class="notice">${icon('check')}<div>The student portal account is ready. Share the admission number and temporary password with the student.</div></div>
          <div class="report-summary" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:20px">
            <div class="summary-box"><p>Admission no.</p><strong style="font-size:15px">${esc(result.admission)}</strong></div>
            <div class="summary-box"><p>Login email</p><strong style="font-size:12.5px;word-break:break-all">${esc(result.studentEmail)}</strong></div>
            <div class="summary-box"><p>Temporary password</p><strong style="font-size:15px">${esc(result.password)}</strong></div>
          </div>
          <p class="hint" style="margin-top:10px">${parentLine}</p>
          ${result.parent?.created ? `<div class="notice gold">${icon('shield')}<div>Parent account: <strong>${esc(result.parent.email)}</strong> · temporary password <strong>${esc(result.parentPassword)}</strong>. The parent must change it at first sign-in.</div></div>` : ''}
          <div class="form-actions">
            <a class="btn" href="/reports/${result.studentId}">Open report card</a>
            <a class="btn ghost" href="/academics/fees?q=${encodeURIComponent(result.admission)}">Set fee balance</a>
            <a class="btn ghost" href="/academics/students/new">Enrol another</a>
          </div>`,
      })}`,
      { active: '/academics/students' }
    )
  );
}

function feesPage(ctx) {
  const classes = listClasses();
  const classId = ctx.query.class ? Number(ctx.query.class) : null;
  const search = String(ctx.query.q || '');
  const overview = feeOverview({ search, classId });
  const rows = overview.students.map((student) => [
    `<div class="table-avatar">${avatar(student.name)}<div><span class="table-name">${esc(student.name)}</span><span class="table-sub">${esc(student.admission_no)}</span></div></div>`,
    esc(classLabel(student)),
    `<span class="badge ${Number(student.balance) > 0 ? 'warn' : 'good'}"><span class="dot"></span>${Number(student.balance) > 0 ? esc(money(student.balance)) : 'Cleared'}</span>`,
    `<form class="inline-form" method="post" action="/academics/fees/${student.id}?${new URLSearchParams({ q: search, class: classId || '' })}">
      <input type="number" name="balance" min="0" step="100" value="${Number(student.balance)}" aria-label="Fee balance for ${esc(student.name)}">
      <button class="btn small ghost" type="submit">Update</button>
    </form>`,
  ]);
  return html(layout(
    ctx,
    'Fee balances',
    `<div class="stats">
      ${statCard({ label: 'Total outstanding', value: esc(money(overview.totalBalance)), meta: `${config.term} · ${overview.students.length} students`, iconName: 'wallet', tone: 'warn' })}
      ${statCard({ label: 'With a balance', value: overview.withBalance, meta: 'Students yet to clear fees', iconName: 'alert', tone: 'warn' })}
      ${statCard({ label: 'Cleared', value: overview.students.length - overview.withBalance, meta: 'Fully paid students', iconName: 'check', tone: 'good' })}
    </div>
    ${panel({
      title: 'Fee balances',
      subtitle: 'Updated balances appear immediately in the student and parent portals.',
      actions: `<form class="search-form" method="get" action="/academics/fees">
        <input name="q" value="${esc(search)}" placeholder="Name or admission no." aria-label="Search students">
        <select name="class" aria-label="Filter by class">${selectOptions(classes.map((c) => ({ value: c.id, label: classLabel(c) })), classId || '', 'All classes')}</select>
        <button class="btn small ghost" type="submit">${icon('search')} Search</button>
      </form>`,
      body: table(['Student', 'Class', 'Current balance', 'Set new balance'], rows, { empty: 'No students match that search.' }),
      flush: true,
    })}
    <div class="notice">${icon('shield')}<div>Only the Deputy Principal (Academics) updates balances. Payment receipts already issued to parents remain unchanged.</div></div>`,
    { active: '/academics/fees' }
  ));
}

function updateFee(ctx) {
  const student = ctx.db.prepare('SELECT id FROM students WHERE id = ?').get(Number(ctx.params.id));
  if (!student) return redirect('/academics/fees?err=Student+not+found');
  const balance = Number(ctx.fields.balance);
  if (!Number.isFinite(balance) || balance < 0) {
    return redirect('/academics/fees?err=Enter+a+valid+fee+balance');
  }
  updateFeeBalance(student.id, Math.round(balance), ctx.user.id);
  return redirect(`/academics/fees?ok=${encodeURIComponent('Fee balance updated. The student and parent can now see the new balance.')}`);
}

export function teachingTimetablePage(ctx) {
  const classes = listClasses();
  const requested = ctx.query.class ? Number(ctx.query.class) : null;
  const selected = classes.find((c) => c.id === requested) || classes[0];
  if (!selected) return html(layout(ctx, 'Teaching timetable', panel({ title: 'No classes', body: '<p class="muted">Create classes before building a timetable.</p>' }), { active: '' }));
  const lessons = teachingTimetable(selected.id);
  const subjects = listSubjects();
  const teachers = ctx.db
    .prepare("SELECT id, name FROM users WHERE role = 'teacher' AND active = 1 ORDER BY name")
    .all();
  const base = ctx.user.role === 'dos' ? '/dos/timetable' : '/academics/timetable';
  const lessonRows = lessons.map((lesson) => [
    esc(lesson.day),
    `${esc(fmtTime(lesson.start_time))} – ${esc(fmtTime(lesson.end_time))}`,
    `<span class="table-name">${esc(lesson.subject_name)}</span>`,
    esc(lesson.teacher_name || '—'),
    esc(lesson.room || '—'),
    `<form class="inline-form" method="post" action="${base}/${lesson.id}/delete">
      <input type="hidden" name="class_id" value="${selected.id}">
      <button class="btn small danger" type="submit">Remove</button>
    </form>`,
  ]);
  return html(layout(
    ctx,
    `Teaching timetable — ${classLabel(selected)}`,
    `<div class="split">
      <div>
        ${panel({
          title: 'Weekly timetable',
          subtitle: `${classLabel(selected)} · ${config.term} ${config.year}`,
          actions: `<form class="search-form" method="get" action="${base}">
            <select name="class" aria-label="Choose class">${selectOptions(classes.map((c) => ({ value: c.id, label: classLabel(c) })), selected.id, null)}</select>
            <button class="btn small ghost" type="submit">View</button>
          </form>`,
          body: renderTimetableGrid(selected, lessons),
        })}
        ${panel({
          title: 'Scheduled lessons',
          subtitle: 'Remove a lesson if it is no longer valid',
          body: table(['Day', 'Time', 'Subject', 'Teacher', 'Room', ''], lessonRows, { empty: 'No lessons scheduled for this class.' }),
          flush: true,
        })}
      </div>
      ${panel({
        title: 'Add a lesson',
        subtitle: 'The timetable is visible to staff, students and parents.',
        body: `<form method="post" action="${base}/add" class="form-grid">
          <input type="hidden" name="class_id" value="${selected.id}">
          <div class="field span-2"><label>Class</label><input value="${esc(classLabel(selected))}" disabled></div>
          <div class="field"><label for="day">Day</label><select id="day" name="day">
            ${selectOptions(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => ({ value: d, label: d })), 'Monday', null)}
          </select></div>
          <div class="field"><label for="subject">Subject</label><select id="subject" name="subject_id" required>
            ${selectOptions(subjects.map((s) => ({ value: s.id, label: s.name })), '', 'Choose subject')}
          </select></div>
          <div class="field"><label for="teacher">Teacher</label><select id="teacher" name="teacher_id">
            ${selectOptions(teachers.map((t) => ({ value: t.id, label: t.name })), '', 'Unassigned')}
          </select></div>
          <div class="field"><label for="room">Room</label><input id="room" name="room" placeholder="e.g. Room 12"></div>
          <div class="field"><label for="start">Start time</label><input id="start" name="start_time" type="time" value="08:00" required></div>
          <div class="field"><label for="end">End time</label><input id="end" name="end_time" type="time" value="08:40" required></div>
          <div class="form-actions span-2"><button class="btn" type="submit">${icon('plus')} Add lesson</button></div>
        </form>`,
      })}
    </div>`,
    { active: base }
  ));
}

export function addLesson(ctx) {
  const base = ctx.user.role === 'dos' ? '/dos/timetable' : '/academics/timetable';
  const classId = Number(ctx.fields.class_id || 0);
  const subjectId = Number(ctx.fields.subject_id || 0);
  const teacherId = ctx.fields.teacher_id ? Number(ctx.fields.teacher_id) : null;
  const day = String(ctx.fields.day || '');
  const start = String(ctx.fields.start_time || '');
  const end = String(ctx.fields.end_time || '');
  const room = String(ctx.fields.room || '').trim();
  const fail = (message) => redirect(`${base}?class=${classId}&err=${encodeURIComponent(message)}`);
  if (!getClass(classId)) return fail('Choose a valid class.');
  if (!['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(day)) return fail('Choose a valid day.');
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) {
    return fail('Enter a valid start and end time.');
  }
  try {
    ctx.db
      .prepare(
        `INSERT INTO teaching_timetable (class_id, subject_id, teacher_id, day, start_time, end_time, room)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(classId, subjectId, teacherId, day, start, end, room || null);
    return redirect(`${base}?class=${classId}&ok=${encodeURIComponent('Lesson added to the timetable.')}`);
  } catch (error) {
    const message = String(error.message).includes('UNIQUE')
      ? 'This class already has a lesson at that time on that day.'
      : 'Could not add the lesson.';
    return redirect(`${base}?class=${classId}&err=${encodeURIComponent(message)}`);
  }
}

export function deleteLesson(ctx) {
  const base = ctx.user.role === 'dos' ? '/dos/timetable' : '/academics/timetable';
  const classId = Number(ctx.fields.class_id || 0);
  ctx.db.prepare('DELETE FROM teaching_timetable WHERE id = ?').run(Number(ctx.params.id));
  return redirect(`${base}?class=${classId}&ok=${encodeURIComponent('Lesson removed.')}`);
}

function calendarPage(ctx) {
  const calendar = ctx.db.prepare('SELECT * FROM calendar WHERE id = 1').get() || {};
  return html(layout(
    ctx,
    'Exam & term dates',
    `<div class="split">
      ${panel({
        title: 'Published calendar',
        subtitle: 'Changes are visible to every portal immediately.',
        actions: `<a class="btn small ghost" href="/timetable/exam">Exam timetable</a>`,
        body: `${calendarCard(calendar)}
          <p class="hint" style="margin-top:12px">Exam window: ${calendar.exam_start ? `${esc(fmtDate(calendar.exam_start))} – ${esc(fmtDate(calendar.exam_end))}` : 'not set'}</p>`,
      })}
      ${panel({
        title: 'Edit dates',
        body: `<form method="post" action="/academics/calendar" class="form-grid">
          <div class="field"><label for="term">Term</label><input id="term" name="term" value="${esc(calendar.term || config.term)}" required></div>
          <div class="field"><label for="year">Year</label><input id="year" name="year" type="number" min="2020" max="2100" value="${esc(calendar.year || config.year)}" required></div>
          <div class="field"><label for="opening">Opening date</label><input id="opening" name="opening" type="date" value="${esc(calendar.opening_date || '')}" required></div>
          <div class="field"><label for="closing">Closing date</label><input id="closing" name="closing" type="date" value="${esc(calendar.closing_date || '')}" required></div>
          <div class="field"><label for="exam-start">Exams begin</label><input id="exam-start" name="exam_start" type="date" value="${esc(calendar.exam_start || '')}" required></div>
          <div class="field"><label for="exam-end">Exams end</label><input id="exam-end" name="exam_end" type="date" value="${esc(calendar.exam_end || '')}" required></div>
          <div class="form-actions span-2"><button class="btn" type="submit">${icon('calendar')} Publish dates</button></div>
        </form>`,
      })}
    </div>
    <div class="notice">${icon('mail')}<div>Parents see the opening, closing and exam dates on their portal. Students see the same dates alongside their exam timetable.</div></div>`,
    { active: '/academics/calendar' }
  ));
}

function saveCalendar(ctx) {
  const term = String(ctx.fields.term || '').trim();
  const year = Number(ctx.fields.year);
  const opening = String(ctx.fields.opening || '');
  const closing = String(ctx.fields.closing || '');
  const examStart = String(ctx.fields.exam_start || '');
  const examEnd = String(ctx.fields.exam_end || '');
  if (!term || !Number.isInteger(year)) return redirect('/academics/calendar?err=Enter+a+term+and+year');
  if (![opening, closing, examStart, examEnd].every(isDate)) {
    return redirect('/academics/calendar?err=All+dates+must+be+valid');
  }
  if (opening >= closing) return redirect('/academics/calendar?err=Closing+date+must+come+after+the+opening+date');
  if (examStart > examEnd) return redirect('/academics/calendar?err=The+exam+end+date+must+follow+the+start+date');
  updateCalendar({ term, year, opening, closing, examStart, examEnd, userId: ctx.user.id });
  return redirect('/academics/calendar?ok=Calendar+published+to+all+portals');
}

function messagesPage(ctx) {
  const parents = listParents();
  const sent = messagesSentBy(ctx.user.id);
  const sentRows = sent.map((message) => [
    `<span class="table-name">${esc(message.parent_name)}</span>`,
    esc(message.subject),
    esc(fmtDateTime(message.created_at)),
  ]);
  return html(layout(
    ctx,
    'Parent messages',
    `<div class="split">
      ${panel({
        title: 'Contact a parent',
        subtitle: 'Delivered to the parent portal. Use this for fees, academic and term matters.',
        body: `<form method="post" action="/academics/messages" class="form-grid">
          <div class="field span-2"><label for="parent">Parent</label>
            <select id="parent" name="parent_id" required>
              ${selectOptions(parents.map((p) => ({ value: p.id, label: `${p.name} — ${p.children || 'no children linked'}` })), '', 'Choose a parent')}
            </select>
          </div>
          <div class="field span-2"><label for="subject">Subject</label><input id="subject" name="subject" required placeholder="e.g. Fee balance reminder"></div>
          <div class="field span-2"><label for="body">Message</label><textarea id="body" name="body" required placeholder="Write your message"></textarea></div>
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
    { active: '/academics/messages' }
  ));
}

function sendMessage(ctx) {
  const parentId = Number(ctx.fields.parent_id || 0);
  const subject = String(ctx.fields.subject || '').trim();
  const body = String(ctx.fields.body || '').trim();
  const parent = ctx.db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'parent'").get(parentId);
  if (!parent) return redirect('/academics/messages?err=Choose+a+parent');
  if (!subject || !body) return redirect('/academics/messages?err=Subject+and+message+are+required');
  createMessage({ senderId: ctx.user.id, parentId, subject, body });
  return redirect(`/academics/messages?ok=${encodeURIComponent(`Message sent to ${parent.name}.`)}`);
}

export function register(r) {
  r.get('/academics', ['deputy_academics'], dashboard);
  r.get('/academics/students', ['deputy_academics'], studentsPage);
  r.get('/academics/students/new', ['deputy_academics'], newStudentPage);
  r.post('/academics/students/new', ['deputy_academics'], createStudent);
  r.get('/academics/fees', ['deputy_academics'], feesPage);
  r.post('/academics/fees/:id', ['deputy_academics'], updateFee);
  r.get('/academics/timetable', ['deputy_academics'], teachingTimetablePage);
  r.post('/academics/timetable/add', ['deputy_academics'], addLesson);
  r.post('/academics/timetable/:id/delete', ['deputy_academics'], deleteLesson);
  r.get('/academics/calendar', ['deputy_academics'], calendarPage);
  r.post('/academics/calendar', ['deputy_academics'], saveCalendar);
  r.get('/academics/messages', ['deputy_academics'], messagesPage);
  r.post('/academics/messages', ['deputy_academics'], sendMessage);
}
