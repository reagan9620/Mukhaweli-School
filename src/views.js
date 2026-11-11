import { config } from './config.js';
import { esc, fmtDate, initials } from './http.js';

export const roleLabels = {
  admin: 'System Administrator',
  principal: 'Principal',
  deputy_boarding: 'Deputy Principal — Boarding',
  deputy_academics: 'Deputy Principal — Academics',
  dos: 'Director of Studies',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent / Guardian',
  worker: 'Support Staff',
  bom: 'Board of Management',
};

const icons = {
  home: '<path d="M3 10.8 12 3l9 7.8V21a1 1 0 0 1-1 1h-5.5v-6.5h-5V22H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<path d="M16 21v-1.7a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V21"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-1.7a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  wallet: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M16 15h2"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 12h8M8 16h5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M8.2 13.2 7 22l5-3 5 3-1.2-8.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1L11 5"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1L13 19"/>',
  note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M20 16h-4v4"/>',
  file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>',
  arrowRight: '<path d="m9 18 6-6-6-6"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

export function icon(name, className = 'icon') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
}

const navs = {
  admin: [
    { href: '/admin', label: 'Overview', icon: 'shield' },
    { href: '/admin/users', label: 'Accounts', icon: 'users' },
    { href: '/admin/users/new', label: 'Create account', icon: 'plus' },
    { href: '/admin/announcements', label: 'Announcements', icon: 'note' },
    { href: '/admin/enquiries', label: 'Enquiries', icon: 'inbox' },
    { href: '/admin/settings', label: 'Website settings', icon: 'settings' },
    { href: '/admin/audit', label: 'Audit log', icon: 'clipboard' },
  ],
  principal: [
    { href: '/principal', label: 'Overview', icon: 'home' },
    { href: '/principal/staff', label: 'Staff & BOM', icon: 'users' },
    { href: '/principal/students', label: 'Students & reports', icon: 'report' },
    { href: '/timetable/exam', label: 'Exam timetable', icon: 'calendar' },
    { href: '/calendar', label: 'School calendar', icon: 'clock' },
  ],
  deputy_boarding: [
    { href: '/boarding', label: 'Overview', icon: 'home' },
    { href: '/boarding/hostels', label: 'Hostels', icon: 'building' },
    { href: '/boarding/attendance', label: 'Worker attendance', icon: 'clock' },
    { href: '/boarding/performance', label: 'Class performance', icon: 'chart' },
    { href: '/boarding/messages', label: 'Parent messages', icon: 'mail' },
    { href: '/timetable/exam', label: 'Exam timetable', icon: 'calendar' },
  ],
  deputy_academics: [
    { href: '/academics', label: 'Overview', icon: 'home' },
    { href: '/academics/students', label: 'Students', icon: 'users' },
    { href: '/academics/fees', label: 'Fee balances', icon: 'wallet' },
    { href: '/academics/timetable', label: 'Teaching timetable', icon: 'grid' },
    { href: '/academics/calendar', label: 'Exam & term dates', icon: 'calendar' },
    { href: '/academics/messages', label: 'Parent messages', icon: 'mail' },
    { href: '/timetable/exam', label: 'Exam timetable', icon: 'clipboard' },
  ],
  dos: [
    { href: '/dos', label: 'Overview', icon: 'home' },
    { href: '/dos/exam-timetable', label: 'Exam timetable', icon: 'calendar' },
    { href: '/dos/timetable', label: 'Teaching timetable', icon: 'grid' },
    { href: '/dos/allocations', label: 'Teacher allocations', icon: 'users' },
    { href: '/dos/marks', label: 'Gradebook', icon: 'award' },
    { href: '/dos/complaints', label: 'Complaint box', icon: 'clipboard' },
    { href: '/dos/revision', label: 'Revision papers', icon: 'book' },
  ],
  teacher: [
    { href: '/teacher', label: 'Overview', icon: 'home' },
    { href: '/teacher/marks', label: 'Gradebook', icon: 'award' },
    { href: '/teacher/complaints', label: 'Parent complaints', icon: 'clipboard' },
    { href: '/teacher/revision', label: 'Revision materials', icon: 'book' },
    { href: '/teacher/students', label: 'My class', icon: 'users' },
    { href: '/teacher/timetable', label: 'My timetable', icon: 'grid' },
    { href: '/timetable/exam', label: 'Exam timetable', icon: 'calendar' },
  ],
  student: [
    { href: '/student', label: 'Overview', icon: 'home' },
    { href: '/student/results', label: 'My results', icon: 'award' },
    { href: '/student/fees', label: 'Fee balance', icon: 'wallet' },
    { href: '/student/timetable', label: 'Timetable', icon: 'grid' },
    { href: '/timetable/exam', label: 'Exam timetable', icon: 'calendar' },
    { href: '/student/revision', label: 'Revision', icon: 'book' },
    { href: '/student/complaints', label: 'Complaints', icon: 'clipboard' },
  ],
  parent: [
    { href: '/parent', label: 'Overview', icon: 'home' },
    { href: '/parent/children', label: 'My children', icon: 'users' },
    { href: '/parent/fees', label: 'Fees & receipts', icon: 'wallet' },
    { href: '/parent/revision', label: 'Revision', icon: 'book' },
    { href: '/parent/complaints', label: 'Complaints', icon: 'clipboard' },
    { href: '/parent/calendar', label: 'Term & exam dates', icon: 'calendar' },
    { href: '/timetable/exam', label: 'Exam timetable', icon: 'clipboard' },
  ],
  worker: [
    { href: '/worker', label: 'My attendance', icon: 'clock' },
  ],
  bom: [
    { href: '/bom', label: 'Overview', icon: 'home' },
    { href: '/timetable/exam', label: 'Exam timetable', icon: 'calendar' },
    { href: '/calendar', label: 'School calendar', icon: 'clock' },
  ],
};

function navFor(role) {
  return navs[role] || navs.student;
}

export function documentPage({ title, body, bodyClass = '', user = null, active = '', wide = false, badges = {} }) {
  const nav = user
    ? navFor(user.role)
        .map((item) => {
          const count = item.href === '/admin/enquiries' ? Number(badges.enquiry || 0) : 0;
          const countTag =
            item.href === '/admin/enquiries'
              ? `<span class="nav-count" data-enquiry-badge ${count ? '' : 'hidden'}>${count}</span>`
              : '';
          return `<a class="nav-item ${active === item.href ? 'active' : ''}" href="${item.href}">
            ${icon(item.icon)}
            <span>${esc(item.label)}</span>${countTag}
          </a>`;
        })
        .join('')
    : '';
  const userBlock = user
    ? `<div class="sidebar-user">
        <span class="avatar">${esc(initials(user.name))}</span>
        <div class="sidebar-user-name">
          <strong>${esc(user.name)}</strong>
          <small>${esc(roleLabels[user.role] || user.role)}</small>
        </div>
        <form method="post" action="/logout" title="Sign out">
          <button class="icon-btn" type="submit" aria-label="Sign out">${icon('logout')}</button>
        </form>
      </div>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · ${esc(config.school)}</title>
  <link rel="stylesheet" href="/assets/app.css?v=6">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f3d5c'/%3E%3Ctext x='32' y='44' font-family='Georgia' font-size='34' fill='%23e3b552' text-anchor='middle'%3EM%3C/text%3E%3C/svg%3E">
  <script src="/assets/app.js?v=5" defer></script>
  ${user?.role === 'admin' ? '<script src="/assets/admin-live.js?v=6" defer></script>' : ''}
</head>
<body class="${bodyClass} ${user ? 'app' : 'public'}">
  ${user ? `<div class="shell ${wide ? 'wide' : ''}">
    <aside class="sidebar">
      <a class="brand" href="/dashboard">
        <span class="crest">M</span>
        <span class="brand-text"><strong>${esc(config.shortName)}</strong><small>School portal</small></span>
      </a>
      <p class="sidebar-label">${esc(roleLabels[user.role] || user.role)}</p>
      <nav class="nav">${nav}</nav>
      <div class="sidebar-foot">
        <div class="term-pill">${esc(config.term)} · ${config.year}</div>
        ${userBlock}
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div>
          <p class="eyebrow">${esc(roleLabels[user.role] || user.role)}</p>
          <h1>${esc(title)}</h1>
        </div>
        <div class="topbar-meta">
          <span class="date-pill">${esc(fmtDate(new Date(), 'long'))}</span>
        </div>
      </header>
      <main class="content">${body}</main>
    </div>
  </div>` : body}
</body>
</html>`;
}

export function layout(ctx, title, body, options = {}) {
  const badges = {};
  if (ctx.user?.role === 'admin' && ctx.db) {
    badges.enquiry = Number(
      ctx.db.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'").get().n
    );
  }
  return documentPage({
    title,
    body: `${flash(ctx.query)}${body}`,
    bodyClass: options.bodyClass || '',
    user: ctx.user,
    active: options.active ?? ctx.pathname,
    wide: options.wide,
    badges,
  });
}

export function publicPage(title, body) {
  return documentPage({ title, body, bodyClass: 'auth-body' });
}

export function flash(query = {}) {
  let out = '';
  if (query.ok) out += `<div class="flash success">${icon('check')}<span>${esc(query.ok)}</span></div>`;
  if (query.err) out += `<div class="flash error">${icon('alert')}<span>${esc(query.err)}</span></div>`;
  return out;
}

export function badge(text, tone = 'neutral') {
  return `<span class="badge ${tone}"><span class="dot"></span>${esc(text)}</span>`;
}

export function statCard({ label, value, meta = '', iconName = 'grid', tone = '', href = null }) {
  const inner = `<span class="stat-icon ${tone}">${icon(iconName)}</span>
    <div class="stat-copy">
      <p class="stat-label">${esc(label)}</p>
      <p class="stat-value">${value}</p>
      ${meta ? `<p class="stat-meta">${meta}</p>` : ''}
    </div>`;
  return href
    ? `<a class="stat ${tone}" href="${href}">${inner}</a>`
    : `<div class="stat ${tone}">${inner}</div>`;
}

export function panel({ title, subtitle = '', actions = '', body, className = '', flush = false }) {
  return `<section class="panel ${className}">
    ${title ? `<header class="panel-head">
      <div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
      ${actions ? `<div class="panel-actions">${actions}</div>` : ''}
    </header>` : ''}
    <div class="panel-body ${flush ? 'flush' : ''}">${body}</div>
  </section>`;
}

export function table(headers, rows, { empty = 'No records yet.', className = '' } = {}) {
  if (!rows.length) return emptyState(empty);
  return `<div class="table-wrap"><table class="${className}">
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

export function emptyState(message, hint = '') {
  return `<div class="empty"><div class="empty-icon">${icon('inbox')}</div><p>${esc(message)}</p>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
}

export function avatar(name, className = '') {
  return `<span class="avatar ${className}">${esc(initials(name))}</span>`;
}

export function selectOptions(options, selected = '', placeholder = null) {
  const first = placeholder
    ? `<option value="">${esc(placeholder)}</option>`
    : '';
  return (
    first +
    options
      .map(
        (opt) =>
          `<option value="${esc(opt.value)}" ${String(opt.value) === String(selected) ? 'selected' : ''}>${esc(opt.label)}</option>`
      )
      .join('')
  );
}

export function isOpenComplaint(complaint) {
  return complaint.status === 'open';
}

export function complaintBadge(status) {
  return badge(status === 'open' ? 'Open' : 'Resolved', status === 'open' ? 'warn' : 'good');
}

export function calendarCard(calendar, { compact = false } = {}) {
  const items = [
    ['Term opens', calendar.opening_date, 'calendar'],
    ['Term closes', calendar.closing_date, 'clock'],
    ['Exams begin', calendar.exam_start, 'book'],
    ['Exams end', calendar.exam_end, 'check'],
  ];
  return `<div class="calendar-grid ${compact ? 'compact' : ''}">
    ${items
      .map(
        ([label, date, iconName]) => `<div class="calendar-item">
          <span class="calendar-icon">${icon(iconName)}</span>
          <div><p>${esc(label)}</p><strong>${date ? esc(fmtDate(date)) : 'Not set'}</strong></div>
        </div>`
      )
      .join('')}
  </div>`;
}
