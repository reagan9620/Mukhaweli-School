import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import {
  allocationById,
  allocationsFor,
  classLabel,
  complaintsForTeacher,
  deleteRevision,
  gradebookStudents,
  homeroomFor,
  listStudents,
  listSubjects,
  resolveComplaint,
  revisionList,
  subjectMarkStats,
  teacherTimetable,
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
  redirect,
} from '../http.js';
import {
  avatar,
  badge,
  emptyState,
  icon,
  layout,
  panel,
  statCard,
  table,
} from '../views.js';
import {
  complaintCard,
  resolveForm,
  revisionCards,
  revisionUploadForm,
  saveRevisionUpload,
} from './shared.js';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function dashboard(ctx) {
  const home = homeroomFor(ctx.user.id);
  const allocations = allocationsFor(ctx.user.id);
  const complaints = home ? complaintsForTeacher(home.id) : [];
  const open = complaints.filter((c) => c.status === 'open');
  const timetable = teacherTimetable(ctx.user.id);
  const today = weekdays[new Date().getDay()];
  const todaysLessons = timetable.filter((lesson) => lesson.day === today);
  const classRows = allocations.map((allocation) => [
    `<a class="table-name" href="/teacher/marks?allocation=${allocation.id}">${esc(classLabel(allocation))}</a><span class="table-sub">${allocation.students ?? ''}</span>`,
    esc(allocation.subject_name),
    `<a class="btn small ghost" href="/teacher/marks?allocation=${allocation.id}">Enter marks</a>`,
  ]);
  return html(
    layout(
      ctx,
      'Teacher overview',
      `<section class="welcome">
        <div>
          <h2>${esc(ctx.user.name)}</h2>
          <p>${esc(ctx.user.position || 'Teacher')}${home ? ` · Class teacher of ${esc(classLabel(home))}` : ' · No homeroom assigned'}</p>
        </div>
        <a class="btn gold" href="/teacher/marks">${icon('award')} Open gradebook</a>
      </section>
      <div class="stats">
        ${statCard({ label: 'My class', value: home ? `${home.students}` : '—', meta: home ? `${classLabel(home)} learners` : 'No homeroom assigned', iconName: 'users', href: home ? '/teacher/students' : '/teacher' })}
        ${statCard({ label: 'Subject allocations', value: allocations.length, meta: 'Classes you teach', iconName: 'book', href: '/teacher/marks' })}
        ${statCard({ label: 'Parent complaints', value: open.length, meta: home ? `For ${classLabel(home)}` : 'No class linked', iconName: 'clipboard', tone: open.length ? 'warn' : 'good', href: '/teacher/complaints' })}
        ${statCard({ label: 'Lessons this week', value: timetable.length, meta: `${todaysLessons.length} today`, iconName: 'grid', href: '/teacher/timetable' })}
      </div>
      <div class="split">
        ${panel({
          title: 'My subjects',
          subtitle: 'You can edit marks only in these class and subject pairs.',
          body: table(['Class', 'Subject', ''], classRows, { empty: 'No subject allocations have been made to you yet.' }),
          flush: true,
        })}
        ${panel({
          title: "Today's lessons",
          subtitle: esc(today),
          actions: `<a class="btn small ghost" href="/teacher/timetable">Full timetable</a>`,
          body: todaysLessons.length
            ? `<div class="list">${todaysLessons
                .map(
                  (lesson) => `<div class="list-item">
                    <span class="material-icon">${icon('clock')}</span>
                    <div class="list-copy"><strong>${esc(lesson.subject_name)} · ${esc(lesson.class_name)} ${esc(lesson.class_stream || '')}</strong><small>${esc(fmtTime(lesson.start_time))} – ${esc(fmtTime(lesson.end_time))} · ${esc(lesson.room || 'Room TBC')}</small></div>
                  </div>`
                )
                .join('')}</div>`
            : emptyState('No lessons today.', 'Enjoy the planning time.'),
        })}
      </div>
      ${homeroomPanel(home, complaints, open)}`,
      { active: '/teacher' }
    )
  );
}

function homeroomPanel(home, complaints, open) {
  if (!home) {
    return panel({
      title: 'No class assigned',
      body: `<div class="notice gold">${icon('alert')}<div>You are not currently a class teacher. The Director of Studies allocates class teachers. You can still enter marks for your subject allocations.</div></div>`,
    });
  }
  return panel({
    title: `Class ${classLabel(home)}`,
    subtitle: `${home.students} learners · parent complaints are routed here`,
    actions: `<a class="btn small ghost" href="/teacher/complaints">Complaint inbox (${open.length})</a>`,
    body: complaints.length
      ? `<div class="list">${complaints.slice(0, 3).map(
          (complaint) => `<div class="list-item">
            <span class="material-icon">${icon('clipboard')}</span>
            <div class="list-copy"><strong>${esc(complaint.subject)}</strong><small>${esc(complaint.sender_name)} · ${esc(fmtDateTime(complaint.created_at))}</small></div>
            ${complaint.status === 'open' ? badge('Open', 'warn') : badge('Resolved', 'good')}
          </div>`
        ).join('')}</div>`
      : emptyState('No parent complaints for your class.'),
  });
}

function marksPage(ctx) {
  const allocations = allocationsFor(ctx.user.id);
  if (!allocations.length) {
    return html(
      layout(
        ctx,
        'Gradebook',
        panel({
          title: 'No subject allocations',
          body: `<div class="notice gold">${icon('alert')}<div>The Director of Studies has not allocated any subjects to you. Marks can only be entered for allocated class/subject pairs.</div></div>`,
        }),
        { active: '/teacher/marks' }
      )
    );
  }
  const requested = ctx.query.allocation ? Number(ctx.query.allocation) : null;
  const selected = allocations.find((a) => a.id === requested) || allocations[0];
  const students = gradebookStudents(selected.class_id, selected.subject_id);
  const stats = subjectMarkStats(selected.class_id, selected.subject_id);
  const rows = students.map((student) => [
    `<div class="table-avatar">${icon('user')}<div><span class="table-name">${esc(student.name)}</span><span class="table-sub">${esc(student.admission_no)}</span></div></div>`,
    `<input type="number" name="score_${student.id}" min="0" max="100" step="0.5" value="${student.score ?? ''}" placeholder="—" aria-label="Score for ${esc(student.name)}" style="max-width:110px">`,
    student.score !== null && student.score !== undefined ? badge(gradeFor(student.score), gradeTone(student.score)) : badge('Not entered', 'neutral'),
  ]);
  return html(
    layout(
      ctx,
      'Gradebook',
      `${panel({
        title: 'Enter marks',
        subtitle: `${classLabel(selected)} · ${selected.subject_name} · ${config.examName}`,
        actions: `<form class="search-form" method="get" action="/teacher/marks">
          <select name="allocation" aria-label="Allocation">${allocations
            .map(
              (allocation) =>
                `<option value="${allocation.id}" ${allocation.id === selected.id ? 'selected' : ''}>${esc(classLabel(allocation))} — ${esc(allocation.subject_name)}</option>`
            )
            .join('')}</select>
          <button class="btn small ghost" type="submit">Open</button>
        </form>`,
        body: `<div class="notice">${icon('shield')}<div>You can edit marks only for <strong>${esc(classLabel(selected))} — ${esc(selected.subject_name)}</strong>. Other subjects are restricted to their allocated teachers and the Director of Studies.</div></div>
        <form method="post" action="/teacher/marks" style="margin-top:16px">
          <input type="hidden" name="allocation_id" value="${selected.id}">
          ${table(['Student', 'Score / 100', 'Grade'], rows, { empty: 'No students in this class.' })}
          <div class="form-actions">
            <button class="btn" type="submit">${icon('check')} Save marks</button>
            <span class="hint">Class average: <strong>${stats.avg ? `${Number(stats.avg).toFixed(1)}%` : '—'}</strong> · leave blank to remove a score.</span>
          </div>
        </form>`,
      })}`,
      { active: '/teacher/marks' }
    )
  );
}

function saveMarks(ctx) {
  const allocation = allocationById(ctx.fields.allocation_id);
  if (!allocation || allocation.teacher_id !== ctx.user.id) {
    return redirect('/teacher/marks?err=You+are+not+allocated+to+that+class+and+subject');
  }
  const allowed = new Set(
    ctx.db
      .prepare('SELECT id FROM students WHERE class_id = ?')
      .all(allocation.class_id)
      .map((row) => row.id)
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
      return redirect(
        `/teacher/marks?allocation=${allocation.id}&err=${encodeURIComponent('Scores must be between 0 and 100. Nothing was saved.')}`
      );
    }
    updates.push({ studentId, score });
  }
  for (const update of updates) {
    if (update.remove) {
      ctx.db
        .prepare('DELETE FROM marks WHERE student_id = ? AND subject_id = ? AND term = ? AND exam_name = ?')
        .run(update.studentId, allocation.subject_id, config.term, config.examName);
    } else {
      upsertMark(update.studentId, allocation.subject_id, update.score, ctx.user.id);
    }
  }
  return redirect(
    `/teacher/marks?allocation=${allocation.id}&ok=${encodeURIComponent('Marks saved. Report cards update immediately.')}`
  );
}

function complaintsPage(ctx) {
  const home = homeroomFor(ctx.user.id);
  if (!home) {
    return html(
      layout(
        ctx,
        'Parent complaints',
        panel({
          title: 'No homeroom assigned',
          body: `<div class="notice gold">${icon('alert')}<div>Parent complaints are routed to the class teacher of the student's class. You are not currently a class teacher.</div></div>`,
        }),
        { active: '/teacher/complaints' }
      )
    );
  }
  const complaints = complaintsForTeacher(home.id);
  const open = complaints.filter((c) => c.status === 'open');
  return html(
    layout(
      ctx,
      'Parent complaints',
      `<div class="stats">
        ${statCard({ label: 'Open', value: open.length, meta: `For ${classLabel(home)}`, iconName: 'alert', tone: open.length ? 'warn' : 'good' })}
        ${statCard({ label: 'Resolved', value: complaints.length - open.length, meta: 'Closed by you', iconName: 'check', tone: 'good' })}
        ${statCard({ label: 'Class', value: home.students, meta: `${classLabel(home)} learners`, iconName: 'users' })}
      </div>
      ${panel({
        title: 'Complaints from parents',
        subtitle: 'Only complaints submitted by parents of students in your class appear here.',
        body: complaints.length
          ? complaints
              .map((complaint) =>
                complaintCard(complaint, {
                  showStudent: true,
                  action:
                    complaint.status === 'open'
                      ? resolveForm(`/teacher/complaints/${complaint.id}/resolve`)
                      : '',
                })
              )
              .join('')
          : emptyState('No parent complaints for your class.'),
      })}`,
      { active: '/teacher/complaints' }
    )
  );
}

function resolve(ctx) {
  const home = homeroomFor(ctx.user.id);
  const complaint = ctx.db
    .prepare("SELECT id, class_id, sender_role FROM complaints WHERE id = ?")
    .get(Number(ctx.params.id));
  if (!home || !complaint || complaint.class_id !== home.id || complaint.sender_role !== 'parent') {
    return redirect('/teacher/complaints?err=This+complaint+is+not+assigned+to+your+class');
  }
  const resolution = String(ctx.fields.resolution || '').trim();
  if (!resolution) return redirect('/teacher/complaints?err=Add+a+resolution+note');
  resolveComplaint(complaint.id, ctx.user.id, resolution);
  return redirect('/teacher/complaints?ok=Complaint+resolved');
}

function revisionPage(ctx) {
  const home = homeroomFor(ctx.user.id);
  const materials = revisionList();
  const actionFor = (material) =>
    material.uploaded_by === ctx.user.id
      ? `<form method="post" action="/teacher/revision/${material.id}/delete"><button class="btn small danger" type="submit">Delete</button></form>`
      : '';
  return html(
    layout(
      ctx,
      'Revision materials',
      `<div class="split">
        ${
          home
            ? panel({
                title: 'Upload revision material',
                subtitle: `Published to ${classLabel(home)} — visible to your learners, their parents and teachers.`,
                body: revisionUploadForm({
                  action: '/teacher/revision',
                  subjects: listSubjects(),
                  fixedClass: home,
                }),
              })
            : panel({
                title: 'Upload revision material',
                body: `<div class="notice gold">${icon('alert')}<div>Revision uploads are available to class teachers. You are not currently a class teacher.</div></div>`,
              })
        }
        ${panel({
          title: 'Revision library',
          subtitle: `${materials.length} materials from the Director of Studies and class teachers`,
          body: revisionCards(materials, { actionFor }),
        })}
      </div>`,
      { active: '/teacher/revision' }
    )
  );
}

function uploadRevision(ctx) {
  const home = homeroomFor(ctx.user.id);
  if (!home) return redirect('/teacher/revision?err=Only+class+teachers+can+upload+revision+materials');
  ctx.fields.class_id = String(home.id);
  const result = saveRevisionUpload(ctx);
  return redirect(`/teacher/revision?${result.ok ? 'ok' : 'err'}=${encodeURIComponent(result.message)}`);
}

function removeRevision(ctx) {
  const material = ctx.db
    .prepare('SELECT id, stored_name, uploaded_by FROM revision_materials WHERE id = ?')
    .get(Number(ctx.params.id));
  if (!material || material.uploaded_by !== ctx.user.id) {
    return redirect('/teacher/revision?err=You+can+only+delete+your+own+uploads');
  }
  if (material.stored_name) {
    const target = path.resolve(config.uploadDir, material.stored_name);
    if (target.startsWith(config.uploadDir + path.sep) && fs.existsSync(target)) fs.unlinkSync(target);
  }
  deleteRevision(material.id);
  return redirect('/teacher/revision?ok=Revision+material+deleted');
}

function studentsPage(ctx) {
  const home = homeroomFor(ctx.user.id);
  if (!home) {
    return html(
      layout(
        ctx,
        'My class',
        panel({
          title: 'No homeroom assigned',
          body: `<div class="notice gold">${icon('alert')}<div>The Director of Studies allocates class teachers. Once allocated, your class list will appear here.</div></div>`,
        }),
        { active: '/teacher/students' }
      )
    );
  }
  const students = listStudents({ classId: home.id });
  const rows = students.map((student) => [
    `<div class="table-avatar">${avatar(student.name)}<div><span class="table-name">${esc(student.name)}</span><span class="table-sub">${esc(student.admission_no)} · ${esc(student.gender || '—')}</span></div></div>`,
    student.average !== null ? `<span class="mono">${Number(student.average).toFixed(1)}%</span>` : '—',
    student.average !== null ? badge(gradeFor(student.average), gradeTone(student.average)) : badge('No marks', 'neutral'),
    `<a class="btn small ghost" href="/reports/${student.id}">Report</a>`,
  ]);
  return html(
    layout(
      ctx,
      `My class — ${classLabel(home)}`,
      `${panel({
        title: 'Class list',
        subtitle: `${students.length} learners · ${config.examName}`,
        body: table(['Student', 'Average', 'Grade', ''], rows, { empty: 'No students in your class.' }),
        flush: true,
      })}`,
      { active: '/teacher/students' }
    )
  );
}

function timetablePage(ctx) {
  const lessons = teacherTimetable(ctx.user.id);
  const rows = lessons.map((lesson) => [
    `<span class="table-name">${esc(lesson.day)}</span>`,
    `${esc(fmtTime(lesson.start_time))} – ${esc(fmtTime(lesson.end_time))}`,
    esc(lesson.subject_name),
    `${esc(lesson.class_name)} ${esc(lesson.class_stream || '')}`,
    esc(lesson.room || '—'),
  ]);
  return html(
    layout(
      ctx,
      'My timetable',
      `${panel({
        title: 'Weekly teaching load',
        subtitle: `${lessons.length} lessons per week`,
        body: table(['Day', 'Time', 'Subject', 'Class', 'Room'], rows, { empty: 'No lessons allocated to you yet.' }),
        flush: true,
      })}`,
      { active: '/teacher/timetable' }
    )
  );
}

export function register(r) {
  r.get('/teacher', ['teacher'], dashboard);
  r.get('/teacher/marks', ['teacher'], marksPage);
  r.post('/teacher/marks', ['teacher'], saveMarks);
  r.get('/teacher/complaints', ['teacher'], complaintsPage);
  r.post('/teacher/complaints/:id/resolve', ['teacher'], resolve);
  r.get('/teacher/revision', ['teacher'], revisionPage);
  r.post('/teacher/revision', ['teacher'], uploadRevision);
  r.post('/teacher/revision/:id/delete', ['teacher'], removeRevision);
  r.get('/teacher/students', ['teacher'], studentsPage);
  r.get('/teacher/timetable', ['teacher'], timetablePage);
}
