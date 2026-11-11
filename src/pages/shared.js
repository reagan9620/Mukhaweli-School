import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, money } from '../config.js';
import { getDb } from '../db.js';
import {
  addRevision,
  allocationsFor,
  canViewExamTimetable,
  canViewReport,
  canViewRevision,
  canViewTeachingTimetable,
  childrenOf,
  classLabel,
  examTimetable,
  getClass,
  getStudent,
  getStudentByUserId,
  homeroomFor,
  listClasses,
  listSubjects,
  revisionById,
  revisionList,
  studentReport,
  teachingTimetable,
} from '../data.js';
import {
  esc,
  fmtDate,
  fmtDateTime,
  fmtTime,
  gradeFor,
  gradeTone,
  html,
  mimeFor,
  nl2br,
  redirect,
  sendBinary,
  todayISO,
  parseDateOnly,
} from '../http.js';
import {
  badge,
  calendarCard,
  complaintBadge,
  emptyState,
  icon,
  layout,
  panel,
  selectOptions,
  table,
} from '../views.js';

const ALL = ['principal', 'deputy_boarding', 'deputy_academics', 'dos', 'teacher', 'student', 'parent', 'worker', 'bom'];
const NO_WORKER = ALL.filter((role) => role !== 'worker');
const REVISION_ROLES = ['principal', 'deputy_academics', 'dos', 'teacher', 'student', 'parent'];
const TEACH_TIMETABLE_ROLES = ['principal', 'deputy_academics', 'dos', 'teacher', 'student', 'parent'];
const REPORT_ROLES = ['principal', 'deputy_academics', 'dos', 'teacher', 'student', 'parent'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = [
  ['08:00', '08:40'],
  ['08:40', '09:20'],
  ['09:20', '10:00'],
  ['10:20', '11:00'],
  ['11:00', '11:40'],
  ['11:40', '12:20'],
  ['14:00', '14:40'],
  ['14:40', '15:20'],
];

export function accessDenied(ctx, message = 'Your role does not have access to this page.') {
  return html(
    layout(
      ctx,
      'Access denied',
      `<div class="notice gold">${icon('shield')}<div><strong>Restricted area.</strong><br>${esc(message)}</div></div>
       <div style="margin-top:16px"><a class="btn ghost" href="/dashboard">Back to my portal</a></div>`,
      { active: '' }
    ),
    403
  );
}

export function notFound(ctx) {
  return html(
    layout(
      ctx,
      'Not found',
      panel({
        title: 'We could not find that record',
        body: `<p class="muted">The record may have been removed or the link is incorrect.</p>
          <div style="margin-top:16px"><a class="btn ghost" href="/dashboard">Back to my portal</a></div>`,
      }),
      { active: '' }
    ),
    404
  );
}

export function kindLabel(kind) {
  return kind === 'file' ? 'File' : kind === 'link' ? 'Link' : 'Notes';
}

function canOpenRevision(user, material) {
  if (!canViewRevision(user) || !material) return false;
  if (!material.class_id) return true;
  if (user.role === 'student') {
    const student = getStudentByUserId(user.id);
    return !!student && student.class_id === material.class_id;
  }
  if (user.role === 'parent') {
    return childrenOf(user.id).some((child) => child.class_id === material.class_id);
  }
  return true;
}

export function revisionCards(materials, { actionFor = null } = {}) {
  if (!materials.length) {
    return emptyState('No revision materials yet.', 'Uploaded revision papers and notes will appear here.');
  }
  return `<div class="cards-grid">${materials
    .map((item) => {
      const iconName = item.kind === 'file' ? 'file' : item.kind === 'link' ? 'link' : 'note';
      const audience = item.class_name ? classLabel(item) : 'All classes';
      const subject = item.subject_name || 'General';
      return `<article class="material-card">
        <div class="material-top">
          <span class="material-icon">${icon(iconName)}</span>
          ${badge(kindLabel(item.kind), item.kind === 'file' ? 'info' : item.kind === 'link' ? 'gold' : 'neutral')}
        </div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(subject)} · ${esc(audience)}</p>
        <div class="material-foot">
          <span>${esc(item.uploader_name)} · ${esc(fmtDate(item.created_at, 'short'))}</span>
          <span class="pill-row">
            ${actionFor ? actionFor(item) : ''}
            <a class="btn small ghost" href="/revision/${item.id}">Open</a>
          </span>
        </div>
      </article>`;
    })
    .join('')}</div>`;
}

export function revisionUploadForm({ action, subjects, classes = null, fixedClass = null }) {
  return `<form class="form-grid" method="post" action="${esc(action)}" enctype="multipart/form-data" data-kind-form>
    <div class="field span-2">
      <label for="rev-title">Title</label>
      <input id="rev-title" name="title" required placeholder="e.g. Mathematics revision paper 2">
    </div>
    <div class="field">
      <label for="rev-subject">Subject</label>
      <select id="rev-subject" name="subject_id">
        ${selectOptions(subjects.map((s) => ({ value: s.id, label: s.name })), '', 'All subjects')}
      </select>
    </div>
    ${fixedClass
      ? `<input type="hidden" name="class_id" value="${fixedClass.id}">
         <div class="field"><label>Class</label><input value="${esc(classLabel(fixedClass))}" disabled></div>`
      : `<div class="field">
          <label for="rev-class">Class</label>
          <select id="rev-class" name="class_id">
            ${selectOptions((classes || []).map((c) => ({ value: c.id, label: classLabel(c) })), '', 'All classes')}
          </select>
        </div>`}
    <div class="field">
      <label for="rev-kind">Format</label>
      <select id="rev-kind" name="kind">
        <option value="note">Notes / text</option>
        <option value="file">Upload a file</option>
        <option value="link">External link</option>
      </select>
    </div>
    <div class="field span-2" data-kind-field="file" hidden>
      <label for="rev-file">File</label>
      <input id="rev-file" name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png">
      <span class="hint">PDF, Word, PowerPoint, text or image. Maximum 6 MB.</span>
    </div>
    <div class="field span-2" data-kind-field="link" hidden>
      <label for="rev-url">Link</label>
      <input id="rev-url" name="url" type="url" placeholder="https://...">
    </div>
    <div class="field span-2" data-kind-field="note">
      <label for="rev-notes">Notes</label>
      <textarea id="rev-notes" name="notes" placeholder="Paste the revision questions, guidance or summary here"></textarea>
    </div>
    <div class="form-actions span-2">
      <button class="btn" type="submit">${icon('download')} Publish material</button>
      <span class="hint">Visible to teachers, parents and students.</span>
    </div>
  </form>`;
}

export function saveRevisionUpload(ctx) {
  const fields = ctx.fields;
  const title = String(fields.title || '').trim();
  const kind = ['note', 'link', 'file'].includes(fields.kind) ? fields.kind : 'note';
  const notes = String(fields.notes || '').trim();
  const url = String(fields.url || '').trim();
  const subjectId = fields.subject_id ? Number(fields.subject_id) : null;
  const classId = fields.class_id ? Number(fields.class_id) : null;
  if (!title) return { ok: false, message: 'Give the material a title.' };
  if (kind === 'note' && !notes) return { ok: false, message: 'Paste the notes or guidance for this material.' };
  if (kind === 'link') {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
    } catch {
      return { ok: false, message: 'Enter a valid http(s) link.' };
    }
  }
  let file = null;
  if (kind === 'file') {
    const upload = ctx.files.file;
    if (!upload || !upload.filename || !upload.data?.length) {
      return { ok: false, message: 'Choose a file to upload.' };
    }
    if (upload.data.length > 6 * 1024 * 1024) {
      return { ok: false, message: 'Files must be 6 MB or smaller.' };
    }
    const ext = path.extname(upload.filename).toLowerCase();
    const allowed = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.jpg', '.jpeg', '.png'];
    if (!allowed.includes(ext)) {
      return { ok: false, message: 'Unsupported file type. Use PDF, Word, PowerPoint, text or image files.' };
    }
    const storedName = `${crypto.randomUUID()}${ext}`;
    fs.mkdirSync(config.uploadDir, { recursive: true });
    fs.writeFileSync(path.join(config.uploadDir, storedName), upload.data);
    file = { fileName: upload.filename, storedName };
  }
  addRevision({
    title,
    subjectId,
    classId,
    kind,
    url: kind === 'link' ? url : null,
    notes: kind === 'note' ? notes : null,
    fileName: file?.fileName,
    storedName: file?.storedName,
    uploadedBy: ctx.user.id,
  });
  return { ok: true, message: `“${title}” published to the revision library.` };
}

export function complaintCard(complaint, { action = '', showStudent = false } = {}) {
  const about = showStudent && complaint.student_name ? ` · About ${esc(complaint.student_name)}` : '';
  const classText = complaint.class_name ? ` · ${esc(complaint.class_name)} ${esc(complaint.class_stream || '')}` : '';
  return `<article class="complaint">
    <div class="complaint-head">
      <div>
        <h3>${esc(complaint.subject)}</h3>
        <p class="complaint-meta">
          ${esc(complaint.sender_name || 'Sender')} (${esc(complaint.sender_role)})${about}${classText}
          · ${esc(fmtDateTime(complaint.created_at))}
        </p>
      </div>
      <span class="pill-row">${badge(complaint.category, 'info')}${complaintBadge(complaint.status)}</span>
    </div>
    <div class="complaint-body">${nl2br(complaint.body)}</div>
    ${
      complaint.status === 'resolved'
        ? `<div class="complaint-resolution"><strong>Resolution${complaint.resolver_name ? ` · ${esc(complaint.resolver_name)}` : ''}</strong>${esc(complaint.resolution || 'Resolved.')}</div>`
        : ''
    }
    ${action}
  </article>`;
}

export function resolveForm(action, label = 'Mark resolved') {
  return `<form class="resolve-form" method="post" action="${esc(action)}">
    <div class="field"><label>Resolution note</label><textarea name="resolution" required placeholder="What action was taken?"></textarea></div>
    <button class="btn small" type="submit">${icon('check')} ${esc(label)}</button>
  </form>`;
}

export function viewerClasses(user) {
  if (user.role === 'student') {
    const student = getStudentByUserId(user.id);
    const cls = student?.class_id ? getClass(student.class_id) : null;
    return cls ? [cls] : [];
  }
  if (user.role === 'parent') {
    const seen = new Set();
    return childrenOf(user.id)
      .map((child) => (child.class_id ? getClass(child.class_id) : null))
      .filter((cls) => cls && !seen.has(cls.id) && seen.add(cls.id));
  }
  if (user.role === 'teacher') {
    const seen = new Set();
    const home = homeroomFor(user.id);
    const classes = home ? [getClass(home.id)] : [];
    for (const allocation of allocationsFor(user.id)) {
      if (!seen.has(allocation.class_id)) classes.push(getClass(allocation.class_id));
      seen.add(allocation.class_id);
    }
    return classes.filter((cls, index) => cls && classes.findIndex((c) => c?.id === cls.id) === index);
  }
  return listClasses();
}

export function renderTimetableGrid(classRow, lessons) {
  if (!lessons.length) {
    return emptyState('No lessons on the timetable yet.', 'The timetable for this class has not been published.');
  }
  const bySlot = new Map(lessons.map((lesson) => [`${lesson.day}|${lesson.start_time}`, lesson]));
  const head = PERIODS.map(
    ([start, end]) => `<th>${esc(fmtTime(start))}<br><span class="muted" style="font-weight:500;letter-spacing:0;text-transform:none">${esc(fmtTime(end))}</span></th>`
  ).join('');
  const rows = DAYS.map((day) => {
    const cells = PERIODS.map(([start]) => {
      const lesson = bySlot.get(`${day}|${start}`);
      if (!lesson) return `<td><span class="free">—</span></td>`;
      return `<td><span class="lesson">
        <strong>${esc(lesson.subject_name)}</strong>
        <small>${esc(lesson.teacher_name || 'Teacher not assigned')}</small>
        <span class="time">${esc(lesson.room || 'Room TBC')}</span>
      </span></td>`;
    }).join('');
    return `<tr><td class="day-cell">${esc(day)}</td>${cells}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="timetable">
    <thead><tr><th class="day-cell">Day</th>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  ${classRow?.teacher_name ? `<p class="hint" style="margin-top:10px">Class teacher: ${esc(classRow.teacher_name)}</p>` : ''}`;
}

export function registerShared(r) {
  r.get('/calendar', ALL, (ctx) => {
    const calendar = ctx.db.prepare('SELECT * FROM calendar WHERE id = 1').get() || {};
    const examSoon = calendar.exam_start ? parseDateOnly(calendar.exam_start) : null;
    return html(
      layout(
        ctx,
        'School calendar',
        `${panel({
          title: `${calendar.term || config.term} ${calendar.year || config.year}`,
          subtitle: 'Key dates for the current academic term',
          body: calendarCard(calendar),
        })}
        <div class="grid-2">
          ${panel({
            title: 'Term dates',
            body: `<dl class="kv">
              <dt>Term</dt><dd>${esc(calendar.term || config.term)} ${esc(calendar.year || config.year)}</dd>
              <dt>Opening date</dt><dd>${calendar.opening_date ? esc(fmtDate(calendar.opening_date)) : 'Not set'}</dd>
              <dt>Closing date</dt><dd>${calendar.closing_date ? esc(fmtDate(calendar.closing_date)) : 'Not set'}</dd>
              <dt>Exam window</dt><dd>${calendar.exam_start ? `${esc(fmtDate(calendar.exam_start))} – ${esc(fmtDate(calendar.exam_end))}` : 'Not set'}</dd>
              <dt>Today</dt><dd>${esc(fmtDate(new Date()))}</dd>
            </dl>`,
          })}
          ${panel({
            title: 'What these dates mean for you',
            body: `<div class="list">
              <div class="list-item"><span class="material-icon">${icon('book')}</span><div class="list-copy"><strong>Examinations</strong><small>${examSoon ? esc(fmtDate(calendar.exam_start)) : 'Exam dates will be published by the Deputy Principal (Academics).'}</small></div></div>
              <div class="list-item"><span class="material-icon">${icon('calendar')}</span><div class="list-copy"><strong>Closing & opening</strong><small>Plan travel and fee payments around the opening and closing dates.</small></div></div>
              <div class="list-item"><span class="material-icon">${icon('mail')}</span><div class="list-copy"><strong>Need clarification?</strong><small>Contact the school office on ${esc(config.phone)}.</small></div></div>
            </div>`,
          })}
        </div>`,
        { active: '/calendar' }
      )
    );
  });

  r.get('/timetable/exam', NO_WORKER, (ctx) => {
    if (!canViewExamTimetable(ctx.user)) return accessDenied(ctx);
    const classes = listClasses();
    const selected = ctx.query.class ? Number(ctx.query.class) : null;
    const calendar = ctx.db.prepare('SELECT * FROM calendar WHERE id = 1').get() || {};
    const rows = examTimetable(selected || null).map((row) => [
      `<span class="table-name">${esc(fmtDate(row.exam_date))}</span><span class="table-sub">${esc(fmtTime(row.start_time))} – ${esc(fmtTime(row.end_time))}</span>`,
      esc(row.subject_name),
      `${esc(row.class_name)} ${esc(row.class_stream || '')}`,
      esc(row.venue || '—'),
    ]);
    return html(
      layout(
        ctx,
        'Exam timetable',
        `${calendar.exam_start ? `<div class="notice">${icon('calendar')}<div>Exam window: <strong>${esc(fmtDate(calendar.exam_start))} – ${esc(fmtDate(calendar.exam_end))}</strong>. See the full exam timetable below.</div></div>` : ''}
        ${panel({
          title: 'End-of-term examination timetable',
          subtitle: 'Published by the Director of Studies · visible to the whole school except support staff',
          actions: `<form class="search-form" method="get" action="/timetable/exam">
            <select name="class" aria-label="Filter by class">
              ${selectOptions(classes.map((c) => ({ value: c.id, label: classLabel(c) })), selected || '', 'All classes')}
            </select>
            <button class="btn small ghost" type="submit">Filter</button>
          </form>`,
          body: table(['Date & time', 'Subject', 'Class', 'Venue'], rows, { empty: 'No exam papers have been scheduled yet.' }),
          flush: true,
        })}`,
        { active: '/timetable/exam' }
      )
    );
  });

  r.get('/timetable/teach', TEACH_TIMETABLE_ROLES, (ctx) => {
    if (!canViewTeachingTimetable(ctx.user)) return accessDenied(ctx);
    const allowed = viewerClasses(ctx.user);
    if (!allowed.length) {
      return html(
        layout(
          ctx,
          'Teaching timetable',
          panel({
            title: 'No class linked to your account',
            body: `<p class="muted">Once a class teacher or subject allocation is recorded for you, the timetable will appear here.</p>`,
          }),
          { active: '' }
        )
      );
    }
    const requested = ctx.query.class ? Number(ctx.query.class) : null;
    const selected = allowed.find((c) => c.id === requested) || allowed[0];
    const lessons = teachingTimetable(selected.id);
    return html(
      layout(
        ctx,
        `Timetable — ${classLabel(selected)}`,
        panel({
          title: 'Weekly teaching timetable',
          subtitle: `${classLabel(selected)} · ${config.term} ${config.year}`,
          actions: `<form class="search-form" method="get" action="/timetable/teach">
            <select name="class" aria-label="Choose class">
              ${selectOptions(allowed.map((c) => ({ value: c.id, label: classLabel(c) })), selected.id, null)}
            </select>
            <button class="btn small ghost" type="submit">View</button>
          </form>`,
          body: renderTimetableGrid(selected, lessons),
        }),
        { active: '' }
      )
    );
  });

  r.get('/reports/:id', REPORT_ROLES, (ctx) => {
    const student = getStudent(ctx.params.id);
    if (!student) return notFound(ctx);
    if (!canViewReport(ctx.user, student)) {
      return accessDenied(ctx, 'You can only open reports for students assigned to you.');
    }
    const report = studentReport(student.id);
    const principal = ctx.db.prepare("SELECT name FROM users WHERE role = 'principal' LIMIT 1").get();
    const classAverage =
      report.average !== null
        ? Number(report.average).toFixed(1)
        : '—';
    const overallGrade = report.average !== null ? gradeFor(report.average) : '—';
    const showFee = ctx.user.role !== 'teacher';
    const marksRows = report.marks.length
      ? report.marks.map((mark) => {
          const has = mark.score !== null && mark.score !== undefined;
          return [
            `<span class="table-name">${esc(mark.subject_name)}</span>`,
            `<span class="mono">${has ? Math.round(mark.score) : '—'}</span>`,
            `<span class="mono">${esc(mark.out_of || 100)}</span>`,
            has ? badge(gradeFor(mark.score), gradeTone(mark.score)) : '—',
          ];
        })
      : [];
    const backMap = {
      principal: '/principal/students',
      deputy_academics: '/academics/students',
      dos: '/dos/marks',
      teacher: '/teacher/students',
      student: '/student/results',
      parent: '/parent/children',
    };
    return html(
      layout(
        ctx,
        `Report - ${student.name}`,
        `<div class="print-note no-print">
          <a class="btn ghost small" href="${backMap[ctx.user.role] || '/dashboard'}">${icon('arrow')} Back</a>
          <button class="btn small" type="button" onclick="window.print()">${icon('report')} Print report card</button>
        </div>
        <article class="report-paper">
          <header class="report-head">
            <span class="report-crest">M</span>
            <div class="report-school">
              <h2>${esc(config.school)}</h2>
              <p>${esc(config.address)} · ${esc(config.phone)} · ${esc(config.email)}</p>
              <p>${esc(config.motto)}</p>
            </div>
            <div class="report-title">
              <strong>End of term report</strong>
              <span>${esc(config.examName)}</span>
            </div>
          </header>
          <div class="report-meta">
            <div><span>Student:</span> <strong>${esc(student.name)}</strong></div>
            <div><span>Admission no:</span> <strong>${esc(student.admission_no)}</strong></div>
            <div><span>Class:</span> <strong>${esc(classLabel(student))}</strong></div>
            <div><span>Class teacher:</span> <strong>${esc(student.class_teacher_name || '—')}</strong></div>
            <div><span>Issued:</span> <strong>${esc(fmtDate(new Date()))}</strong></div>
          </div>
          ${table(['Subject', 'Score', 'Out of', 'Grade'], marksRows, { empty: 'No marks have been entered for this student yet.' })}
          <div class="report-summary">
            <div class="summary-box"><p>Total marks</p><strong>${report.marks.length ? Math.round(report.total) : '—'}</strong></div>
            <div class="summary-box"><p>Average</p><strong>${classAverage}%</strong></div>
            <div class="summary-box"><p>Overall grade</p><strong>${overallGrade}</strong></div>
            <div class="summary-box"><p>Class position</p><strong>${report.position ? `${report.position} / ${report.classSize}` : '—'}</strong></div>
          </div>
          ${
            showFee
              ? `<div class="notice ${report.balance > 0 ? 'gold' : ''}">${icon('wallet')}<div>${
                  report.balance > 0
                    ? `Outstanding fee balance for ${esc(config.term)}: <strong>${esc(money(report.balance))}</strong>.`
                    : `Fees for ${esc(config.term)} are fully cleared.`
                }</div></div>`
              : ''
          }
          <div class="signatures">
            <div class="sig"><strong>${esc(student.class_teacher_name || 'Class Teacher')}</strong>Class teacher</div>
            <div class="sig"><strong>${esc(principal?.name || 'Principal')}</strong>Principal</div>
            <div class="sig"><strong>&nbsp;</strong>Parent / guardian signature</div>
          </div>
        </article>`,
        { active: '', wide: true }
      )
    );
  });

  r.get('/revision/:id', REVISION_ROLES, (ctx) => {
    if (!canViewRevision(ctx.user)) return accessDenied(ctx);
    const material = revisionById(ctx.params.id);
    if (!material) return notFound(ctx);
    if (!canOpenRevision(ctx.user, material)) {
      return accessDenied(ctx, 'This material was published for a different class.');
    }
    const backMap = {
      dos: '/dos/revision',
      teacher: '/teacher/revision',
      student: '/student/revision',
      parent: '/parent/revision',
      principal: '/dashboard',
      deputy_academics: '/dashboard',
    };
    const fileHref = material.stored_name
      ? `/uploads/${encodeURIComponent(material.stored_name)}`
      : material.url;
    const body = `
      <div class="notice">${icon('book')}<div><strong>${esc(material.title)}</strong><br>
        ${esc(material.subject_name || 'General')} · ${material.class_name ? esc(classLabel(material)) : 'All classes'} ·
        uploaded by ${esc(material.uploader_name)} on ${esc(fmtDate(material.created_at))}</div></div>
      ${
        material.kind === 'note'
          ? `<div class="note-content">${esc(material.notes || '')}</div>`
          : `<div style="margin-top:16px"><a class="btn" href="${esc(fileHref)}" target="_blank" rel="noopener">${icon(material.kind === 'file' ? 'download' : 'link')} ${material.kind === 'file' ? 'Download file' : 'Open link'}</a>
             ${material.kind === 'file' ? `<p class="hint" style="margin-top:8px">${esc(material.file_name || '')}</p>` : ''}</div>`
      }`;
    return html(
      layout(
        ctx,
        'Revision material',
        `<div class="print-note no-print"><a class="btn ghost small" href="${backMap[ctx.user.role] || '/dashboard'}">${icon('arrow')} Back</a></div>
        ${panel({ title: material.title, subtitle: kindLabel(material.kind), body })}`,
        { active: '' }
      )
    );
  });

  r.get('/uploads/:name', REVISION_ROLES, (ctx) => {
    if (!canViewRevision(ctx.user)) return accessDenied(ctx);
    const row = getDb()
      .prepare('SELECT stored_name, file_name, class_id FROM revision_materials WHERE stored_name = ?')
      .get(ctx.params.name);
    if (!row || !canOpenRevision(ctx.user, row)) return notFound(ctx);
    const target = path.resolve(config.uploadDir, row.stored_name);
    if (!target.startsWith(config.uploadDir + path.sep) || !fs.existsSync(target)) return notFound(ctx);
    const buffer = fs.readFileSync(target);
    return sendBinary(buffer, mimeFor(row.file_name), row.file_name, true);
  });
}
