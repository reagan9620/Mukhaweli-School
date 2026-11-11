import { getDb } from './db.js';

export const ANNOUNCEMENT_CATEGORIES = ['News', 'Event', 'Notice', 'Achievement'];

export const ENQUIRY_KINDS = {
  admission: 'Admissions enquiry',
  general: 'General enquiry',
};

export function listPublishedAnnouncements({ limit = 20 } = {}) {
  return getDb()
    .prepare(
      `SELECT id, title, summary, category, pinned, created_at, published_at
       FROM announcements
       WHERE published = 1
       ORDER BY pinned DESC, COALESCE(published_at, created_at) DESC, id DESC
       LIMIT ?`
    )
    .all(Number(limit));
}

export function getPublishedAnnouncement(id) {
  return getDb()
    .prepare(
      `SELECT id, title, summary, body, category, pinned, created_at, published_at
       FROM announcements WHERE id = ? AND published = 1`
    )
    .get(Number(id));
}

export function listAnnouncements() {
  return getDb()
    .prepare(
      `SELECT a.id, a.title, a.summary, a.body, a.category, a.pinned, a.published,
              a.created_at, a.updated_at, a.published_at
       FROM announcements a ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC LIMIT 200`
    )
    .all();
}

export function getAnnouncement(id) {
  return getDb().prepare('SELECT * FROM announcements WHERE id = ?').get(Number(id));
}

export function createAnnouncement({ title, summary, body, category, pinned = false, published = true, userId = null }) {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `INSERT INTO announcements (title, summary, body, category, pinned, published, created_by, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      title,
      summary,
      body,
      ANNOUNCEMENT_CATEGORIES.includes(category) ? category : 'News',
      pinned ? 1 : 0,
      published ? 1 : 0,
      userId,
      published ? now : null
    );
  return Number(info.lastInsertRowid);
}

export function updateAnnouncement(id, { title, summary, body, category, pinned = false, published = true }) {
  const current = getAnnouncement(id);
  if (!current) return false;
  getDb()
    .prepare(
      `UPDATE announcements
       SET title = ?, summary = ?, body = ?, category = ?, pinned = ?, published = ?,
           updated_at = datetime('now'),
           published_at = CASE WHEN ? = 1 AND published = 0 THEN datetime('now') ELSE published_at END
       WHERE id = ?`
    )
    .run(
      title,
      summary,
      body,
      ANNOUNCEMENT_CATEGORIES.includes(category) ? category : 'News',
      pinned ? 1 : 0,
      published ? 1 : 0,
      published ? 1 : 0,
      Number(id)
    );
  return true;
}

export function setAnnouncementPublished(id, published) {
  const current = getAnnouncement(id);
  if (!current) return null;
  getDb()
    .prepare(
      `UPDATE announcements
       SET published = ?, updated_at = datetime('now'),
           published_at = CASE WHEN ? = 1 AND published_at IS NULL THEN datetime('now') ELSE published_at END
       WHERE id = ?`
    )
    .run(published ? 1 : 0, published ? 1 : 0, Number(id));
  return { ...current, published: published ? 1 : 0 };
}

export function deleteAnnouncement(id) {
  const current = getAnnouncement(id);
  if (!current) return null;
  getDb().prepare('DELETE FROM announcements WHERE id = ?').run(Number(id));
  return current;
}

export function publishedAnnouncementCount() {
  return Number(getDb().prepare('SELECT COUNT(*) AS n FROM announcements WHERE published = 1').get().n);
}

export function createEnquiry({ name, email, phone, kind, subject, message }) {
  const info = getDb()
    .prepare(
      `INSERT INTO enquiries (name, email, phone, kind, subject, message)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, email, phone || '', kind === 'admission' ? 'admission' : 'general', subject, message);
  return Number(info.lastInsertRowid);
}

export function listEnquiries({ status = '', search = '' } = {}) {
  const where = [];
  const params = [];
  if (['new', 'read', 'closed'].includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(lower(name) LIKE ? OR lower(email) LIKE ? OR lower(subject) LIKE ?)');
    const like = `%${String(search).toLowerCase()}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(
      `SELECT e.*, u.name AS handled_by_name
       FROM enquiries e LEFT JOIN users u ON u.id = e.handled_by
       ${clause} ORDER BY e.created_at DESC, e.id DESC LIMIT 300`
    )
    .all(...params);
}

export function enquiryCounts() {
  const rows = getDb().prepare('SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status').all();
  const counts = { new: 0, read: 0, closed: 0, total: 0 };
  for (const row of rows) {
    counts[row.status] = Number(row.n);
    counts.total += Number(row.n);
  }
  return counts;
}

export function setEnquiryStatus(id, status, userId) {
  if (!['new', 'read', 'closed'].includes(status)) return null;
  const current = getDb().prepare('SELECT * FROM enquiries WHERE id = ?').get(Number(id));
  if (!current) return null;
  getDb()
    .prepare(
      `UPDATE enquiries SET status = ?, handled_by = ?, handled_at = datetime('now') WHERE id = ?`
    )
    .run(status, status === 'new' ? null : userId, Number(id));
  return { ...current, status };
}
