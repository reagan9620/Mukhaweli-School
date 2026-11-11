import { config } from './config.js';

export const SETTINGS_FIELDS = [
  {
    key: 'school',
    label: 'School name',
    type: 'text',
    max: 90,
    help: 'Shown in page titles, the website header and the footer.',
  },
  { key: 'shortName', label: 'Short name', type: 'text', max: 40, help: 'Used in the portal and admin sidebar.' },
  { key: 'motto', label: 'Motto', type: 'text', max: 120 },
  { key: 'address', label: 'Postal address', type: 'text', max: 160 },
  { key: 'phone', label: 'Phone number', type: 'text', max: 40 },
  { key: 'email', label: 'Public email', type: 'text', max: 180, email: true },
  { key: 'term', label: 'Current term', type: 'text', max: 40 },
  { key: 'year', label: 'Academic year', type: 'number', min: 2000, max: 2100 },
  { key: 'examName', label: 'Examination name', type: 'text', max: 80 },
  {
    key: 'domain',
    label: 'Staff & parent email domain',
    type: 'text',
    max: 80,
    domain: true,
    help: 'Used for new staff and parent accounts. Existing emails are not renamed.',
  },
  {
    key: 'studentDomain',
    label: 'Student email domain',
    type: 'text',
    max: 80,
    domain: true,
    help: 'Used for new student accounts. Existing emails are not renamed.',
  },
];

export function currentSettings() {
  return Object.fromEntries(SETTINGS_FIELDS.map((field) => [field.key, config[field.key]]));
}

export function loadSettings(db) {
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  for (const field of SETTINGS_FIELDS) {
    const value = stored[field.key];
    if (value === undefined || value === '') continue;
    config[field.key] = field.type === 'number' ? Number(value) : value;
  }
  return currentSettings();
}

export function saveSettings(db, values) {
  const statement = db.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  for (const field of SETTINGS_FIELDS) statement.run(field.key, String(values[field.key]));
  return loadSettings(db);
}
