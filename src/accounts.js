import crypto from 'node:crypto';
import { config } from './config.js';
import { hashPassword } from './password.js';

export const CREATABLE_ROLES = [
  'principal',
  'deputy_boarding',
  'deputy_academics',
  'dos',
  'teacher',
  'worker',
  'bom',
  'parent',
  'student',
];

const DEFAULT_POSITIONS = {
  principal: 'Principal',
  deputy_boarding: 'Deputy Principal — Boarding',
  deputy_academics: 'Deputy Principal — Academics',
  dos: 'Director of Studies',
  teacher: 'Teacher',
  worker: 'Support Staff',
  bom: 'BOM Member',
  parent: 'Parent / Guardian',
  student: 'Student',
};

export function defaultPosition(role, position = '') {
  return String(position).trim() || DEFAULT_POSITIONS[role] || 'Staff';
}

function nameSlug(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[^A-Za-z\s'-]/g, ' ')
    .toLowerCase()
    .replace(/['’-]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('.');
}

function admissionSlug(admissionNo) {
  return String(admissionNo || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function allocateEmail(db, { name, role = 'teacher', admissionNo = '', preferred = '' } = {}) {
  if (String(preferred).trim()) {
    const mail = String(preferred).trim().toLowerCase();
    if (db.prepare('SELECT 1 AS ok FROM users WHERE lower(email) = ?').get(mail)) {
      return { ok: false, message: `The email ${mail} is already in use by another account.` };
    }
    return { ok: true, email: mail };
  }
  const isStudent = role === 'student';
  const domain = isStudent ? config.studentDomain : config.domain;
  const stem = isStudent ? admissionSlug(admissionNo) : nameSlug(name);
  const base = stem || (isStudent ? 'student' : 'user');
  let candidate = `${base}@${domain}`;
  let suffix = 2;
  while (db.prepare('SELECT 1 AS ok FROM users WHERE lower(email) = ?').get(candidate)) {
    candidate = `${base}${suffix}@${domain}`;
    suffix += 1;
  }
  return { ok: true, email: candidate };
}

export function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let body = '';
  for (let i = 0; i < 10; i += 1) body += alphabet[crypto.randomInt(alphabet.length)];
  return `Muk-${body}`;
}

export function nextAdmissionNo(db, prefix = 'MUK') {
  const rows = db.prepare('SELECT admission_no FROM students').all();
  let max = 0;
  for (const row of rows) {
    const match = /(\d+)\s*$/.exec(row.admission_no || '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}/${String(max + 1).padStart(3, '0')}`;
}

export function audit(db, actorId, action, { targetUserId = null, detail = '' } = {}) {
  db.prepare(
    'INSERT INTO audit_log (actor_id, action, target_user_id, detail) VALUES (?, ?, ?, ?)'
  ).run(actorId ? Number(actorId) : null, action, targetUserId ? Number(targetUserId) : null, detail || null);
}

function insertUser(db, { name, email, phone, role, position, passwordHash, mustChange = true, createdBy = null }) {
  return Number(
    db
      .prepare(
        `INSERT INTO users (name, email, phone, role, position, password_hash, must_change_password, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        email,
        phone || null,
        role,
        position,
        passwordHash,
        mustChange ? 1 : 0,
        createdBy ? Number(createdBy) : null
      ).lastInsertRowid
  );
}

function friendlyError(error) {
  const message = String(error?.message || error);
  if (message.includes('users.email')) return 'That email address is already allocated.';
  if (message.includes('students.admission_no')) return 'That admission number is already in use.';
  return 'The account could not be created. Check the details and try again.';
}

export function createUserAccount(
  db,
  { name, role, phone = '', position = '', email = '', password = '', createdBy = null }
) {
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleanName) return { ok: false, message: 'Enter the full name.' };
  if (!CREATABLE_ROLES.includes(role) || role === 'student' || role === 'admin') {
    return { ok: false, message: 'Choose a valid account type.' };
  }
  const mail = allocateEmail(db, { name: cleanName, role, preferred: email });
  if (!mail.ok) return mail;
  const plain = String(password || '').trim() || generateTempPassword();
  if (plain.length < 8) return { ok: false, message: 'The temporary password must be at least 8 characters.' };
  try {
    const id = insertUser(db, {
      name: cleanName,
      email: mail.email,
      phone,
      role,
      position: defaultPosition(role, position),
      passwordHash: hashPassword(plain),
      mustChange: true,
      createdBy,
    });
    return {
      ok: true,
      id,
      name: cleanName,
      role,
      email: mail.email,
      password: plain,
      position: defaultPosition(role, position),
    };
  } catch (error) {
    return { ok: false, message: friendlyError(error) };
  }
}

export function createStudentAccount(
  db,
  {
    name,
    admissionNo = '',
    classId,
    gender = '',
    phone = '',
    email = '',
    password = '',
    guardian = { mode: 'none' },
    createdBy = null,
  }
) {
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!cleanName) return { ok: false, message: 'Enter the student full name.' };
  if (!db.prepare('SELECT 1 AS ok FROM classes WHERE id = ?').get(Number(classId))) {
    return { ok: false, message: 'Choose a valid class.' };
  }
  const admission = String(admissionNo || '').trim().toUpperCase() || nextAdmissionNo(db);
  if (db.prepare('SELECT 1 AS ok FROM students WHERE lower(admission_no) = lower(?)').get(admission)) {
    return { ok: false, message: 'That admission number is already in use.' };
  }
  const mail = allocateEmail(db, { name: cleanName, role: 'student', admissionNo: admission, preferred: email });
  if (!mail.ok) return mail;
  const plain = String(password || '').trim() || generateTempPassword();
  if (plain.length < 8) return { ok: false, message: 'The temporary password must be at least 8 characters.' };

  let existingParent = null;
  let newParent = null;
  if (guardian?.mode === 'existing') {
    existingParent = db
      .prepare("SELECT id, name, email FROM users WHERE id = ? AND role = 'parent' AND active = 1")
      .get(Number(guardian.parentId));
    if (!existingParent) return { ok: false, message: 'Choose a valid parent account.' };
  }
  if (guardian?.mode === 'new') {
    const parentName = String(guardian.name || '').trim().replace(/\s+/g, ' ');
    if (!parentName) return { ok: false, message: 'Enter the parent or guardian name, or choose an existing parent.' };
    const preferred = String(guardian.email || '').trim();
    if (preferred) {
      const byEmail = db
        .prepare('SELECT id, name, email, role FROM users WHERE lower(email) = ?')
        .get(preferred.toLowerCase());
      if (byEmail && byEmail.role !== 'parent') {
        return { ok: false, message: 'That parent email belongs to a non-parent account.' };
      }
      if (byEmail) existingParent = byEmail;
    }
    if (!existingParent) {
      const parentMail = allocateEmail(db, { name: parentName, role: 'parent', preferred });
      if (!parentMail.ok) return parentMail;
      newParent = { name: parentName, email: parentMail.email, phone: String(guardian.phone || '').trim() };
    }
  }

  const hashed = hashPassword(plain);
  db.exec('BEGIN');
  try {
    const userId = insertUser(db, {
      name: cleanName,
      email: mail.email,
      phone,
      role: 'student',
      position: 'Student',
      passwordHash: hashed,
      mustChange: true,
      createdBy,
    });
    const studentId = Number(
      db
        .prepare(
          `INSERT INTO students (user_id, admission_no, class_id, gender, joined_on)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(userId, admission, Number(classId), gender || null, new Date().toISOString().slice(0, 10))
        .lastInsertRowid
    );

    let parent = existingParent
      ? { id: existingParent.id, name: existingParent.name, email: existingParent.email, created: false }
      : null;
    if (newParent) {
      const parentId = insertUser(db, {
        name: newParent.name,
        email: newParent.email,
        phone: newParent.phone,
        role: 'parent',
        position: 'Parent / Guardian',
        passwordHash: hashed,
        mustChange: true,
        createdBy,
      });
      parent = { id: parentId, name: newParent.name, email: newParent.email, created: true };
    }
    if (parent) {
      db.prepare(
        `INSERT OR IGNORE INTO parent_students (parent_id, student_id, relationship) VALUES (?, ?, 'Parent')`
      ).run(parent.id, studentId);
    }
    db.exec('COMMIT');
    return {
      ok: true,
      userId,
      studentId,
      name: cleanName,
      role: 'student',
      admission,
      email: mail.email,
      password: plain,
      parent,
      parentPassword: parent?.created ? plain : null,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    return { ok: false, message: friendlyError(error) };
  }
}

export function linkChildrenByAdmission(db, parentId, admissions) {
  const linked = [];
  const missing = [];
  const seen = new Set();
  String(admissions || '')
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((admission) => {
      if (seen.has(admission.toLowerCase())) return;
      seen.add(admission.toLowerCase());
      const student = db
        .prepare('SELECT id, admission_no FROM students WHERE lower(admission_no) = lower(?)')
        .get(admission);
      if (!student) {
        missing.push(admission);
        return;
      }
      db.prepare(
        `INSERT OR IGNORE INTO parent_students (parent_id, student_id, relationship) VALUES (?, ?, 'Parent')`
      ).run(Number(parentId), student.id);
      linked.push(student.admission_no);
    });
  return { linked, missing };
}

export function setTempPassword(db, userId, { password = '' } = {}) {
  const target = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(Number(userId));
  if (!target) return { ok: false, message: 'Account not found.' };
  if (target.role === 'admin') return { ok: false, message: 'The super-admin password can only be changed from the account page.' };
  const plain = String(password || '').trim() || generateTempPassword();
  if (plain.length < 8) return { ok: false, message: 'The temporary password must be at least 8 characters.' };
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(
    hashPassword(plain),
    target.id
  );
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
  return { ok: true, target, password: plain };
}

export function setAccountActive(db, userId, active) {
  const target = db.prepare('SELECT id, name, role, active FROM users WHERE id = ?').get(Number(userId));
  if (!target) return { ok: false, message: 'Account not found.' };
  if (target.role === 'admin') return { ok: false, message: 'The super-admin account cannot be deactivated here.' };
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, target.id);
  if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
  return { ok: true, target };
}
