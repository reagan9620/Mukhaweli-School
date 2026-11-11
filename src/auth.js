import crypto from 'node:crypto';
import { config } from './config.js';

export const roleHome = {
  admin: '/admin',
  principal: '/principal',
  deputy_boarding: '/boarding',
  deputy_academics: '/academics',
  dos: '/dos',
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
  worker: '/worker',
  bom: '/bom',
};

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.sessionTtlMs).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    Number(userId),
    expires
  );
  return token;
}

export function getSessionUser(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.position, u.must_change_password, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND u.active = 1`
    )
    .get(token);
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    position: row.position,
    must_change_password: Number(row.must_change_password || 0),
  };
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function destroyUserSessions(db, userId, exceptToken = null) {
  if (exceptToken) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(Number(userId), exceptToken);
    return;
  }
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(userId));
}

export function findUserForLogin(db, identifier) {
  return (
    db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.password_hash, u.must_change_password
         FROM users u
         LEFT JOIN students s ON s.user_id = u.id
         WHERE u.active = 1
           AND (lower(u.email) = lower(?) OR lower(s.admission_no) = lower(?))
         LIMIT 1`
      )
      .get(identifier, identifier) || null
  );
}

export function loginBlocked(db, identifier, ip) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM login_attempts
       WHERE identifier = ? AND ip = ? AND attempted_at >= datetime('now', '-15 minutes')`
    )
    .get(String(identifier || '').toLowerCase(), String(ip || ''));
  return Number(row.n) >= 5;
}

export function recordLoginFailure(db, identifier, ip) {
  db.prepare('INSERT INTO login_attempts (identifier, ip) VALUES (?, ?)').run(
    String(identifier || '').toLowerCase(),
    String(ip || '')
  );
}

export function clearLoginFailures(db, identifier, ip) {
  db.prepare('DELETE FROM login_attempts WHERE identifier = ? AND ip = ?').run(
    String(identifier || '').toLowerCase(),
    String(ip || '')
  );
}

export function pruneAuthTables(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  db.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
}
