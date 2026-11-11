import { config } from '../config.js';
import { calendarSettings, listStaff } from '../data.js';
import { esc, fmtDate, html } from '../http.js';
import { avatar, badge, calendarCard, icon, layout, panel, roleLabels } from '../views.js';

export function register(r) {
  r.get('/bom', ['bom'], (ctx) => {
    const calendar = calendarSettings();
    const board = listStaff().filter((member) => member.role === 'bom');
    const leaders = ctx.db
      .prepare(
        `SELECT name, role, position, email FROM users
         WHERE role IN ('principal', 'deputy_boarding', 'deputy_academics', 'dos')
         ORDER BY CASE role WHEN 'principal' THEN 1 WHEN 'deputy_academics' THEN 2 WHEN 'deputy_boarding' THEN 3 ELSE 4 END`
      )
      .all();
    return html(
      layout(
        ctx,
        'Board of Management',
        `<section class="welcome">
          <div>
            <h2>Welcome, ${esc(ctx.user.name)}.</h2>
            <p>${esc(ctx.user.position || 'Board member')} · ${esc(config.school)}</p>
          </div>
          <a class="btn gold" href="/timetable/exam">${icon('calendar')} Exam timetable</a>
        </section>
        <div class="notice">${icon('shield')}<div><strong>Observer access.</strong> Board members can view the school calendar and examination timetable. Student records, staff files and financial data are restricted to the school leadership.</div></div>
        <div style="height:20px"></div>
        ${panel({
          title: `${calendar.term || config.term} ${calendar.year || config.year}`,
          subtitle: 'Term dates and examination window',
          actions: `<a class="btn small ghost" href="/calendar">Full calendar</a>`,
          body: calendarCard(calendar),
        })}
        <div class="grid-2">
          ${panel({
            title: 'Board members',
            body: `<div class="list">${board
              .map(
                (member) => `<div class="list-item">${avatar(member.name)}<div class="list-copy"><strong>${esc(member.name)}</strong><small>${esc(member.position || 'Member')} · ${esc(member.email)}</small></div>${badge('BOM', 'gold')}</div>`
              )
              .join('')}</div>`,
          })}
          ${panel({
            title: 'School leadership',
            body: `<div class="list">${leaders
              .map(
                (leader) => `<div class="list-item">${avatar(leader.name)}<div class="list-copy"><strong>${esc(leader.name)}</strong><small>${esc(leader.position || roleLabels[leader.role])} · ${esc(leader.email)}</small></div></div>`
              )
              .join('')}</div>`,
          })}
        </div>
        ${panel({
          title: 'Examination period',
          subtitle: 'Visible to all parties except support staff',
          body: `<div class="list">
            <div class="list-item"><span class="material-icon">${icon('calendar')}</span><div class="list-copy"><strong>Exams begin</strong><small>${calendar.exam_start ? esc(fmtDate(calendar.exam_start)) : 'Not set'}</small></div></div>
            <div class="list-item"><span class="material-icon">${icon('book')}</span><div class="list-copy"><strong>Exams end</strong><small>${calendar.exam_end ? esc(fmtDate(calendar.exam_end)) : 'Not set'}</small></div></div>
            <div class="list-item"><span class="material-icon">${icon('clipboard')}</span><div class="list-copy"><strong>Full timetable</strong><small><a href="/timetable/exam">Open the published exam schedule</a></small></div></div>
          </div>`,
        })}`,
        { active: '/bom' }
      )
    );
  });
}
