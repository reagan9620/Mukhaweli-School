import { config } from './config.js';
import { getDb } from './db.js';
import { createStudentAccount } from './accounts.js';

export function classLabel(row) {
  if (!row) return 'Unassigned';
  return [row.class_name ?? row.name, row.class_stream ?? row.stream].filter(Boolean).join(' ');
}

export function listClasses() {
  return getDb()
    .prepare(
      `SELECT c.id, c.name, c.stream, c.class_teacher_id, u.name AS teacher_name
       FROM classes c LEFT JOIN users u ON u.id = c.class_teacher_id
       ORDER BY c.name, c.stream`
    )
    .all();
}

export function getClass(id) {
  return (
    getDb()
      .prepare(
        `SELECT c.id, c.name, c.stream, c.class_teacher_id, u.name AS teacher_name
         FROM classes c LEFT JOIN users u ON u.id = c.class_teacher_id WHERE c.id = ?`
      )
      .get(Number(id)) || null
  );
}

export function listSubjects() {
  return getDb().prepare('SELECT id, code, name FROM subjects ORDER BY name').all();
}

export function listTeachers() {
  return getDb()
    .prepare(
      `SELECT id, name, email, phone, position FROM users
       WHERE role = 'teacher' AND active = 1 ORDER BY name`
    )
    .all();
}

export function listWorkers() {
  return getDb()
    .prepare(
      `SELECT id, name, email, phone, position FROM users
       WHERE role = 'worker' AND active = 1 ORDER BY name`
    )
    .all();
}

export function listStaff() {
  return getDb()
    .prepare(
      `SELECT id, name, email, phone, role, position, created_at FROM users
       WHERE role IN ('teacher', 'worker', 'bom') AND active = 1
       ORDER BY CASE role WHEN 'teacher' THEN 1 WHEN 'worker' THEN 2 ELSE 3 END, name`
    )
    .all();
}

export function listParents() {
  return getDb()
    .prepare(
      `SELECT u.id, u.name, u.email, GROUP_CONCAT(su.name, ', ') AS children
       FROM users u
       LEFT JOIN parent_students ps ON ps.parent_id = u.id
       LEFT JOIN students st ON st.id = ps.student_id
       LEFT JOIN users su ON su.id = st.user_id
       WHERE u.role = 'parent' AND u.active = 1
       GROUP BY u.id ORDER BY u.name`
    )
    .all();
}

export function markTotals(term = config.term, exam = config.examName) {
  const rows = getDb()
    .prepare(
      `SELECT student_id, SUM(score) AS total, AVG(score) AS avg, COUNT(*) AS subjects
       FROM marks WHERE term = ? AND exam_name = ? AND score IS NOT NULL
       GROUP BY student_id`
    )
    .all(term, exam);
  return new Map(rows.map((row) => [row.student_id, row]));
}

export function listStudents({ search = '', classId = null } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (search) {
    where.push('(lower(u.name) LIKE ? OR lower(st.admission_no) LIKE ?)');
    const q = `%${String(search).toLowerCase()}%`;
    params.push(q, q);
  }
  if (classId) {
    where.push('st.class_id = ?');
    params.push(Number(classId));
  }
  const rows = db
    .prepare(
      `SELECT st.id, st.admission_no, st.gender, st.class_id, st.user_id, u.name, u.email,
              c.name AS class_name, c.stream AS class_stream,
              COALESCE(fa.balance, 0) AS balance
       FROM students st
       JOIN users u ON u.id = st.user_id
       LEFT JOIN classes c ON c.id = st.class_id
       LEFT JOIN fee_accounts fa ON fa.student_id = st.id AND fa.term = ?
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY c.name, c.stream, u.name`
    )
    .all(config.term, ...params);
  const totals = markTotals();
  return rows.map((row) => {
    const total = totals.get(row.id);
    return { ...row, average: total ? total.avg : null, total: total ? total.total : null };
  });
}

export function getStudent(id) {
  return (
    getDb()
      .prepare(
        `SELECT st.id, st.user_id, st.admission_no, st.gender, st.class_id, st.joined_on,
                u.name, u.email, c.name AS class_name, c.stream AS class_stream,
                c.class_teacher_id, t.name AS class_teacher_name
         FROM students st
         JOIN users u ON u.id = st.user_id
         LEFT JOIN classes c ON c.id = st.class_id
         LEFT JOIN users t ON t.id = c.class_teacher_id
         WHERE st.id = ?`
      )
      .get(Number(id)) || null
  );
}

export function getStudentByUserId(userId) {
  return (
    getDb()
      .prepare('SELECT id, user_id, admission_no, class_id FROM students WHERE user_id = ?')
      .get(Number(userId)) || null
  );
}

export function childrenOf(parentId) {
  const totals = markTotals();
  return getDb()
    .prepare(
      `SELECT st.id, st.admission_no, st.gender, st.class_id, u.name,
              c.name AS class_name, c.stream AS class_stream,
              COALESCE(fa.balance, 0) AS balance
       FROM parent_students ps
       JOIN students st ON st.id = ps.student_id
       JOIN users u ON u.id = st.user_id
       LEFT JOIN classes c ON c.id = st.class_id
       LEFT JOIN fee_accounts fa ON fa.student_id = st.id AND fa.term = ?
       WHERE ps.parent_id = ?
       ORDER BY u.name`
    )
    .all(config.term, Number(parentId))
    .map((row) => ({ ...row, average: totals.get(row.id)?.avg ?? null }));
}

export function parentsOfStudent(studentId) {
  return getDb()
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, ps.relationship
       FROM parent_students ps JOIN users u ON u.id = ps.parent_id
       WHERE ps.student_id = ?`
    )
    .all(Number(studentId));
}

export function marksForStudent(studentId, term = config.term, exam = config.examName) {
  return getDb()
    .prepare(
      `SELECT m.score, m.out_of, s.name AS subject_name, s.code, s.id AS subject_id
       FROM marks m JOIN subjects s ON s.id = m.subject_id
       WHERE m.student_id = ? AND m.term = ? AND m.exam_name = ?
       ORDER BY s.name`
    )
    .all(Number(studentId), term, exam);
}

export function classRanking(classId, term = config.term, exam = config.examName) {
  const rows = getDb()
    .prepare(
      `SELECT m.student_id, u.name, AVG(m.score) AS avg, SUM(m.score) AS total, COUNT(*) AS subjects
       FROM marks m
       JOIN students st ON st.id = m.student_id
       JOIN users u ON u.id = st.user_id
       WHERE st.class_id = ? AND m.term = ? AND m.exam_name = ? AND m.score IS NOT NULL
       GROUP BY m.student_id
       ORDER BY avg DESC, u.name`
    )
    .all(Number(classId), term, exam);
  let lastAvg = null;
  let position = 0;
  return rows.map((row, index) => {
    if (lastAvg === null || row.avg !== lastAvg) {
      position = index + 1;
      lastAvg = row.avg;
    }
    return { ...row, position };
  });
}

export function studentReport(studentId) {
  const student = getStudent(studentId);
  if (!student) return null;
  const marks = marksForStudent(studentId);
  const total = marks.reduce((sum, m) => sum + Number(m.score || 0), 0);
  const average = marks.length ? total / marks.length : null;
  const ranking = student.class_id ? classRanking(student.class_id) : [];
  const entry = ranking.find((row) => row.student_id === student.id);
  return {
    student,
    marks,
    total,
    average,
    position: entry ? entry.position : null,
    classSize: ranking.length,
    balance: feeBalance(studentId),
    parents: parentsOfStudent(studentId),
  };
}

export function classSubjectAverages(classId, term = config.term, exam = config.examName) {
  return getDb()
    .prepare(
      `SELECT sub.name AS subject_name, AVG(m.score) AS avg, COUNT(*) AS entries
       FROM marks m
       JOIN students st ON st.id = m.student_id
       JOIN subjects sub ON sub.id = m.subject_id
       WHERE st.class_id = ? AND m.term = ? AND m.exam_name = ? AND m.score IS NOT NULL
       GROUP BY sub.id ORDER BY sub.name`
    )
    .all(Number(classId), term, exam);
}

export function classesWithPerformance() {
  return getDb()
    .prepare(
      `SELECT c.id, c.name, c.stream, COUNT(DISTINCT st.id) AS students,
              AVG(m.score) AS avg
       FROM classes c
       LEFT JOIN students st ON st.class_id = c.id
       LEFT JOIN marks m ON m.student_id = st.id AND m.term = ? AND m.exam_name = ?
       GROUP BY c.id ORDER BY c.name, c.stream`
    )
    .all(config.term, config.examName);
}

export function feeBalance(studentId, term = config.term) {
  const row = getDb()
    .prepare('SELECT balance FROM fee_accounts WHERE student_id = ? AND term = ?')
    .get(Number(studentId), term);
  return row ? Number(row.balance) : 0;
}

export function feeAccount(studentId, term = config.term) {
  return (
    getDb()
      .prepare(
        `SELECT fa.balance, fa.updated_at, u.name AS updated_by
         FROM fee_accounts fa LEFT JOIN users u ON u.id = fa.updated_by
         WHERE fa.student_id = ? AND fa.term = ?`
      )
      .get(Number(studentId), term) || null
  );
}

export function paymentsForStudent(studentId) {
  return getDb()
    .prepare(
      `SELECT amount, method, reference, receipt_no, paid_on
       FROM payments WHERE student_id = ? ORDER BY paid_on DESC`
    )
    .all(Number(studentId));
}

export function feeOverview({ search = '', classId = null } = {}) {
  const students = listStudents({ search, classId });
  return {
    students,
    totalBalance: students.reduce((sum, s) => sum + Number(s.balance || 0), 0),
    withBalance: students.filter((s) => Number(s.balance) > 0).length,
  };
}

export function updateFeeBalance(studentId, balance, userId) {
  getDb()
    .prepare(
      `INSERT INTO fee_accounts (student_id, term, balance, updated_by, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(student_id, term)
       DO UPDATE SET balance = excluded.balance, updated_by = excluded.updated_by, updated_at = datetime('now')`
    )
    .run(Number(studentId), config.term, Number(balance), Number(userId));
}

export function hostels() {
  return getDb()
    .prepare(
      `SELECT h.id, h.name, h.gender, h.capacity, h.manager_id, u.name AS manager_name, u.position AS manager_position
       FROM hostels h LEFT JOIN users u ON u.id = h.manager_id ORDER BY h.name`
    )
    .all();
}

export function setHostelManager(hostelId, workerId) {
  getDb().prepare('UPDATE hostels SET manager_id = ? WHERE id = ?').run(
    workerId ? Number(workerId) : null,
    Number(hostelId)
  );
}

export function attendanceForDate(date) {
  return getDb()
    .prepare(
      `SELECT u.id, u.name, u.position, a.sign_in, a.sign_out
       FROM users u
       LEFT JOIN staff_attendance a ON a.user_id = u.id AND a.work_date = ?
       WHERE u.role = 'worker' AND u.active = 1
       ORDER BY u.name`
    )
    .all(date);
}

export function attendanceStats(date) {
  const rows = attendanceForDate(date);
  return {
    total: rows.length,
    onDuty: rows.filter((r) => r.sign_in && !r.sign_out).length,
    signedOut: rows.filter((r) => r.sign_in && r.sign_out).length,
    absent: rows.filter((r) => !r.sign_in).length,
  };
}

export function workerRecord(userId, date) {
  return (
    getDb()
      .prepare('SELECT sign_in, sign_out FROM staff_attendance WHERE user_id = ? AND work_date = ?')
      .get(Number(userId), date) || null
  );
}

export function workerHistory(userId, limit = 7) {
  return getDb()
    .prepare(
      `SELECT work_date, sign_in, sign_out FROM staff_attendance
       WHERE user_id = ? ORDER BY work_date DESC LIMIT ?`
    )
    .all(Number(userId), Number(limit));
}

export function workerSignIn(userId, date, time) {
  const db = getDb();
  const existing = workerRecord(userId, date);
  if (existing && existing.sign_in) return { ok: false, message: 'You are already signed in today.' };
  db.prepare(
    `INSERT INTO staff_attendance (user_id, work_date, sign_in) VALUES (?, ?, ?)
     ON CONFLICT(user_id, work_date) DO UPDATE SET sign_in = excluded.sign_in`
  ).run(Number(userId), date, time);
  return { ok: true, message: `Signed in at ${time}.` };
}

export function workerSignOut(userId, date, time) {
  const db = getDb();
  const existing = workerRecord(userId, date);
  if (!existing || !existing.sign_in) return { ok: false, message: 'Sign in before signing out.' };
  if (existing.sign_out) return { ok: false, message: 'You have already signed out today.' };
  db.prepare(
    'UPDATE staff_attendance SET sign_out = ? WHERE user_id = ? AND work_date = ?'
  ).run(time, Number(userId), date);
  return { ok: true, message: `Signed out at ${time}.` };
}

export function teachingTimetable(classId) {
  return getDb()
    .prepare(
      `SELECT tt.id, tt.day, tt.start_time, tt.end_time, tt.room, tt.subject_id, tt.teacher_id,
              sub.name AS subject_name, u.name AS teacher_name
       FROM teaching_timetable tt
       JOIN subjects sub ON sub.id = tt.subject_id
       LEFT JOIN users u ON u.id = tt.teacher_id
       WHERE tt.class_id = ?
       ORDER BY CASE tt.day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, tt.start_time`
    )
    .all(Number(classId));
}

export function teacherTimetable(teacherId) {
  return getDb()
    .prepare(
      `SELECT tt.id, tt.day, tt.start_time, tt.end_time, tt.room,
              sub.name AS subject_name, c.name AS class_name, c.stream AS class_stream
       FROM teaching_timetable tt
       JOIN subjects sub ON sub.id = tt.subject_id
       JOIN classes c ON c.id = tt.class_id
       WHERE tt.teacher_id = ?
       ORDER BY CASE tt.day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, tt.start_time`
    )
    .all(Number(teacherId));
}

export function examTimetable(classId = null) {
  const db = getDb();
  const sql = `SELECT et.id, et.exam_date, et.start_time, et.end_time, et.venue,
                      sub.name AS subject_name, c.name AS class_name, c.stream AS class_stream
               FROM exam_timetable et
               JOIN subjects sub ON sub.id = et.subject_id
               JOIN classes c ON c.id = et.class_id
               ${classId ? 'WHERE et.class_id = ?' : ''}
               ORDER BY et.exam_date, et.start_time, c.name, c.stream`;
  return classId ? db.prepare(sql).all(Number(classId)) : db.prepare(sql).all();
}

export function allocationsFor(teacherId) {
  return getDb()
    .prepare(
      `SELECT ta.id, ta.class_id, ta.subject_id, sub.name AS subject_name,
              c.name AS class_name, c.stream AS class_stream
       FROM teacher_allocations ta
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN classes c ON c.id = ta.class_id
       WHERE ta.teacher_id = ? ORDER BY c.name, c.stream, sub.name`
    )
    .all(Number(teacherId));
}

export function allAllocations() {
  return getDb()
    .prepare(
      `SELECT ta.id, ta.teacher_id, ta.class_id, ta.subject_id,
              u.name AS teacher_name, sub.name AS subject_name,
              c.name AS class_name, c.stream AS class_stream
       FROM teacher_allocations ta
       JOIN users u ON u.id = ta.teacher_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN classes c ON c.id = ta.class_id
       ORDER BY c.name, c.stream, sub.name`
    )
    .all();
}

export function homeroomFor(teacherId) {
  return (
    getDb()
      .prepare(
        `SELECT c.id, c.name, c.stream,
                (SELECT COUNT(*) FROM students st WHERE st.class_id = c.id) AS students
         FROM classes c WHERE c.class_teacher_id = ?`
      )
      .get(Number(teacherId)) || null
  );
}

export function setClassTeacher(classId, teacherId) {
  getDb()
    .prepare('UPDATE classes SET class_teacher_id = ? WHERE id = ?')
    .run(teacherId ? Number(teacherId) : null, Number(classId));
}

export function addAllocation(classId, subjectId, teacherId) {
  getDb()
    .prepare(
      `INSERT INTO teacher_allocations (teacher_id, class_id, subject_id) VALUES (?, ?, ?)
       ON CONFLICT(class_id, subject_id)
       DO UPDATE SET teacher_id = excluded.teacher_id`
    )
    .run(Number(teacherId), Number(classId), Number(subjectId));
}

export function removeAllocation(id) {
  getDb().prepare('DELETE FROM teacher_allocations WHERE id = ?').run(Number(id));
}

export function allocationById(id) {
  return (
    getDb()
      .prepare(
        `SELECT ta.id, ta.teacher_id, ta.class_id, ta.subject_id,
                sub.name AS subject_name, c.name AS class_name, c.stream AS class_stream
         FROM teacher_allocations ta
         JOIN subjects sub ON sub.id = ta.subject_id
         JOIN classes c ON c.id = ta.class_id
         WHERE ta.id = ?`
      )
      .get(Number(id)) || null
  );
}

export function gradebookStudents(classId, subjectId, term = config.term, exam = config.examName) {
  return getDb()
    .prepare(
      `SELECT st.id, st.admission_no, u.name, m.score, m.id AS mark_id
       FROM students st
       JOIN users u ON u.id = st.user_id
       LEFT JOIN marks m ON m.student_id = st.id AND m.subject_id = ? AND m.term = ? AND m.exam_name = ?
       WHERE st.class_id = ?
       ORDER BY u.name`
    )
    .all(Number(subjectId), term, exam, Number(classId));
}

export function upsertMark(studentId, subjectId, score, userId, term = config.term, exam = config.examName) {
  getDb()
    .prepare(
      `INSERT INTO marks (student_id, subject_id, term, exam_name, score, out_of, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, 100, ?, datetime('now'))
       ON CONFLICT(student_id, subject_id, term, exam_name)
       DO UPDATE SET score = excluded.score, updated_by = excluded.updated_by, updated_at = datetime('now')`
    )
    .run(Number(studentId), Number(subjectId), term, exam, Number(score), Number(userId));
}

export function subjectMarkStats(classId, subjectId, term = config.term, exam = config.examName) {
  const row = getDb()
    .prepare(
      `SELECT AVG(m.score) AS avg, COUNT(m.score) AS entries
       FROM marks m JOIN students st ON st.id = m.student_id
       WHERE st.class_id = ? AND m.subject_id = ? AND m.term = ? AND m.exam_name = ?`
    )
    .get(Number(classId), Number(subjectId), term, exam);
  return { avg: row?.avg ?? null, entries: row?.entries ?? 0 };
}

export function complaintsForDos(status = 'all') {
  const db = getDb();
  const where = status === 'open' || status === 'resolved' ? 'WHERE comp.status = ?' : '';
  const sql = `SELECT comp.*, su.name AS sender_name, stu.name AS student_name,
                      cl.name AS class_name, cl.stream AS class_stream,
                      ru.name AS resolver_name
               FROM complaints comp
               JOIN users su ON su.id = comp.sender_id
               LEFT JOIN students st ON st.id = comp.about_student_id
               LEFT JOIN users stu ON stu.id = st.user_id
               LEFT JOIN classes cl ON cl.id = comp.class_id
               LEFT JOIN users ru ON ru.id = comp.resolved_by
               ${where}
               ORDER BY CASE comp.status WHEN 'open' THEN 0 ELSE 1 END, comp.created_at DESC`;
  return where ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

export function complaintsForTeacher(classId) {
  if (!classId) return [];
  return getDb()
    .prepare(
      `SELECT comp.*, su.name AS sender_name, stu.name AS student_name, ru.name AS resolver_name
       FROM complaints comp
       JOIN users su ON su.id = comp.sender_id
       LEFT JOIN students st ON st.id = comp.about_student_id
       LEFT JOIN users stu ON stu.id = st.user_id
       LEFT JOIN users ru ON ru.id = comp.resolved_by
       WHERE comp.sender_role = 'parent' AND comp.class_id = ?
       ORDER BY CASE comp.status WHEN 'open' THEN 0 ELSE 1 END, comp.created_at DESC`
    )
    .all(Number(classId));
}

export function complaintsByUser(userId) {
  return getDb()
    .prepare(
      `SELECT comp.*, stu.name AS student_name, ru.name AS resolver_name
       FROM complaints comp
       LEFT JOIN students st ON st.id = comp.about_student_id
       LEFT JOIN users stu ON stu.id = st.user_id
       LEFT JOIN users ru ON ru.id = comp.resolved_by
       WHERE comp.sender_id = ?
       ORDER BY comp.created_at DESC`
    )
    .all(Number(userId));
}

export function complaintById(id) {
  return (
    getDb()
      .prepare(
        `SELECT comp.*, su.name AS sender_name, su.role AS sender_role_name,
                stu.name AS student_name, cl.name AS class_name, cl.stream AS class_stream
         FROM complaints comp
         JOIN users su ON su.id = comp.sender_id
         LEFT JOIN students st ON st.id = comp.about_student_id
         LEFT JOIN users stu ON stu.id = st.user_id
         LEFT JOIN classes cl ON cl.id = comp.class_id
         WHERE comp.id = ?`
      )
      .get(Number(id)) || null
  );
}

export function createComplaint({ senderId, senderRole, studentId, classId, category, subject, body }) {
  const result = getDb()
    .prepare(
      `INSERT INTO complaints (sender_id, sender_role, about_student_id, class_id, category, subject, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(senderId),
      senderRole,
      studentId ? Number(studentId) : null,
      classId ? Number(classId) : null,
      category,
      subject,
      body
    );
  return Number(result.lastInsertRowid);
}

export function resolveComplaint(id, userId, resolution) {
  getDb()
    .prepare(
      `UPDATE complaints SET status = 'resolved', resolution = ?, resolved_by = ?, resolved_at = datetime('now')
       WHERE id = ?`
    )
    .run(resolution, Number(userId), Number(id));
}

export function complaintsCounts() {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open
       FROM complaints`
    )
    .get();
  return { total: Number(row.total), open: Number(row.open || 0) };
}

export function revisionList() {
  return getDb()
    .prepare(
      `SELECT r.*, sub.name AS subject_name, cl.name AS class_name, cl.stream AS class_stream,
              u.name AS uploader_name, u.role AS uploader_role
       FROM revision_materials r
       LEFT JOIN subjects sub ON sub.id = r.subject_id
       LEFT JOIN classes cl ON cl.id = r.class_id
       JOIN users u ON u.id = r.uploaded_by
       ORDER BY r.created_at DESC`
    )
    .all();
}

export function revisionById(id) {
  return (
    getDb()
      .prepare(
        `SELECT r.*, sub.name AS subject_name, cl.name AS class_name, cl.stream AS class_stream,
                u.name AS uploader_name, u.role AS uploader_role
         FROM revision_materials r
         LEFT JOIN subjects sub ON sub.id = r.subject_id
         LEFT JOIN classes cl ON cl.id = r.class_id
         JOIN users u ON u.id = r.uploaded_by
         WHERE r.id = ?`
      )
      .get(Number(id)) || null
  );
}

export function addRevision({
  title,
  subjectId,
  classId,
  kind,
  url,
  notes,
  fileName,
  storedName,
  uploadedBy,
}) {
  const result = getDb()
    .prepare(
      `INSERT INTO revision_materials
       (title, subject_id, class_id, kind, url, notes, file_name, stored_name, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      title,
      subjectId ? Number(subjectId) : null,
      classId ? Number(classId) : null,
      kind,
      url || null,
      notes || null,
      fileName || null,
      storedName || null,
      Number(uploadedBy)
    );
  return Number(result.lastInsertRowid);
}

export function deleteRevision(id) {
  getDb().prepare('DELETE FROM revision_materials WHERE id = ?').run(Number(id));
}

export function messagesForParent(parentId) {
  return getDb()
    .prepare(
      `SELECT pm.*, u.name AS sender_name, u.position AS sender_position
       FROM parent_messages pm JOIN users u ON u.id = pm.sender_id
       WHERE pm.parent_id = ? ORDER BY pm.created_at DESC`
    )
    .all(Number(parentId));
}

export function messagesSentBy(userId) {
  return getDb()
    .prepare(
      `SELECT pm.*, u.name AS parent_name FROM parent_messages pm
       JOIN users u ON u.id = pm.parent_id
       WHERE pm.sender_id = ? ORDER BY pm.created_at DESC LIMIT 10`
    )
    .all(Number(userId));
}

export function createMessage({ senderId, parentId, subject, body }) {
  getDb()
    .prepare('INSERT INTO parent_messages (sender_id, parent_id, subject, body) VALUES (?, ?, ?, ?)')
    .run(Number(senderId), Number(parentId), subject, body);
}

export function calendarSettings() {
  return (
    getDb().prepare('SELECT * FROM calendar WHERE id = 1').get() || {
      term: config.term,
      year: config.year,
      opening_date: null,
      closing_date: null,
      exam_start: null,
      exam_end: null,
    }
  );
}

export function updateCalendar({ term, year, opening, closing, examStart, examEnd, userId }) {
  getDb()
    .prepare(
      `UPDATE calendar SET term = ?, year = ?, opening_date = ?, closing_date = ?,
              exam_start = ?, exam_end = ?, updated_by = ?, updated_at = datetime('now') WHERE id = 1`
    )
    .run(term, Number(year), opening, closing, examStart, examEnd, Number(userId));
}

export function schoolCounts() {
  const db = getDb();
  const role = (r) => Number(db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ? AND active = 1').get(r).n);
  const openComplaints = Number(
    db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE status = 'open'").get().n
  );
  const arrears = Number(
    db.prepare('SELECT COALESCE(SUM(balance), 0) AS n FROM fee_accounts WHERE term = ?').get(config.term).n
  );
  return {
    students: Number(db.prepare('SELECT COUNT(*) AS n FROM students').get().n),
    teachers: role('teacher'),
    workers: role('worker'),
    bom: role('bom'),
    parents: role('parent'),
    classes: Number(db.prepare('SELECT COUNT(*) AS n FROM classes').get().n),
    openComplaints,
    arrears,
  };
}

export function dashboardStats() {
  const db = getDb();
  return {
    examEntries: Number(db.prepare('SELECT COUNT(*) AS n FROM exam_timetable').get().n),
    revision: Number(db.prepare('SELECT COUNT(*) AS n FROM revision_materials').get().n),
    allocations: Number(db.prepare('SELECT COUNT(*) AS n FROM teacher_allocations').get().n),
    lessons: Number(db.prepare('SELECT COUNT(*) AS n FROM teaching_timetable').get().n),
  };
}

export function todayLessons(classId) {
  if (!classId) return [];
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date());
  return teachingTimetable(classId).filter((lesson) => lesson.day === day);
}

export function canViewReport(user, student) {
  if (!user || !student) return false;
  if (['principal', 'deputy_academics', 'dos'].includes(user.role)) return true;
  if (user.role === 'teacher') return student.class_teacher_id === user.id;
  if (user.role === 'student') return student.user_id === user.id;
  if (user.role === 'parent') {
    return !!getDb()
      .prepare('SELECT 1 AS ok FROM parent_students WHERE parent_id = ? AND student_id = ?')
      .get(user.id, student.id);
  }
  return false;
}

export function canViewRevision(user) {
  return ['dos', 'teacher', 'student', 'parent', 'principal', 'deputy_academics'].includes(user?.role);
}

export function canViewExamTimetable(user) {
  return !!user && user.role !== 'worker';
}

export function canViewTeachingTimetable(user) {
  return ['dos', 'teacher', 'student', 'parent', 'principal', 'deputy_academics'].includes(user?.role);
}

export function teacherForSubjectAllocation(teacherId, classId, subjectId) {
  return (
    getDb()
      .prepare(
        'SELECT id FROM teacher_allocations WHERE teacher_id = ? AND class_id = ? AND subject_id = ?'
      )
      .get(Number(teacherId), Number(classId), Number(subjectId)) || null
  );
}

export function enrollStudent({
  name,
  email,
  phone,
  gender,
  admissionNo,
  classId,
  parentName,
  parentEmail,
  parentPhone,
  createdBy = null,
}) {
  const guardian = parentName?.trim() || parentEmail?.trim()
    ? {
        mode: 'new',
        name: parentName?.trim() || '',
        email: parentEmail?.trim() || '',
        phone: parentPhone?.trim() || '',
      }
    : { mode: 'none' };
  const result = createStudentAccount(getDb(), {
    name,
    email,
    phone,
    gender,
    admissionNo,
    classId,
    guardian,
    createdBy,
  });
  if (!result.ok) return result;
  return {
    ...result,
    studentEmail: result.email,
    parentCreated: !!result.parent?.created,
  };
}
