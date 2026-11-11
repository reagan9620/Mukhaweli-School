import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { hashPassword } from './password.js';
import { seed } from './seed.js';
import { loadSettings } from './settings.js';

let db = null;

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL,
  position TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  stream TEXT NOT NULL,
  class_teacher_id INTEGER REFERENCES users(id),
  UNIQUE(name, stream)
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  admission_no TEXT NOT NULL UNIQUE,
  class_id INTEGER REFERENCES classes(id),
  gender TEXT,
  joined_on TEXT
);

CREATE TABLE IF NOT EXISTS parent_students (
  parent_id INTEGER NOT NULL REFERENCES users(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  relationship TEXT NOT NULL DEFAULT 'Parent',
  PRIMARY KEY (parent_id, student_id)
);

CREATE TABLE IF NOT EXISTS teacher_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  UNIQUE (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS hostels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  gender TEXT,
  capacity INTEGER NOT NULL DEFAULT 40,
  manager_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_date TEXT NOT NULL,
  sign_in TEXT,
  sign_out TEXT,
  UNIQUE (user_id, work_date)
);

CREATE TABLE IF NOT EXISTS marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  term TEXT NOT NULL,
  exam_name TEXT NOT NULL,
  score REAL,
  out_of REAL NOT NULL DEFAULT 100,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, subject_id, term, exam_name)
);

CREATE TABLE IF NOT EXISTS fee_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  term TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, term)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'M-Pesa',
  reference TEXT,
  receipt_no TEXT NOT NULL UNIQUE,
  paid_on TEXT NOT NULL,
  recorded_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS calendar (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  term TEXT NOT NULL,
  year INTEGER NOT NULL,
  opening_date TEXT,
  closing_date TEXT,
  exam_start TEXT,
  exam_end TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teaching_timetable (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id INTEGER REFERENCES users(id),
  day TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room TEXT,
  UNIQUE (class_id, day, start_time)
);

CREATE TABLE IF NOT EXISTS exam_timetable (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  exam_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  venue TEXT
);

CREATE TABLE IF NOT EXISTS revision_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject_id INTEGER REFERENCES subjects(id),
  class_id INTEGER REFERENCES classes(id),
  kind TEXT NOT NULL DEFAULT 'note',
  url TEXT,
  notes TEXT,
  file_name TEXT,
  stored_name TEXT,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  sender_role TEXT NOT NULL,
  about_student_id INTEGER REFERENCES students(id),
  class_id INTEGER REFERENCES classes(id),
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  parent_id INTEGER NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target_user_id INTEGER REFERENCES users(id),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'News',
  pinned INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  kind TEXT NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  handled_by INTEGER REFERENCES users(id),
  handled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_teaching_class ON teaching_timetable(class_id, day);
CREATE INDEX IF NOT EXISTS idx_exam_class ON exam_timetable(class_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_complaints_class ON complaints(class_id, sender_role);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(identifier, attempted_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_live ON announcements(published, pinned, created_at);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status, created_at);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
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

function availableEmail(database, candidate) {
  let email = candidate;
  let suffix = 2;
  while (database.prepare('SELECT 1 AS ok FROM users WHERE lower(email) = ?').get(email)) {
    const [local, domain] = candidate.split('@');
    email = `${local}${suffix}@${domain}`;
    suffix += 1;
  }
  return email;
}

function migrateExistingBrand(database) {
  const oldBrand = database
    .prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@sunrise.ac.ke'")
    .get();
  if (Number(oldBrand.n) === 0) return;

  database.exec('BEGIN');
  try {
    database
      .prepare("UPDATE students SET admission_no = replace(admission_no, 'SUN/', 'MUK/') WHERE admission_no LIKE 'SUN/%'")
      .run();

    const updateEmail = database.prepare('UPDATE users SET email = ? WHERE id = ?');
    const students = database
      .prepare(
        `SELECT u.id, s.admission_no FROM users u JOIN students s ON s.user_id = u.id
         WHERE u.email LIKE '%@student.sunrise.ac.ke'`
      )
      .all();
    for (const row of students) {
      const candidate = `${admissionSlug(row.admission_no) || 'student'}@${config.studentDomain}`;
      updateEmail.run(availableEmail(database, candidate), row.id);
    }

    database
      .prepare("UPDATE users SET email = replace(email, '@sunrise.ac.ke', ?) WHERE email LIKE '%@sunrise.ac.ke'")
      .run(`@${config.domain}`);

    const parents = database
      .prepare("SELECT id, name FROM users WHERE role = 'parent' AND email LIKE '%@example.com'")
      .all();
    for (const row of parents) {
      const candidate = `${nameSlug(row.name) || 'parent'}@${config.domain}`;
      updateEmail.run(availableEmail(database, candidate), row.id);
    }

    database.prepare("UPDATE users SET must_change_password = 1 WHERE role != 'admin'").run();
    database.exec('COMMIT');
    console.log('[migration] Rebranded existing accounts to MUKHAWELI and queued first-login password changes.');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function ensureSuperAdmin(database) {
  const existing = database.prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) return { created: false, email: existing.email };

  const email = config.admin.email;
  const clash = database.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email);
  if (clash) {
    database
      .prepare(
        `UPDATE users SET role = 'admin', active = 1, must_change_password = 1,
                password_hash = ?, position = 'System Administrator' WHERE id = ?`
      )
      .run(hashPassword(config.admin.password), clash.id);
    return { created: true, email };
  }

  database
    .prepare(
      `INSERT INTO users (name, email, role, position, password_hash, active, must_change_password)
       VALUES (?, ?, 'admin', 'System Administrator', ?, 1, 1)`
    )
    .run(config.admin.name, email, hashPassword(config.admin.password));
  return { created: true, email };
}

export function initDb() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
  db = new DatabaseSync(config.dbFile);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(schema);
  ensureColumn(db, 'users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'created_by', 'INTEGER REFERENCES users(id)');
  ensureColumn(db, 'users', 'last_login_at', 'TEXT');
  loadSettings(db);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (Number(n) === 0) seed(db);
  else migrateExistingBrand(db);

  const admin = ensureSuperAdmin(db);
  if (admin.created) {
    console.log(`[admin] Super-admin account ready: ${admin.email} (sign in at /admin/login)`);
    console.log('[admin] Set ADMIN_EMAIL and ADMIN_PASSWORD before first launch to choose your own credentials.');
    if (config.admin.generatedPassword) {
      console.log(`[admin] ADMIN_PASSWORD was not set. Temporary password: ${config.admin.password}`);
      console.log('[admin] Sign in and change this password immediately.');
    }
  }
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  db.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialised');
  return db;
}
