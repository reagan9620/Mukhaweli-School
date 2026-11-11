import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import {
  addAllocation,
  allocationById,
  allAllocations,
  classLabel,
  classesWithPerformance,
  complaintsCounts,
  complaintsForDos,
  deleteRevision,
  examTimetable,
  getClass,
  gradebookStudents,
  listClasses,
  listSubjects,
  removeAllocation,
  resolveComplaint,
  revisionList,
  setClassTeacher,
  subjectMarkStats,
  upsertMark,
} from '../data.js';
import {
  esc,
  fmtDate,
  fmtDateTime,
  fmtTime,
  gradeFor,
  gradeTone,
  html,
  parseDateOnly,
  redirect,
} from '../http.js';
import {
  badge,
  emptyState,
  icon,
  layout,
  panel,
  selectOptions,
  statCard,
  table,
} from '../views.js';
import {
  addLesson,
  deleteLesson,
  teachingTimetablePage,
} from './academics.js';
import {
  complaintCard,
  notFound,
  resolveForm,
  revisionCards,
  revisionUploadForm,
  saveRevisionUpload,
} from './shared.js';

function dashboard(ctx) {
  const complaintStats = complaintsCounts();
  const classes = classesWithPerformance();
  const revision = revisionList().length;
  const allocations = allAllocations();
  const exams = examTimetable().slice(0, 5);
  const openComplaints = complaintsForDos('open').slice(0, 3);
  const examRows = exams.map((exam) => [
    `<span class="table-name">${esc(fmtDate(exam.exam_date))}</span><span class="table-sub">${esc(fmtTime(exam.start_time))} – ${esc(fmtTime(exam.end_time))}</span>`,
    esc(exam.subject_name),
    `${esc(exam.class_name)} ${esc(exam.class_stream || '')}`,
    esc(exam.venue || '—'),
  ]);
  return html(layout(
    ctx,
    'Director of Studies',
    `<section class="welcome">
      <div>
        <h2>Academic control room.</h2>
        <p>Exams, allocations, marks and the complaint box — all in one place.</p>
      </div>
      <a class="btn gold" href="/dos/exam-timetable">${icon('calendar')} Manage exam timetable</a>
    </section>
    <div class="stats">
      ${statCard({ label: 'Open complaints', value: complaintStats.open, meta: `${complaintStats.total} received in total`, iconName: 'clipboard', tone: complaintStats.open ? 'warn' : 'good', href: '/dos/complaints' })}
      ${statCard({ label: 'Exam papers', value: examTimetable().length, meta: 'Scheduled across all classes', iconName: 'calendar', href: '/dos/exam-timetable' })}
      ${statCard({ label: 'Subject allocations', value: allocations.length, meta: 'Classes assigned to teachers', iconName: 'users', href: '/dos/allocations' })}
      ${statCard({ label: 'Revision materials', value: revision, meta: 'Visible to teachers, parents & students', iconName: 'book', href: '/dos/revision' })}
    </div>
    <div class="split">
      ${panel({
        title: 'Examination schedule',
        subtitle: 'Next papers on the published timetable',
        actions: `<a class="btn small ghost" href="/dos/exam-timetable">Manage</a>`,
        body: table(['Date & time', 'Subject', 'Class', 'Venue'], examRows, { empty: 'No exam papers scheduled.' }),
        flush: true,
      })}
      ${panel({
        title: 'Class averages',
        subtitle: config.examName,
        body: `<div class="list">${classes
          .map(
            (row) => `<div class="list-item">
              <span class="material-icon">${icon('chart')}</span>
              <div class="list-copy"><strong>${esc(row.name)} ${esc(row.stream)}</strong><small>${row.students} students</small></div>
              ${row.avg ? badge(`${Number(row.avg).toFixed(1)}% · ${gradeFor(row.avg)}`, gradeTone(row.avg)) : badge('No marks', 'neutral')}
            </div>`
          )
          .join('')}</div>`,
      })}
    </div>
    ${panel({
      title: 'Open complaints',
      subtitle: 'Submitted by parents, students and staff',
      actions: `<a class="btn small ghost" href="/dos/complaints">Complaint box</a>`,
      body: openComplaints.length
        ? openComplaints
            .map((complaint) =>
              complaintCard(complaint, { showStudent: true, action: resolveForm(`/dos/complaints/${complaint.id}/resolve`) })
            )
            .join('')
        : emptyState('The complaint box is clear.', 'New complaints will appear here.'),
    })}`,
    { active: '/dos' }
  ));
}

function examTimetablePage(ctx) {
  const classes = listClasses();
  const requested = ctx.query.class ? Number(ctx.query.class) : null;
  const selected = classes.find((c) => c.id === requested) || classes[0];
  const calendar = ctx.db.prepare('SELECT * FROM calendar WHERE id = 1').get() || {};
  const subjects = listSubjects();
  if (!selected) {
    return html(layout(ctx, 'Exam timetable', panel({ title: 'No classes', body: '<p class="muted">Create classes first.</p>' }), { active: '/dos/exam-timetable' }));
  }
  const exams = examTimetable(selected.id);
  const rows = exams.map((exam) => [
    `<span class="table-name">${esc(fmtDate(exam.exam_date))}</span>`,
    `${esc(fmtTime(exam.start_time))} – ${esc(fmtTime(exam.end_time))}`,
    `<span class="table-name">${esc(exam.subject_name)}</span>`,
    esc(exam.venue || '—'),
    `<form class="inline-form" method="post" action="/dos/exam-timetable/${exam.id}/delete">
      <input type="hidden" name="class_id" value="${selected.id}">
      <button class="btn small danger" type="submit">Remove</button>
    </form>`,
  ]);
  return html(layout(
    ctx,
    'Exam timetable',
    `<div class="notice">${icon('shield')}<div>This timetable is visible to students, parents, teachers, the leadership and the BOM — but <strong>not</strong> to support staff.</div></div>
    <div style="height:20px"></div>
    <div class="split">
      <div>
        ${panel({
          title: `${classLabel(selected)} — exam papers`,
          subtitle: `${calendar.term || config.term} ${calendar.year || config.year}`,
          actions: `<form class="search-form" method="get" action="/dos/exam-timetable">
            <select name="class" aria-label="Choose class">${selectOptions(classes.map((c) => ({ value: c.id, label: classLabel(c) })), selected.id, null)}</select>
            <button class="btn small ghost" type="submit">View</button>
          </form>`,
          body: table(['Date', 'Time', 'Subject', 'Venue', ''], rows, { empty: 'No papers scheduled for this class yet.' }),
          flush: true,
        })}
        ${panel({
          title: 'All classes overview',
          subtitle: 'Every scheduled paper',
          actions: `<a class="btn small ghost" href="/timetable/exam">Published view</a>`,
          body: table(
            ['Date', 'Time', 'Subject', 'Class', 'Venue'],
            examTimetable().map((exam) => [
              esc(fmtDate(exam.exam_date)),
              `${esc(fmtTime(exam.start_time))} – ${esc(fmtTime(exam.end_time))}`,
              esc(exam.subject_name),
              `${esc(exam.class_name)} ${esc(exam.class_stream || '')}`,
              esc(exam.venue || '—'),
            ]),
            { empty: 'No exam papers scheduled.' }
          ),
          flush: true,
        })}
      </div>
      ${panel({
        title: 'Schedule a paper',
        subtitle: `For ${classLabel(selected)}`,
        body: `<form method="post" action="/dos/exam-timetable" class="form-grid">
          <input type="hidden" name="class_id" value="${selected.id}">
          <div class="field"><label for="exam-subject">Subject</label><select id="exam-subject" name="subject_id" required>
            ${selectOptions(subjects.map((s) => ({ value: s.id, label: s.name })), '', 'Choose subject')}
          </select></div>
          <div class="field"><label for="exam-date">Date</label><input id="exam-date" name="exam_date" type="date" value="${esc(calendar.exam_start || '')}" required></div>
          <div class="field"><label for="exam-start">Start</label><input id="exam-start" name="start_time" type="time" value="08:30" required></div>
          <div class="field"><label for="exam-end">End</label><input id="exam-end" name="end_time" type="time" value="10:30" required></div>
          <div class="field span-2"><label for="exam-venue">Venue</label><input id="exam-venue" name="venue" placeholder="e.g. Main Hall"></div>
          <div class="form-actions span-2"><button class="btn" type="submit">${icon('plus')} Add paper</button></div>
        </form>`,
      })}
    </div>`,
    { active: '/dos/exam-timetable' }
  ));
}

function addExam(ctx) {
  const classId = Number(ctx.fields.class_id || 0);
  const subjectId = Number(ctx.fields.subject_id || 0);
  const examDate = String(ctx.fields.exam_date || '');
  const start = String(ctx.fields.start_time || '');
  const end = String(ctx.fields.end_time || '');
  const venue = String(ctx.fields.venue || '').trim();
  const fail = (message) => redirect(`/dos/exam-timetable?class=${classId}&err=${encodeURIComponent(message)}`);
  if (!getClass(classId)) return fail('Choose a valid class.');
  if (!parseDateOnly(examDate)) return fail('Choose a valid exam date.');
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) {
    return fail('Enter a valid start and end time.');
  }
  if (!ctx.db.prepare('SELECT 1 AS ok FROM subjects WHERE id = ?').get(subjectId)) return fail('Choose a valid subject.');
  ctx.db
    .prepare(
      `INSERT INTO exam_timetable (class_id, subject_id, exam_date, start_time, end_time, venue)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(classId, subjectId, examDate, start, end, venue || null);
  return redirect(`/dos/exam-timetable?class=${classId}&ok=${encodeURIComponent('Exam paper scheduled and published.')}`);
}

function deleteExam(ctx) {
  const classId = Number(ctx.fields.class_id || 0);
  ctx.db.prepare('DELETE FROM exam_timetable WHERE id = ?').run(Number(ctx.params.id));
  return redirect(`/dos/exam-timetable?class=${classId}&ok=${encodeURIComponent('Exam paper removed.')}`);
}

function allocationsPage(ctx) {
  const classes = listClasses();
  const teachers = ctx.db
    .prepare("SELECT id, name FROM users WHERE role = 'teacher' AND active = 1 ORDER BY name")
    .all();
  const subjects = listSubjects();
  const allocations = allAllocations();
  const classTeacherRows = classes.map((cls) => [
    `<span class="table-name">${esc(classLabel(cls))}</span>`,
    cls.teacher_name ? esc(cls.teacher_name) : badge('Unassigned', 'warn'),
    `<form class="inline-form" method="post" action="/dos/allocations/class-teacher">
      <input type="hidden" name="class_id" value="${cls.id}">
      <select name="teacher_id" aria-label="Class teacher for ${esc(classLabel(cls))}" style="width:170px">
        ${selectOptions(teachers.map((t) => ({ value: t.id, label: t.name })), cls.class_teacher_id || '', 'No class teacher')}
      </select>
      <button class="btn small ghost" type="submit">Save</button>
    </form>`,
  ]);
  const allocationRows = allocations.map((allocation) => [
    `${esc(allocation.class_name)} ${esc(allocation.class_stream || '')}`,
    allocation.subject_name,
    `<span class="table-name">${esc(allocation.teacher_name)}</span>`,
    `<form class="inline-form" method="post" action="/dos/allocations/${allocation.id}/delete">
      <button class="btn small danger" type="submit">Remove</button>
    </form>`,
  ]);
  return html(layout(
    ctx,
    'Teacher allocations',
    `<div class="split">
      <div>
        ${panel({
          title: 'Class teachers',
          subtitle: 'Each class has one homeroom teacher',
          body: table(['Class', 'Class teacher', 'Assign'], classTeacherRows, { empty: 'No classes.' }),
          flush: true,
        })}
        ${panel({
          title: 'Subject allocations',
          subtitle: `${allocations.length} allocations · one teacher per class per subject`,
          body: table(['Class', 'Subject', 'Teacher', ''], allocationRows, { empty: 'No subject allocations yet.' }),
          flush: true,
        })}
      </div>
      ${panel({
        title: 'Allocate a subject',
        subtitle: 'Replaces the teacher currently allocated to that class and subject.',
        body: `<form method="post" action="/dos/allocations/add" class="form-grid">
          <div class="field span-2"><label for="alloc-class">Class</label><select id="alloc-class" name="class_id" required>
            ${selectOptions(classes.map((c) => ({ value: c.id, label: classLabel(c) })), '', 'Choose class')}
          </select></div>
          <div class="field span-2"><label for="alloc-subject">Subject</label><select id="alloc-subject" name="subject_id" required>
            ${selectOptions(subjects.map((s) => ({ value: s.id, label: s.name })), '', 'Choose subject')}
          </select></div>
          <div class="field span-2"><label for="alloc-teacher">Teacher</label><select id="alloc-teacher" name="teacher_id" required>
            ${selectOptions(teachers.map((t) => ({ value: t.id, label: t.name })), '', 'Choose teacher')}
          </select></div>
          <div class="form-actions span-2"><button class="btn" type="submit">${icon('plus')} Allocate subject</button></div>
        </form>
        <p class="hint" style="margin-top:12px">A teacher can edit marks only for subjects allocated to them. The class teacher can see parent complaints for their homeroom.</p>`,
      })}
    </div>`,
    { active: '/dos/allocations' }
  ));
}

function setHomeroom(ctx) {
  const classId = Number(ctx.fields.class_id || 0);
  const teacherId = ctx.fields.teacher_id ? Number(ctx.fields.teacher_id) : null;
  if (!getClass(classId)) return redirect('/dos/allocations?err=Invalid+class');
  if (teacherId) {
    const teacher = ctx.db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher'").get(teacherId);
    if (!teacher) return redirect('/dos/allocations?err=Choose+a+valid+teacher');
  }
  setClassTeacher(classId, teacherId);
  return redirect('/dos/allocations?ok=Class+teacher+updated');
}

function allocateSubject(ctx) {
  const classId = Number(ctx.fields.class_id || 0);
  const subjectId = Number(ctx.fields.subject_id || 0);
  const teacherId = Number(ctx.fields.teacher_id || 0);
  if (!getClass(classId)) return redirect('/dos/allocations?err=Choose+a+valid+class');
  const teacher = ctx.db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher'").get(teacherId);
  if (!teacher) return redirect('/dos/allocations?err=Choose+a+valid+teacher');
  if (!ctx.db.prepare('SELECT 1 AS ok FROM subjects WHERE id = ?').get(subjectId)) {
    return redirect('/dos/allocations?err=Choose+a+valid+subject');
  }
  addAllocation(classId, subjectId, teacherId);
  return redirect('/dos/allocations?ok=Subject+allocation+saved');
}

function removeAllocationRoute(ctx) {
  const allocation = allocationById(ctx.params.id);
  if (!allocation) return redirect('/dos/allocations?err=Allocation+not+found');
  removeAllocation(allocation.id);
  return redirect('/dos/allocations?ok=Allocation+removed');
}

function marksPage(ctx) {
  const classes = listClasses();
  const subjects = listSubjects();
  const requestedClass = ctx.query.class ? Number(ctx.query.class) : null;
  const requestedSubject = ctx.query.subject ? Number(ctx.query.subject) : null;
  const selectedClass = classes.find((c) => c.id === requestedClass) || classes[0];
  const selectedSubject = subjects.find((s) => s.id === requestedSubject) || subjects[0];
  if (!selectedClass || !selectedSubject) {
    return html(layout(ctx, 'Gradebook', panel({ title: 'No data', body: '<p class="muted">Classes and subjects are required.</p>' }), { active: '/dos/marks' }));
  }
  const students = gradebookStudents(selectedClass.id, selectedSubject.id);
  const stats = subjectMarkStats(selectedClass.id, selectedSubject.id);
  const rows = students.map((student) => [
    `<div class="table-avatar">${icon('user')}<div><span class="table-name">${esc(student.name)}</span><span class="table-sub">${esc(student.admission_no)}</span></div></div>`,
    `<input type="number" name="score_${student.id}" min="0" max="100" step="0.5" value="${student.score ?? ''}" placeholder="—" aria-label="Score for ${esc(student.name)}" style="max-width:110px">`,
    student.score !== null && student.score !== undefined ? badge(gradeFor(student.score), gradeTone(student.score)) : badge('Not entered', 'neutral'),
  ]);
  return html(layout(
    ctx,
    'Gradebook',
    `${panel({
      title: 'Enter marks',
      subtitle: `${config.examName} · you can edit marks in any subject`,
      actions: `<form class="search-form" method="get" action="/dos/marks">
        <select name="class" aria-label="Class">${selectOptions(classes.map((c) => ({ value: c.id, label: classLabel(c) })), selectedClass.id, null)}</select>
        <select name="subject" aria-label="Subject">${selectOptions(subjects.map((s) => ({ value: s.id, label: s.name })), selectedSubject.id, null)}</select>
        <button class="btn small ghost" type="submit">Open</button>
      </form>`,
      body: `<form method="post" action="/dos/marks">
        <input type="hidden" name="class_id" value="${selectedClass.id}">
        <input type="hidden" name="subject_id" value="${selectedSubject.id}">
        ${table(['Student', 'Score / 100', 'Grade'], rows, { empty: 'No students in this class.' })}
        <div class="form-actions">
          <button class="btn" type="submit">${icon('check')} Save marks</button>
          <span class="hint">Class average: <strong>${stats.avg ? `${Number(stats.avg).toFixed(1)}%` : '—'}</strong> · ${stats.entries} marks entered. Leave a score blank to remove it.</span>
        </div>
      </form>`,
      flush: false,
    })}`,
    { active: '/dos/marks' }
  ));
}

function saveMarks(ctx) {
  const classId = Number(ctx.fields.class_id || 0);
  const subjectId = Number(ctx.fields.subject_id || 0);
  if (!getClass(classId) || !ctx.db.prepare('SELECT 1 AS ok FROM subjects WHERE id = ?').get(subjectId)) {
    return redirect('/dos/marks?err=Invalid+class+or+subject');
  }
  const allowed = new Set(
    ctx.db.prepare('SELECT id FROM students WHERE class_id = ?').all(classId).map((row) => row.id)
  );
  const updates = [];
  for (const [key, raw] of Object.entries(ctx.fields)) {
    const match = /^score_(\d+)$/.exec(key);
    if (!match) continue;
    const studentId = Number(match[1]);
    if (!allowed.has(studentId)) continue;
    const value = String(raw).trim();
    if (value === '') {
      updates.push({ studentId, remove: true });
      continue;
    }
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return redirect(`/dos/marks?class=${classId}&subject=${subjectId}&err=${encodeURIComponent('Scores must be between 0 and 100. Nothing was saved.')}`);
    }
    updates.push({ studentId, score });
  }
  for (const update of updates) {
    if (update.remove) {
      ctx.db
        .prepare('DELETE FROM marks WHERE student_id = ? AND subject_id = ? AND term = ? AND exam_name = ?')
        .run(update.studentId, subjectId, config.term, config.examName);
    } else {
      upsertMark(update.studentId, subjectId, update.score, ctx.user.id);
    }
  }
  return redirect(`/dos/marks?class=${classId}&subject=${subjectId}&ok=${encodeURIComponent('Marks saved. Report cards update immediately.')}`);
}

function complaintsPage(ctx) {
  const status = ['open', 'resolved'].includes(ctx.query.status) ? ctx.query.status : 'all';
  const complaints = complaintsForDos(status);
  const counts = complaintsCounts();
  return html(layout(
    ctx,
    'Complaint box',
    `<div class="stats">
      ${statCard({ label: 'Open', value: counts.open, meta: 'Awaiting action', iconName: 'alert', tone: counts.open ? 'warn' : 'good', href: '/dos/complaints?status=open' })}
      ${statCard({ label: 'Resolved', value: counts.total - counts.open, meta: 'Closed with a resolution', iconName: 'check', tone: 'good', href: '/dos/complaints?status=resolved' })}
      ${statCard({ label: 'Total received', value: counts.total, meta: 'From parents, students and staff', iconName: 'clipboard', href: '/dos/complaints' })}
    </div>
    ${panel({
      title: 'Complaint box',
      subtitle: 'Complaints from any party in the institution. Parent complaints are also routed to the class teacher.',
      actions: `<div class="tabs" style="border:0;margin:0">
        <a class="tab ${status === 'all' ? 'active' : ''}" href="/dos/complaints">All</a>
        <a class="tab ${status === 'open' ? 'active' : ''}" href="/dos/complaints?status=open">Open</a>
        <a class="tab ${status === 'resolved' ? 'active' : ''}" href="/dos/complaints?status=resolved">Resolved</a>
      </div>`,
      body: complaints.length
        ? complaints
            .map((complaint) =>
              complaintCard(complaint, {
                showStudent: true,
                action: complaint.status === 'open' ? resolveForm(`/dos/complaints/${complaint.id}/resolve`) : '',
              })
            )
            .join('')
        : emptyState('No complaints in this view.'),
    })}`,
    { active: '/dos/complaints' }
  ));
}

function resolve(ctx) {
  const complaint = ctx.db.prepare('SELECT id FROM complaints WHERE id = ?').get(Number(ctx.params.id));
  const resolution = String(ctx.fields.resolution || '').trim();
  if (!complaint) return redirect('/dos/complaints?err=Complaint+not+found');
  if (!resolution) return redirect('/dos/complaints?err=Add+a+resolution+note');
  resolveComplaint(complaint.id, ctx.user.id, resolution);
  return redirect('/dos/complaints?ok=Complaint+resolved');
}

function revisionPage(ctx) {
  const materials = revisionList();
  const actionFor = (material) => `<form method="post" action="/dos/revision/${material.id}/delete">
    <button class="btn small danger" type="submit">Delete</button>
  </form>`;
  return html(layout(
    ctx,
    'Revision papers',
    `<div class="split">
      ${panel({
        title: 'Publish revision material',
        subtitle: 'Teachers, parents and students can view what you publish here.',
        body: revisionUploadForm({
          action: '/dos/revision',
          subjects: listSubjects(),
          classes: listClasses(),
        }),
      })}
      ${panel({
        title: 'Revision library',
        subtitle: `${materials.length} materials published`,
        body: revisionCards(materials, { actionFor }),
      })}
    </div>`,
    { active: '/dos/revision' }
  ));
}

function uploadRevision(ctx) {
  const result = saveRevisionUpload(ctx);
  return redirect(`/dos/revision?${result.ok ? 'ok' : 'err'}=${encodeURIComponent(result.message)}`);
}

function removeRevision(ctx) {
  const material = ctx.db
    .prepare('SELECT id, stored_name FROM revision_materials WHERE id = ?')
    .get(Number(ctx.params.id));
  if (!material) return redirect('/dos/revision?err=Material+not+found');
  if (material.stored_name) {
    const target = path.resolve(config.uploadDir, material.stored_name);
    if (target.startsWith(config.uploadDir + path.sep) && fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  }
  deleteRevision(material.id);
  return redirect('/dos/revision?ok=Revision+material+deleted');
}

export function register(r) {
  r.get('/dos', ['dos'], dashboard);
  r.get('/dos/exam-timetable', ['dos'], examTimetablePage);
  r.post('/dos/exam-timetable', ['dos'], addExam);
  r.post('/dos/exam-timetable/:id/delete', ['dos'], deleteExam);
  r.get('/dos/timetable', ['dos'], teachingTimetablePage);
  r.post('/dos/timetable/add', ['dos'], addLesson);
  r.post('/dos/timetable/:id/delete', ['dos'], deleteLesson);
  r.get('/dos/allocations', ['dos'], allocationsPage);
  r.post('/dos/allocations/class-teacher', ['dos'], setHomeroom);
  r.post('/dos/allocations/add', ['dos'], allocateSubject);
  r.post('/dos/allocations/:id/delete', ['dos'], removeAllocationRoute);
  r.get('/dos/marks', ['dos'], marksPage);
  r.post('/dos/marks', ['dos'], saveMarks);
  r.get('/dos/complaints', ['dos'], complaintsPage);
  r.post('/dos/complaints/:id/resolve', ['dos'], resolve);
  r.get('/dos/revision', ['dos'], revisionPage);
  r.post('/dos/revision', ['dos'], uploadRevision);
  r.post('/dos/revision/:id/delete', ['dos'], removeRevision);
}
