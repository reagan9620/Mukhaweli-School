import { audit } from '../accounts.js';
import { HANDLED, esc, fmtDate, fmtDateTime, html, redirect } from '../http.js';
import { broadcast, subscribe } from '../events.js';
import { SETTINGS_FIELDS, currentSettings, saveSettings } from '../settings.js';
import {
  ANNOUNCEMENT_CATEGORIES,
  createAnnouncement,
  deleteAnnouncement,
  enquiryCounts,
  getAnnouncement,
  listAnnouncements,
  listEnquiries,
  setAnnouncementPublished,
  setEnquiryStatus,
  updateAnnouncement,
} from '../public-data.js';
import {
  avatar,
  badge,
  icon,
  layout,
  panel,
  selectOptions,
  statCard,
  table,
} from '../views.js';

function checkbox(value) {
  return value === 'on' || value === '1' || value === true;
}

function announcementForm(ctx, { values = {}, editing = null, error = '' } = {}) {
  const action = editing ? `/admin/announcements/${editing.id}` : '/admin/announcements';
  return html(
    layout(
      ctx,
      editing ? 'Edit announcement' : 'Public announcements',
      `<div class="split">
        ${panel({
          title: editing ? 'Edit announcement' : 'New announcement',
          subtitle: 'Published notices appear on the public website immediately.',
          actions: editing ? '<a class="btn small ghost" href="/admin/announcements">Cancel</a>' : '',
          body: `${error ? `<div class="flash error">${icon('alert')}<span>${esc(error)}</span></div>` : ''}
            <form method="post" action="${action}" class="form-grid">
              <div class="field span-2"><label for="an-title">Title</label>
                <input id="an-title" name="title" value="${esc(values.title || '')}" maxlength="140" required>
              </div>
              <div class="field"><label for="an-category">Category</label>
                <select id="an-category" name="category">
                  ${selectOptions(ANNOUNCEMENT_CATEGORIES.map((value) => ({ value, label: value })), values.category || 'News')}
                </select>
              </div>
              <div class="field"><label>Visibility</label>
                <div class="check-row">
                  <label><input type="checkbox" name="published" ${values.published ? 'checked' : ''}> Published</label>
                  <label><input type="checkbox" name="pinned" ${values.pinned ? 'checked' : ''}> Pin to top</label>
                </div>
              </div>
              <div class="field span-2"><label for="an-summary">Summary</label>
                <textarea id="an-summary" name="summary" rows="2" maxlength="300" required placeholder="One sentence shown on the news cards.">${esc(values.summary || '')}</textarea>
              </div>
              <div class="field span-2"><label for="an-body">Full notice</label>
                <textarea id="an-body" name="body" rows="8" maxlength="8000" required placeholder="Write the full announcement. Leave a blank line between paragraphs.">${esc(values.body || '')}</textarea>
              </div>
              <div class="form-actions span-2">
                <button class="btn" type="submit">${icon('check')} ${editing ? 'Save changes' : 'Save announcement'}</button>
                <a class="btn ghost" href="/admin/announcements">Cancel</a>
              </div>
            </form>`,
        })}
        ${panel({
          title: 'How this page works',
          body: `<div class="list">
            <div class="list-item"><span class="material-icon">${icon('check')}</span><div class="list-copy"><strong>Published</strong><small>Appears on the public news page and the home page instantly.</small></div></div>
            <div class="list-item"><span class="material-icon">${icon('note')}</span><div class="list-copy"><strong>Draft</strong><small>Saved privately in this console until you publish it.</small></div></div>
            <div class="list-item"><span class="material-icon">${icon('link')}</span><div class="list-copy"><strong>Pinned</strong><small>Pinned notices stay at the top of the news list.</small></div></div>
          </div>`,
        })}
      </div>`,
      { active: '/admin/announcements' }
    ),
    error ? 400 : 200
  );
}

function announcementValues(ctx) {
  return {
    title: String(ctx.fields.title || '').trim().slice(0, 140),
    summary: String(ctx.fields.summary || '').trim().slice(0, 300),
    body: String(ctx.fields.body || '').trim().slice(0, 8000),
    category: String(ctx.fields.category || 'News'),
    pinned: checkbox(ctx.fields.pinned),
    published: checkbox(ctx.fields.published),
  };
}

function validateAnnouncement(values) {
  if (values.title.length < 3) return 'Enter a title of at least 3 characters.';
  if (values.summary.length < 10) return 'Write a one-sentence summary of at least 10 characters.';
  if (values.body.length < 20) return 'Write the full notice (at least 20 characters).';
  return '';
}

function announcementsPage(ctx) {
  const rows = listAnnouncements().map((item) => {
    const view = Number(item.published)
      ? `<a class="btn small ghost" href="/news/${item.id}" target="_blank" rel="noopener">View</a>`
      : '';
    return [
      `<div class="table-avatar"><div><span class="table-name">${esc(item.title)}</span><span class="table-sub">${esc(item.category)} · ${esc(item.summary)}</span></div></div>`,
      Number(item.published) ? badge('Published', 'good') : badge('Draft', 'neutral'),
      Number(item.pinned) ? badge('Pinned', 'gold') : '—',
      `<span class="table-name">${esc(fmtDate(item.updated_at || item.created_at))}</span>`,
      `<div class="account-actions">
        <a class="btn small ghost" href="/admin/announcements/${item.id}/edit">Edit</a>
        ${view}
        <form method="post" action="/admin/announcements/${item.id}/toggle">
          <button class="btn small ghost" type="submit">${Number(item.published) ? 'Unpublish' : 'Publish'}</button>
        </form>
        <form method="post" action="/admin/announcements/${item.id}/delete" data-confirm="Delete “${esc(item.title)}” permanently?">
          <button class="btn small danger" type="submit">Delete</button>
        </form>
      </div>`,
    ];
  });
  return html(
    layout(
      ctx,
      'Public announcements',
      `${panel({
        title: 'Announcements on the public website',
        subtitle: 'Anything published here is visible to visitors immediately.',
        actions: `<a class="btn small" href="/admin/announcements/new">${icon('plus')} New announcement</a>`,
        body: table(['Notice', 'Status', 'Pinned', 'Updated', 'Actions'], rows, {
          empty: 'No announcements yet. Create the first notice for the public website.',
        }),
        flush: true,
      })}
      <div class="notice gold">${icon('link')}<div><strong>Public website:</strong> publish a welcome notice, exam reminder or event and it appears on <a href="/" target="_blank" rel="noopener">the school website</a> without a refresh.</div></div>`,
      { active: '/admin/announcements' }
    )
  );
}

function createAnnouncementHandler(ctx) {
  const values = announcementValues(ctx);
  const error = validateAnnouncement(values);
  if (error) return announcementForm(ctx, { values, error });
  const id = createAnnouncement({ ...values, userId: ctx.user.id });
  audit(ctx.db, ctx.user.id, 'announcement.create', {
    detail: `${values.published ? 'Published' : 'Saved draft'} “${values.title}”`,
  });
  broadcast('announcements', { reason: 'created', id });
  return redirect(`/admin/announcements?ok=${encodeURIComponent(values.published ? 'Announcement published to the public website.' : 'Announcement saved as a draft.')}`);
}

function editAnnouncementPage(ctx) {
  const item = getAnnouncement(ctx.params.id);
  if (!item) return redirect('/admin/announcements?err=Announcement+not+found');
  return announcementForm(ctx, {
    editing: item,
    values: {
      title: item.title,
      summary: item.summary,
      body: item.body,
      category: item.category,
      pinned: Number(item.pinned),
      published: Number(item.published),
    },
  });
}

function updateAnnouncementHandler(ctx) {
  const item = getAnnouncement(ctx.params.id);
  if (!item) return redirect('/admin/announcements?err=Announcement+not+found');
  const values = announcementValues(ctx);
  const error = validateAnnouncement(values);
  if (error) return announcementForm(ctx, { editing: item, values, error });
  updateAnnouncement(item.id, values);
  audit(ctx.db, ctx.user.id, 'announcement.update', {
    detail: `${values.published ? 'Published' : 'Saved draft'} “${values.title}”`,
  });
  broadcast('announcements', { reason: 'updated', id: item.id });
  return redirect('/admin/announcements?ok=Announcement+updated.');
}

function toggleAnnouncementHandler(ctx) {
  const item = getAnnouncement(ctx.params.id);
  if (!item) return redirect('/admin/announcements?err=Announcement+not+found');
  const next = !Number(item.published);
  setAnnouncementPublished(item.id, next);
  audit(ctx.db, ctx.user.id, 'announcement.visibility', {
    detail: `${next ? 'Published' : 'Unpublished'} “${item.title}”`,
  });
  broadcast('announcements', { reason: 'visibility', id: item.id });
  return redirect(`/admin/announcements?ok=${encodeURIComponent(next ? 'Announcement published.' : 'Announcement moved to drafts.')}`);
}

function deleteAnnouncementHandler(ctx) {
  const item = deleteAnnouncement(ctx.params.id);
  if (!item) return redirect('/admin/announcements?err=Announcement+not+found');
  audit(ctx.db, ctx.user.id, 'announcement.delete', { detail: `Deleted “${item.title}”` });
  broadcast('announcements', { reason: 'deleted', id: item.id });
  return redirect('/admin/announcements?ok=Announcement+deleted.');
}

function enquiriesPage(ctx) {
  const status = ['new', 'read', 'closed'].includes(ctx.query.status) ? ctx.query.status : '';
  const search = String(ctx.query.q || '').trim();
  const counts = enquiryCounts();
  const rows = listEnquiries({ status, search }).map((enquiry) => {
    const actions = [];
    if (enquiry.status === 'new') {
      actions.push(`<form method="post" action="/admin/enquiries/${enquiry.id}/status"><input type="hidden" name="status" value="read"><button class="btn small ghost" type="submit">Mark read</button></form>`);
      actions.push(`<form method="post" action="/admin/enquiries/${enquiry.id}/status"><input type="hidden" name="status" value="closed"><button class="btn small" type="submit">Close</button></form>`);
    } else if (enquiry.status === 'read') {
      actions.push(`<form method="post" action="/admin/enquiries/${enquiry.id}/status"><input type="hidden" name="status" value="closed"><button class="btn small" type="submit">Close</button></form>`);
    } else {
      actions.push(`<form method="post" action="/admin/enquiries/${enquiry.id}/status"><input type="hidden" name="status" value="new"><button class="btn small ghost" type="submit">Reopen</button></form>`);
    }
    return [
      `<div class="table-avatar">${avatar(enquiry.name)}<div><span class="table-name">${esc(enquiry.name)}</span><span class="table-sub">${esc(enquiry.email)}</span>${enquiry.phone ? `<span class="table-sub">${esc(enquiry.phone)}</span>` : ''}</div></div>`,
      badge(enquiry.kind === 'admission' ? 'Admissions' : 'General', enquiry.kind === 'admission' ? 'gold' : 'info'),
      `<div class="enquiry-message"><span class="table-name">${esc(enquiry.subject)}</span>
        <details><summary>View message</summary><p>${esc(enquiry.message).replace(/\n/g, '<br>')}</p></details>
        ${enquiry.handled_by_name ? `<span class="table-sub">Handled by ${esc(enquiry.handled_by_name)}</span>` : ''}
      </div>`,
      `<span class="table-name">${esc(fmtDateTime(enquiry.created_at))}</span>`,
      badge(
        enquiry.status === 'new' ? 'New' : enquiry.status === 'closed' ? 'Closed' : 'In progress',
        enquiry.status === 'new' ? 'warn' : enquiry.status === 'closed' ? 'neutral' : 'good'
      ),
      `<div class="account-actions">${actions.join('')}</div>`,
    ];
  });
  return html(
    layout(
      ctx,
      'Public enquiries',
      `<div class="stats" id="enquiry-stats">
        ${statCard({ label: 'New', value: counts.new, meta: 'Waiting for a response', iconName: 'inbox', tone: counts.new ? 'warn' : '', href: '/admin/enquiries?status=new' })}
        ${statCard({ label: 'In progress', value: counts.read, meta: 'Read but not closed', iconName: 'clock', href: '/admin/enquiries?status=read' })}
        ${statCard({ label: 'Closed', value: counts.closed, meta: 'Handled enquiries', iconName: 'check', href: '/admin/enquiries?status=closed' })}
      </div>
      ${panel({
        title: 'Enquiries from the public website',
        subtitle: `${counts.total} enquir${counts.total === 1 ? 'y' : 'ies'} received · admissions and general messages`,
        body: `<form class="search-form" method="get" action="/admin/enquiries">
            <input name="q" value="${esc(search)}" placeholder="Name, email or subject" aria-label="Search enquiries">
            <select name="status" aria-label="Filter by status">
              ${selectOptions([
                { value: 'new', label: 'New' },
                { value: 'read', label: 'In progress' },
                { value: 'closed', label: 'Closed' },
              ], status, 'Any status')}
            </select>
            <button class="btn small ghost" type="submit">${icon('search')} Search</button>
            ${search || status ? '<a class="btn small ghost" href="/admin/enquiries">Clear</a>' : ''}
          </form>
          <div id="enquiry-table">${table(['From', 'Type', 'Message', 'Received', 'Status', 'Actions'], rows, {
            empty: 'No enquiries match these filters.',
          })}</div>`,
        flush: true,
      })}`,
      { active: '/admin/enquiries' }
    )
  );
}

function enquiryStatusHandler(ctx) {
  const status = String(ctx.fields.status || '');
  const updated = setEnquiryStatus(ctx.params.id, status, ctx.user.id);
  if (!updated) return redirect('/admin/enquiries?err=Enquiry+not+found');
  audit(ctx.db, ctx.user.id, 'enquiry.status', {
    detail: `Marked ${updated.kind} enquiry from ${updated.name} as ${status}`,
  });
  return redirect('/admin/enquiries?ok=Enquiry+updated.');
}

function settingsPage(ctx, { values = currentSettings(), errors = {} } = {}) {
  const field = (setting) => {
    const error = errors[setting.key];
    const hint = error
      ? `<span class="hint" style="color:var(--red)">${esc(error)}</span>`
      : setting.help
        ? `<span class="hint">${esc(setting.help)}</span>`
        : '';
    const numeric = setting.type === 'number';
    return `<div class="field">
      <label for="set-${setting.key}">${esc(setting.label)}</label>
      <input id="set-${setting.key}" name="${setting.key}" type="${numeric ? 'number' : 'text'}"
        value="${esc(values[setting.key] ?? '')}"
        ${numeric ? `min="${setting.min}" max="${setting.max}" step="1"` : `maxlength="${setting.max}"`}
        required>
      ${hint}
    </div>`;
  };
  return html(
    layout(
      ctx,
      'Website settings',
      `<div class="split">
        ${panel({
          title: 'School details',
          subtitle: 'These appear on the public website and across the portal.',
          body: `<form method="post" action="/admin/settings">
            <div class="form-grid">${SETTINGS_FIELDS.map(field).join('')}</div>
            <div class="form-actions">
              <button class="btn" type="submit">${icon('check')} Save details</button>
              <a class="btn ghost" href="/" target="_blank" rel="noopener">${icon('link')} View public website</a>
            </div>
          </form>`,
        })}
        ${panel({
          title: 'How this works',
          body: `<div class="list">
            <div class="list-item">${icon('check')}<div class="list-copy"><strong>Live immediately</strong><small>Saving updates the website and portal on the next page load. No redeploy needed.</small></div></div>
            <div class="list-item">${icon('mail')}<div class="list-copy"><strong>Account emails are separate</strong><small>Changing the public email does not change the sign-in addresses issued to staff or students.</small></div></div>
            <div class="list-item">${icon('clock')}<div class="list-copy"><strong>Term dates</strong><small>Opening, closing and examination dates are shown from the school calendar.</small></div></div>
          </div>`,
        })}
      </div>`,
      { active: '/admin/settings' }
    )
  );
}

function updateSettingsHandler(ctx) {
  const values = {};
  const errors = {};
  for (const setting of SETTINGS_FIELDS) {
    const raw = String(ctx.fields[setting.key] ?? '').trim();
    values[setting.key] = raw.slice(0, setting.max);
    if (!raw) {
      errors[setting.key] = 'This field is required.';
      continue;
    }
    if (setting.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      errors[setting.key] = 'Enter a valid email address.';
    }
    if (setting.domain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(raw)) {
      errors[setting.key] = 'Enter a domain like mukhaweli.ac.ke — no @ symbol or spaces.';
    }
    if (setting.type === 'number') {
      const number = Number(raw);
      if (!Number.isInteger(number) || number < setting.min || number > setting.max) {
        errors[setting.key] = `Enter a year between ${setting.min} and ${setting.max}.`;
      }
    }
    if (setting.domain) values[setting.key] = values[setting.key].toLowerCase();
  }
  if (Object.keys(errors).length) {
    const page = settingsPage(ctx, { values, errors });
    return html(page.body, 400);
  }
  saveSettings(ctx.db, values);
  audit(ctx.db, ctx.user.id, 'settings.update', { detail: `Updated school details for ${values.school}` });
  return redirect(
    `/admin/settings?ok=${encodeURIComponent('School details saved. They are live on the website and portal.')}`
  );
}

export function registerAdminSite(r) {
  r.get('/admin/announcements', ['admin'], announcementsPage);
  r.get('/admin/announcements/new', ['admin'], (ctx) =>
    announcementForm(ctx, { values: { category: 'News', published: 1, pinned: 0 } })
  );
  r.post('/admin/announcements', ['admin'], createAnnouncementHandler);
  r.get('/admin/announcements/:id/edit', ['admin'], editAnnouncementPage);
  r.post('/admin/announcements/:id', ['admin'], updateAnnouncementHandler);
  r.post('/admin/announcements/:id/toggle', ['admin'], toggleAnnouncementHandler);
  r.post('/admin/announcements/:id/delete', ['admin'], deleteAnnouncementHandler);

  r.get('/admin/enquiries', ['admin'], enquiriesPage);
  r.post('/admin/enquiries/:id/status', ['admin'], enquiryStatusHandler);

  r.get('/admin/settings', ['admin'], (ctx) => settingsPage(ctx));
  r.post('/admin/settings', ['admin'], updateSettingsHandler);

  r.get('/admin/live', ['admin'], (ctx) => {
    subscribe(ctx.res, ['enquiry']);
    return HANDLED;
  });
}
