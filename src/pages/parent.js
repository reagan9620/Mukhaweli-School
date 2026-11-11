import { config, money } from '../config.js';
import {
  childrenOf,
  classLabel,
  complaintsByUser,
  createComplaint,
  feeAccount,
  getClass,
  getStudent,
  messagesForParent,
  paymentsForStudent,
  revisionList,
  studentReport,
  teachingTimetable,
  todayLessons,
} from '../data.js';
import {
  esc,
  fmtCountdown,
  fmtDate,
  fmtDateTime,
  fmtTime,
  gradeFor,
  gradeTone,
  html,
  redirect,
} from '../http.js';
import {
  avatar,
  badge,
  calendarCard,
  emptyState,
  icon,
  layout,
  panel,
  selectOptions,
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

function myChildren(ctx) {
  return childrenOf(ctx.user.id);
}

function ownsChild(ctx, studentId) {
  return myChildren(ctx).some((child) => child.id === Number(studentId));
}

function childCard(child) {
  const avg = child.average !== null && child.average !== undefined ? Number(child.average) : null;
  return `<article class="child-card">
    <div class="child-head">
      ${avatar(child.name)}
      <div>
        <h3>${esc(child.name)}</h3>
        <p>${esc(classLabel(child))} · ${esc(child.admission_no)}</p>
      </div>
      <span class="pill-row" style="margin-left:auto">
        ${avg !== null ? badge(`${avg.toFixed(1)}%`, gradeTone(avg)) : badge('No marks', 'neutral')}
      </span>
    </div>
    <div class="child-stats">
      <div class="child-stat"><p>Average</p><strong>${avg !== null ? `${avg.toFixed(1)}%` : '—'}</strong></div>
      <div class="child-stat"><p>Grade</p><strong>${avg !== null ? gradeFor(avg) : '—'}</strong></div>
      <div class="child-stat"><p>Fee balance</p><strong style="color:${Number(child.balance) > 0 ? 'var(--bad)' : 'var(--good)'}">${esc(money(child.balance))}</strong></div>
    </div>
    <div class="child-actions">
      <a class="btn small" href="/parent/children/${child.id}">${icon('user')} Open profile</a>
      <a class="btn small ghost" href="/reports/${child.id}">${icon('report')} Report card</a>
      <a class="btn small ghost" href="/parent/fees">${icon('wallet')} Receipts</a>
    </div>
  </article>`;
}

function dashboard(ctx) {
  const children = myChildren(ctx);
  const calendar = ctx.db.prepare('SELECT * FROM calendar WHERE id = 1').get() || {};
  const complaints = complaintsByUser(ctx.user.id);
  const openComplaints = complaints.filter((item) => item.status === 'open');
  const messages = messagesForParent(ctx.user.id);
  const totalBalance = children.reduce((sum, child) => sum + Number(child.balance || 0), 0);
  const averages = children.map((child) => Number(child.average)).filter((n) => Number.isFinite(n));
  const overall = averages.length ? averages.reduce((a, b) => a + b, 0) / averages.length : null;
  const classIds = new Set(children.map((child) => child.class_id).filter(Boolean));
  const revision = revisionList().filter((item) => !item.class_id || classIds.has(item.class_id));
  const nextExam = calendar.exam_start ? fmtCountdown(calendar.exam_start) : '';
  return html(
    layout(
      ctx,
      'Parent portal',
      `<section class="welcome">
        <div>
          <h2>Welcome, ${esc(ctx.user.name.split(' ')[0])}.</h2>
          <p>You are following ${children.length} ${children.length === 1 ? 'child' : 'children'} at ${esc(config.school)} · ${esc(config.term)} ${config.year}</p>
        </div>
        <a class="btn gold" href="/parent/children">${icon('users')} My children</a>
      </section>
      <div class="stats">
        ${statCard({ label: 'Children', value: children.length, meta: 'Linked to your account', iconName: 'users', href: '/parent/children' })}
        ${statCard({ label: 'Combined fee balance', value: esc(money(totalBalance)), meta: `${config.term} · all children`, iconName: 'wallet', tone: totalBalance > 0 ? 'warn' : 'good', href: '/parent/fees' })}
        ${statCard({ label: 'Average performance', value: overall !== null ? `${overall.toFixed(1)}%` : '—', meta: config.examName, iconName: 'award', tone: overall !== null ? gradeTone(overall) : '', href: '/parent/children' })}
        ${statCard({ label: 'Open complaints', value: openComplaints.length, meta: nextExam ? `Exams ${nextExam.toLowerCase()}` : 'Sent to the school', iconName: 'clipboard', tone: openComplaints.length ? 'warn' : 'good', href: '/parent/complaints' })}
      </div>
      <div class="split">
        ${panel({
          title: 'Term & exam dates',
          subtitle: 'Opening, closing and examination window',
          actions: `<a class="btn small ghost" href="/parent/calendar">Full calendar</a>`,
          body: calendarCard(calendar),
        })}
        ${panel({
          title: 'Messages from the school',
          subtitle: 'Notes sent to you by the leadership team',
          body: messages.length
            ? `<div class="list">${messages
                .slice(0, 3)
                .map(
                  (message) => `<div class="list-item">
                    <span class="material-icon">${icon('mail')}</span>
                    <div class="list-copy"><strong>${esc(message.subject)}</strong><small>${esc(message.sender_name)}${message.sender_position ? ` · ${esc(message.sender_position)}` : ''} · ${esc(fmtDateTime(message.created_at))}</small></div>
                  </div>`
                )
                .join('')}</div>`
            : emptyState('No messages from the school yet.'),
        })}
      </div>
      <h2 class="section-title">My children</h2>
      ${
        children.length
          ? `<div class="cards-grid">${children.map((child) => childCard(child)).join('')}</div>`
          : emptyState('No children are linked to your account.', 'Please contact the Deputy Principal (Academics) to link your children.')
      }
      ${panel({
        title: 'Latest revision material',
        subtitle: "Papers and notes for your children's classes",
        actions: `<a class="btn small ghost" href="/parent/revision">All revision</a>`,
        body: revision.length ? revisionCards(revision.slice(0, 3)) : emptyState('No revision materials yet.'),
      })}`,
      { active: '/parent' }
    )
  );
}

function childrenPage(ctx) {
  const children = myChildren(ctx);
  const rows = children.map((child) => [
    `<div class="table-avatar">${avatar(child.name)}<div><span class="table-name">${esc(child.name)}</span><span class="table-sub">${esc(child.admission_no)}</span></div></div>`,
    esc(classLabel(child)),
    child.average !== null && child.average !== undefined
      ? `<span class="mono">${Number(child.average).toFixed(1)}%</span> ${badge(gradeFor(child.average), gradeTone(child.average))}`
      : '—',
    `<span class="mono">${esc(money(child.balance))}</span>`,
    `<span class="pill-row">
      <a class="btn small ghost" href="/parent/children/${child.id}">Profile</a>
      <a class="btn small ghost" href="/reports/${child.id}">Report</a>
    </span>`,
  ]);
  return html(
    layout(
      ctx,
      'My children',
      `${panel({
        title: 'Children linked to your account',
        subtitle: 'You can only open records for these students.',
        body: table(['Student', 'Class', 'Average', 'Fee balance', ''], rows, {
          empty: 'No children are linked to your account yet.',
        }),
        flush: true,
      })}
      ${children.length ? `<div class="cards-grid" style="margin-top:18px">${children.map((child) => childCard(child)).join('')}</div>` : ''}`,
      { active: '/parent/children' }
    )
  );
}

function childPage(ctx) {
  if (!ownsChild(ctx, ctx.params.id)) {
    return html(
      layout(
        ctx,
        'Restricted record',
        panel({
          title: 'You can only view your own children',
          body: `<p class="muted">This student is not linked to your parent account. If this is a mistake, contact the Deputy Principal (Academics).</p>
            <div style="margin-top:16px"><a class="btn ghost" href="/parent/children">${icon('arrow')} Back to my children</a></div>`,
        }),
        { active: '/parent/children' }
      ),
      403
    );
  }
  const report = studentReport(ctx.params.id);
  if (!report) return notFound(ctx);
  const child = report.student;
  const account = feeAccount(child.id);
  const payments = paymentsForStudent(child.id);
  const cls = child.class_id ? getClass(child.class_id) : null;
  const lessons = cls ? teachingTimetable(cls.id) : [];
  const todays = todayLessons(child.class_id);
  const marksRows = report.marks.map((mark) => {
    const has = mark.score !== null && mark.score !== undefined;
    return [
      `<span class="table-name">${esc(mark.subject_name)}</span>`,
      `<span class="mono">${has ? Math.round(mark.score) : '—'}</span>`,
      `<span class="mono">${esc(mark.out_of || 100)}</span>`,
      has ? badge(gradeFor(mark.score), gradeTone(mark.score)) : '—',
    ];
  });
  const receiptRows = payments.map((payment) => [
    esc(fmtDate(payment.paid_on)),
    `<span class="mono">${esc(money(payment.amount))}</span>`,
    esc(payment.method || '—'),
    esc(payment.reference || '—'),
    `<span class="mono">${esc(payment.receipt_no || '—')}</span>`,
  ]);
  return html(
    layout(
      ctx,
      child.name,
      `<div class="welcome">
        <div>
          <h2>${esc(child.name)}</h2>
          <p>${esc(classLabel(child))} · Admission ${esc(child.admission_no)} · Class teacher ${esc(child.class_teacher_name || 'not assigned')}</p>
        </div>
        <span class="pill-row">
          <a class="btn ghost small" href="/parent/children">${icon('arrow')} All children</a>
          <a class="btn gold small" href="/reports/${child.id}">${icon('report')} Printable report</a>
        </span>
      </div>
      <div class="stats">
        ${statCard({ label: 'Average', value: report.average !== null ? `${report.average.toFixed(1)}%` : '—', meta: config.examName, iconName: 'award', tone: report.average !== null ? gradeTone(report.average) : '' })}
        ${statCard({ label: 'Class position', value: report.position ? `${report.position} / ${report.classSize}` : '—', meta: esc(classLabel(child)), iconName: 'chart' })}
        ${statCard({ label: 'Fee balance', value: esc(money(report.balance)), meta: account?.updated_at ? `Updated ${esc(fmtDate(account.updated_at))}` : config.term, iconName: 'wallet', tone: report.balance > 0 ? 'warn' : 'good' })}
        ${statCard({ label: "Today's lessons", value: todays.length, meta: cls ? esc(classLabel(cls)) : 'No class', iconName: 'book' })}
      </div>
      ${panel({
        title: 'Subject results',
        subtitle: `${config.examName} · updated by subject teachers`,
        body: table(['Subject', 'Score', 'Out of', 'Grade'], marksRows, { empty: 'No marks have been published yet.' }),
        flush: true,
      })}
      <div class="split">
        ${panel({
          title: 'Fee account',
          body: `<div class="report-summary" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <div class="summary-box"><p>Outstanding balance</p><strong style="font-size:22px">${esc(money(report.balance))}</strong></div>
            <div class="summary-box"><p>Status</p><strong style="font-size:14px">${report.balance > 0 ? badge('Balance outstanding', 'warn') : badge('Fully cleared', 'good')}</strong></div>
          </div>
          <p class="hint" style="margin-top:12px">${account?.updated_at ? `Last updated ${esc(fmtDateTime(account.updated_at))} by ${esc(account.updated_by || 'the school')}.` : 'No fee account has been opened for this term yet.'}</p>`,
        })}
        ${panel({
          title: 'Payment receipts',
          subtitle: 'Payments recorded against this student',
          body: table(['Date', 'Amount', 'Method', 'Reference', 'Receipt'], receiptRows, { empty: 'No payments have been recorded yet.' }),
          flush: true,
        })}
      </div>
      ${panel({
        title: 'Weekly timetable',
        subtitle: cls ? classLabel(cls) : 'No class',
        body: cls ? renderTimetableGrid(cls, lessons) : '<p class="muted">This student has not been placed in a class yet.</p>',
      })}`,
      { active: '/parent/children' }
    )
  );
}

function feesPage(ctx) {
  const children = myChildren(ctx);
  const totalBalance = children.reduce((sum, child) => sum + Number(child.balance || 0), 0);
  const blocks = children
    .map((child) => {
      const account = feeAccount(child.id);
      const payments = paymentsForStudent(child.id);
      const rows = payments.map((payment) => [
        esc(fmtDate(payment.paid_on)),
        `<span class="mono">${esc(money(payment.amount))}</span>`,
        esc(payment.method || '—'),
        esc(payment.reference || '—'),
        `<span class="mono">${esc(payment.receipt_no || '—')}</span>`,
      ]);
      return panel({
        title: `${child.name} — ${classLabel(child)}`,
        subtitle: `${config.term} · ${child.admission_no}`,
        actions: `<a class="btn small ghost" href="/parent/children/${child.id}">${icon('user')} Profile</a>`,
        body: `<div class="report-summary" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="summary-box"><p>Balance</p><strong style="font-size:20px">${esc(money(child.balance))}</strong></div>
          <div class="summary-box"><p>Receipts on file</p><strong style="font-size:20px">${payments.length}</strong></div>
          <div class="summary-box"><p>Status</p><strong style="font-size:13px">${Number(child.balance) > 0 ? badge('Outstanding', 'warn') : badge('Cleared', 'good')}</strong></div>
        </div>
        ${account?.updated_at ? `<p class="hint" style="margin-top:10px">Balance last updated ${esc(fmtDateTime(account.updated_at))}.</p>` : ''}
        <div style="margin-top:14px">${table(['Date', 'Amount', 'Method', 'Reference', 'Receipt'], rows, { empty: 'No payments have been recorded for this child yet.' })}</div>`,
      });
    })
    .join('');
  return html(
    layout(
      ctx,
      'Fees & receipts',
      `<div class="stats">
        ${statCard({ label: 'Children', value: children.length, meta: 'On your account', iconName: 'users' })}
        ${statCard({ label: 'Combined balance', value: esc(money(totalBalance)), meta: `${config.term} ${config.year}`, iconName: 'wallet', tone: totalBalance > 0 ? 'warn' : 'good' })}
        ${statCard({ label: 'Receipts on file', value: children.reduce((sum, child) => sum + paymentsForStudent(child.id).length, 0), meta: 'Recorded payments', iconName: 'check' })}
      </div>
      ${blocks || emptyState('No children are linked to your account yet.')}`,
      { active: '/parent/fees' }
    )
  );
}

function revisionPage(ctx) {
  const children = myChildren(ctx);
  const classIds = new Set(children.map((child) => child.class_id).filter(Boolean));
  const materials = revisionList().filter((item) => !item.class_id || classIds.has(item.class_id));
  return html(
    layout(
      ctx,
      'Revision materials',
      panel({
        title: 'Revision library',
        subtitle: "Papers and notes for your children's classes and the whole school",
        body: revisionCards(materials),
      }),
      { active: '/parent/revision' }
    )
  );
}

function complaintsPage(ctx) {
  const children = myChildren(ctx);
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
          subtitle: 'Your complaint reaches your child’s class teacher and the Director of Studies.',
          body: `<form method="post" action="/parent/complaints" class="form-grid">
            <div class="field span-2">
              <label for="student">About which child?</label>
              <select id="student" name="student_id" required>
                ${selectOptions(children.map((child) => ({ value: child.id, label: `${child.name} — ${classLabel(child)}` })), '', 'Choose a child')}
              </select>
            </div>
            <div class="field span-2"><label for="category">Category</label><select id="category" name="category">
              ${CATEGORIES.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('')}
            </select></div>
            <div class="field span-2"><label for="subject">Subject</label><input id="subject" name="subject" required placeholder="A short summary"></div>
            <div class="field span-2"><label for="body">Details</label><textarea id="body" name="body" required placeholder="Explain the issue and what would help"></textarea></div>
            <div class="form-actions span-2"><button class="btn" type="submit"${children.length ? '' : ' disabled'}>${icon('mail')} Submit complaint</button></div>
          </form>`,
        })}
        ${panel({
          title: 'My complaints',
          subtitle: 'Track the response from the school',
          body: complaints.length
            ? complaints.map((complaint) => complaintCard(complaint, { showStudent: true })).join('')
            : emptyState('You have not sent any complaints.'),
        })}
      </div>`,
      { active: '/parent/complaints' }
    )
  );
}

function submitComplaint(ctx) {
  const childId = Number(ctx.fields.student_id || 0);
  const category = String(ctx.fields.category || 'Other');
  const subject = String(ctx.fields.subject || '').trim();
  const body = String(ctx.fields.body || '').trim();
  if (!ownsChild(ctx, childId)) return redirect('/parent/complaints?err=Choose+one+of+your+children');
  if (!CATEGORIES.includes(category)) return redirect('/parent/complaints?err=Choose+a+valid+category');
  if (!subject || !body) return redirect('/parent/complaints?err=Subject+and+details+are+required');
  const student = getStudent(childId);
  if (!student) return redirect('/parent/complaints?err=Student+record+not+found');
  createComplaint({
    senderId: ctx.user.id,
    senderRole: 'parent',
    studentId: student.id,
    classId: student.class_id,
    category,
    subject,
    body,
  });
  return redirect('/parent/complaints?ok=Complaint+sent+to+the+class+teacher+and+Director+of+Studies');
}

function calendarPage(ctx) {
  const calendar = ctx.db.prepare('SELECT * FROM calendar WHERE id = 1').get() || {};
  const children = myChildren(ctx);
  return html(
    layout(
      ctx,
      'Term & exam dates',
      `<div class="stats">
        ${statCard({ label: 'Term opens', value: calendar.opening_date ? esc(fmtDate(calendar.opening_date)) : 'Not set', meta: fmtCountdown(calendar.opening_date), iconName: 'calendar' })}
        ${statCard({ label: 'Term closes', value: calendar.closing_date ? esc(fmtDate(calendar.closing_date)) : 'Not set', meta: fmtCountdown(calendar.closing_date), iconName: 'clock' })}
        ${statCard({ label: 'Exams begin', value: calendar.exam_start ? esc(fmtDate(calendar.exam_start)) : 'Not set', meta: fmtCountdown(calendar.exam_start), iconName: 'book' })}
        ${statCard({ label: 'Exams end', value: calendar.exam_end ? esc(fmtDate(calendar.exam_end)) : 'Not set', meta: fmtCountdown(calendar.exam_end), iconName: 'check' })}
      </div>
      <div class="split">
        ${panel({
          title: `${calendar.term || config.term} ${calendar.year || config.year}`,
          subtitle: 'Opening, closing and examination window',
          body: calendarCard(calendar),
        })}
        ${panel({
          title: 'My children at a glance',
          body: children.length
            ? `<div class="list">${children
                .map(
                  (child) => `<div class="list-item">
                    <span class="material-icon">${icon('user')}</span>
                    <div class="list-copy"><strong>${esc(child.name)}</strong><small>${esc(classLabel(child))} · ${esc(child.admission_no)}</small></div>
                    <a class="btn small ghost" href="/reports/${child.id}">Report</a>
                  </div>`
                )
                .join('')}</div>`
            : emptyState('No children are linked to your account yet.'),
        })}
      </div>
      ${panel({
        title: 'Examination timetable',
        subtitle: 'Published by the Director of Studies',
        actions: `<a class="btn small ghost" href="/timetable/exam">Open full timetable</a>`,
        body: `<p class="muted">The complete exam timetable is available for every class. Use the button above to view dates, times and venues.</p>`,
      })}`,
      { active: '/parent/calendar' }
    )
  );
}

export function register(r) {
  r.get('/parent', ['parent'], dashboard);
  r.get('/parent/children', ['parent'], childrenPage);
  r.get('/parent/children/:id', ['parent'], childPage);
  r.get('/parent/fees', ['parent'], feesPage);
  r.get('/parent/revision', ['parent'], revisionPage);
  r.get('/parent/complaints', ['parent'], complaintsPage);
  r.post('/parent/complaints', ['parent'], submitComplaint);
  r.get('/parent/calendar', ['parent'], calendarPage);
}
