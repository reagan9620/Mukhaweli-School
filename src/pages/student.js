import { config, money } from '../config.js';
import {
  classLabel,
  complaintsByUser,
  createComplaint,
  feeAccount,
  getClass,
  getStudentByUserId,
  revisionList,
  studentReport,
  teachingTimetable,
  todayLessons,
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
} from '../http.js';
import {
  badge,
  calendarCard,
  emptyState,
  icon,
  layout,
  panel,
  statCard,
  table,
} from '../views.js';
import {
  complaintCard,
  notFound,
  renderTimetableGrid,
  revisionCards,
} from './shared.js';

const CATEGORIES = ['Fees', 'Academics', 'Boarding', 'Discipline', 'Library', 'Transport', 'Other'];

function studentContext(ctx) {
  const student = getStudentByUserId(ctx.user.id);
  return student;
}

function dashboard(ctx) {
  const student = studentContext(ctx);
  if (!student) {
    return html(
      layout(
        ctx,
        'Student portal',
        panel({
          title: 'No student record linked',
          body: `<div class="notice gold">${icon('alert')}<div>Your account is not linked to a student record yet. Please contact the Deputy Principal (Academics).</div></div>`,
        }),
        { active: '/student' }
      )
    );
  }
  const report = studentReport(student.id);
  const calendar = ctx.db.prepare('SELECT * FROM calendar WHERE id = 1').get() || {};
  const complaints = complaintsByUser(ctx.user.id);
  const open = complaints.filter((c) => c.status === 'open');
  const lessons = todayLessons(student.class_id);
  const revision = revisionList().filter((item) => !item.class_id || item.class_id === student.class_id);
  const avg = report.average;
  return html(
    layout(
      ctx,
      'My portal',
      `<section class="welcome">
        <div>
          <h2>Hello, ${esc(ctx.user.name.split(' ')[0])}.</h2>
          <p>${esc(classLabel(student))} · Admission ${esc(student.admission_no)} · ${esc(config.term)} ${config.year}</p>
        </div>
        <a class="btn gold" href="/student/results">${icon('award')} View my results</a>
      </section>
      <div class="stats">
        ${statCard({ label: 'Average', value: avg !== null ? `${Number(avg).toFixed(1)}%` : '—', meta: `${config.examName}`, iconName: 'award', tone: avg !== null ? gradeTone(avg) : '', href: '/student/results' })}
        ${statCard({ label: 'Class position', value: report.position ? `${report.position} / ${report.classSize}` : '—', meta: esc(classLabel(student)), iconName: 'chart', href: '/student/results' })}
        ${statCard({ label: 'Fee balance', value: esc(money(report.balance)), meta: `${config.term} · ${esc(config.school)}`, iconName: 'wallet', tone: report.balance > 0 ? 'warn' : 'good', href: '/student/fees' })}
        ${statCard({ label: 'Open complaints', value: open.length, meta: 'Sent to the complaint box', iconName: 'clipboard', tone: open.length ? 'warn' : 'good', href: '/student/complaints' })}
      </div>
      <div class="split">
        ${panel({
          title: 'Term & exam dates',
          subtitle: 'Keep these dates in mind',
          actions: `<a class="btn small ghost" href="/timetable/exam">Exam timetable</a>`,
          body: calendarCard(calendar),
        })}
        ${panel({
          title: "Today's lessons",
          subtitle: esc(new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date())),
          actions: `<a class="btn small ghost" href="/student/timetable">Full timetable</a>`,
          body: lessons.length
            ? `<div class="list">${lessons
                .map(
                  (lesson) => `<div class="list-item">
                    <span class="material-icon">${icon('book')}</span>
                    <div class="list-copy"><strong>${esc(lesson.subject_name)}</strong><small>${esc(fmtTime(lesson.start_time))} – ${esc(fmtTime(lesson.end_time))} · ${esc(lesson.teacher_name || '')} · ${esc(lesson.room || '')}</small></div>
                  </div>`
                )
                .join('')}</div>`
            : emptyState('No lessons scheduled today.'),
        })}
      </div>
      ${panel({
        title: 'Latest revision material',
        subtitle: 'For your class and the whole school',
        actions: `<a class="btn small ghost" href="/student/revision">All revision</a>`,
        body: revision.length
          ? revisionCards(revision.slice(0, 3))
          : emptyState('No revision materials yet.'),
      })}`,
      { active: '/student' }
    )
  );
}

function resultsPage(ctx) {
  const student = studentContext(ctx);
  if (!student) return notFound(ctx);
  const report = studentReport(student.id);
  const rows = report.marks.map((mark) => {
    const has = mark.score !== null && mark.score !== undefined;
    return [
      `<span class="table-name">${esc(mark.subject_name)}</span>`,
      `<span class="mono">${has ? Math.round(mark.score) : '—'}</span>`,
      `<span class="mono">${esc(mark.out_of || 100)}</span>`,
      has ? badge(gradeFor(mark.score), gradeTone(mark.score)) : '—',
    ];
  });
  return html(
    layout(
      ctx,
      'My results',
      `<div class="welcome">
        <div>
          <h2>${esc(config.examName)}</h2>
          <p>${esc(classLabel(report.student))} · ${esc(report.student.admission_no)} · results published by your teachers</p>
        </div>
        <a class="btn gold" href="/reports/${student.id}">${icon('report')} Printable report</a>
      </div>
      <div class="stats">
        ${statCard({ label: 'Average', value: report.average !== null ? `${report.average.toFixed(1)}%` : '—', meta: 'Across all subjects', iconName: 'award', tone: report.average !== null ? gradeTone(report.average) : '' })}
        ${statCard({ label: 'Overall grade', value: report.average !== null ? gradeFor(report.average) : '—', meta: 'School grading scale', iconName: 'check' })}
        ${statCard({ label: 'Total marks', value: report.marks.length ? Math.round(report.total) : '—', meta: `${report.marks.length} subjects`, iconName: 'book' })}
        ${statCard({ label: 'Class position', value: report.position ? `${report.position} / ${report.classSize}` : '—', meta: esc(classLabel(report.student)), iconName: 'chart' })}
      </div>
      ${panel({
        title: 'Subject results',
        subtitle: 'Your class teacher and subject teachers update these marks.',
        body: table(['Subject', 'Score', 'Out of', 'Grade'], rows, { empty: 'No marks have been published for you yet.' }),
        flush: true,
      })}`,
      { active: '/student/results' }
    )
  );
}

function feesPage(ctx) {
  const student = studentContext(ctx);
  if (!student) return notFound(ctx);
  const account = feeAccount(student.id);
  const balance = account ? Number(account.balance) : 0;
  return html(
    layout(
      ctx,
      'Fee balance',
      `<div class="split">
        ${panel({
          title: `${config.term} fee position`,
          subtitle: `${config.examName} · ${esc(config.school)}`,
          body: `<div class="report-summary" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <div class="summary-box"><p>Outstanding balance</p><strong style="font-size:24px">${esc(money(balance))}</strong></div>
            <div class="summary-box"><p>Status</p><strong style="font-size:16px">${balance > 0 ? badge('Balance outstanding', 'warn') : badge('Fully cleared', 'good')}</strong></div>
          </div>
          <div class="notice ${balance > 0 ? 'gold' : ''}" style="margin-top:16px">${icon('wallet')}<div>${
            balance > 0
              ? 'Please settle the outstanding balance at the finance office. Your parent or guardian can view the payment receipts on their portal.'
              : 'Your fees for this term are fully paid. Thank you.'
          }</div></div>
          <p class="hint" style="margin-top:12px">${account?.updated_at ? `Last updated ${esc(fmtDateTime(account.updated_at))} by the Deputy Principal (Academics).` : 'No fee account has been opened for this term yet.'}</p>`,
        })}
        ${panel({
          title: 'Fee statement',
          body: `<dl class="kv">
            <dt>Student</dt><dd>${esc(reportName(ctx))}</dd>
            <dt>Admission no.</dt><dd>${esc(student.admission_no)}</dd>
            <dt>Class</dt><dd>${esc(classLabel(getClass(student.class_id) || {}))}</dd>
            <dt>Term</dt><dd>${esc(config.term)} ${config.year}</dd>
            <dt>Balance</dt><dd>${esc(money(balance))}</dd>
          </dl>
          <p class="hint" style="margin-top:14px">Payment receipts are available to your parent or guardian in their portal.</p>`,
        })}
      </div>`,
      { active: '/student/fees' }
    )
  );
}

function reportName(ctx) {
  return ctx.user.name;
}

function timetablePage(ctx) {
  const student = studentContext(ctx);
  if (!student) return notFound(ctx);
  const cls = student.class_id ? getClass(student.class_id) : null;
  if (!cls) {
    return html(layout(ctx, 'Timetable', panel({ title: 'No class', body: '<p class="muted">You have not been placed in a class yet.</p>' }), { active: '/student/timetable' }));
  }
  const lessons = teachingTimetable(cls.id);
  return html(
    layout(
      ctx,
      'My timetable',
      panel({
        title: `Weekly timetable — ${classLabel(cls)}`,
        subtitle: `${config.term} ${config.year}`,
        actions: `<a class="btn small ghost" href="/timetable/exam">Exam timetable</a>`,
        body: renderTimetableGrid(cls, lessons),
      }),
      { active: '/student/timetable' }
    )
  );
}

function revisionPage(ctx) {
  const student = studentContext(ctx);
  if (!student) return notFound(ctx);
  const materials = revisionList().filter((item) => !item.class_id || item.class_id === student.class_id);
  return html(
    layout(
      ctx,
      'Revision materials',
      panel({
        title: 'Revision library',
        subtitle: 'Notes, links and papers for your class and the whole school',
        body: revisionCards(materials),
      }),
      { active: '/student/revision' }
    )
  );
}

function complaintsPage(ctx) {
  const student = studentContext(ctx);
  if (!student) return notFound(ctx);
  const complaints = complaintsByUser(ctx.user.id).map((complaint) => ({
    ...complaint,
    sender_name: ctx.user.name,
  }));
  return html(
    layout(
      ctx,
      'Complaints',
      `<div class="split">
        ${panel({
          title: 'Send a complaint',
          subtitle: 'Your complaint goes directly to the Director of Studies complaint box.',
          body: `<form method="post" action="/student/complaints" class="form-grid">
            <div class="field span-2"><label for="category">Category</label><select id="category" name="category">
              ${CATEGORIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            </select></div>
            <div class="field span-2"><label for="subject">Subject</label><input id="subject" name="subject" required placeholder="A short summary"></div>
            <div class="field span-2"><label for="body">Details</label><textarea id="body" name="body" required placeholder="Explain the issue and what would help"></textarea></div>
            <div class="form-actions span-2"><button class="btn" type="submit">${icon('mail')} Submit complaint</button></div>
          </form>`,
        })}
        ${panel({
          title: 'My complaints',
          subtitle: 'Track the response from the Director of Studies',
          body: complaints.length
            ? complaints.map((complaint) => complaintCard(complaint, { showStudent: false })).join('')
            : emptyState('You have not sent any complaints.'),
        })}
      </div>`,
      { active: '/student/complaints' }
    )
  );
}

function submitComplaint(ctx) {
  const student = studentContext(ctx);
  if (!student) return redirect('/student/complaints?err=No+student+record+linked');
  const category = String(ctx.fields.category || 'Other');
  const subject = String(ctx.fields.subject || '').trim();
  const body = String(ctx.fields.body || '').trim();
  if (!CATEGORIES.includes(category)) return redirect('/student/complaints?err=Choose+a+valid+category');
  if (!subject || !body) return redirect('/student/complaints?err=Subject+and+details+are+required');
  createComplaint({
    senderId: ctx.user.id,
    senderRole: 'student',
    studentId: student.id,
    classId: student.class_id,
    category,
    subject,
    body,
  });
  return redirect('/student/complaints?ok=Complaint+sent+to+the+Director+of+Studies');
}

export function register(r) {
  r.get('/student', ['student'], dashboard);
  r.get('/student/results', ['student'], resultsPage);
  r.get('/student/fees', ['student'], feesPage);
  r.get('/student/timetable', ['student'], timetablePage);
  r.get('/student/revision', ['student'], revisionPage);
  r.get('/student/complaints', ['student'], complaintsPage);
  r.post('/student/complaints', ['student'], submitComplaint);
}
