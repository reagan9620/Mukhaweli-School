import { config } from '../config.js';
import {
  workerHistory,
  workerRecord,
  workerSignIn,
  workerSignOut,
} from '../data.js';
import { esc, fmtDate, fmtTime, html, redirect, todayISO } from '../http.js';
import { badge, icon, layout, panel, statCard, table } from '../views.js';

function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function duration(signIn, signOut) {
  if (!signIn || !signOut) return '—';
  const [ih, im] = signIn.split(':').map(Number);
  const [oh, om] = signOut.split(':').map(Number);
  const minutes = Math.max(0, oh * 60 + om - (ih * 60 + im));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function register(r) {
  r.get('/worker', ['worker'], (ctx) => {
    const today = todayISO();
    const record = workerRecord(ctx.user.id, today);
    const history = workerHistory(ctx.user.id, 7);
    const signedIn = !!record?.sign_in;
    const signedOut = !!record?.sign_out;
    const status = signedOut
      ? badge('Signed out', 'neutral')
      : signedIn
        ? badge('On duty', 'good')
        : badge('Not signed in', 'warn');
    const rows = history.map((row) => [
      `<span class="table-name">${esc(fmtDate(row.work_date))}</span>`,
      esc(fmtTime(row.sign_in)),
      esc(fmtTime(row.sign_out)),
      esc(duration(row.sign_in, row.sign_out)),
      row.sign_out ? badge('Complete', 'good') : row.sign_in ? badge('On duty', 'info') : badge('Missed', 'bad'),
    ]);
    return html(
      layout(
        ctx,
        'My attendance',
        `<section class="welcome">
          <div>
            <h2>${esc(ctx.user.name)}</h2>
            <p>${esc(ctx.user.position || 'Support staff')} · ${esc(fmtDate(new Date()))}</p>
          </div>
          <span class="pill-row" style="position:relative;z-index:1">${status}</span>
        </section>
        <div class="stats">
          ${statCard({ label: 'Status today', value: signedOut ? 'Complete' : signedIn ? 'On duty' : 'Not in', meta: esc(fmtDate(new Date())), iconName: 'user', tone: signedOut ? 'good' : signedIn ? 'good' : 'warn' })}
          ${statCard({ label: 'Signed in', value: esc(fmtTime(record?.sign_in)), meta: 'Duty start time', iconName: 'clock' })}
          ${statCard({ label: 'Signed out', value: esc(fmtTime(record?.sign_out)), meta: 'Duty end time', iconName: 'logout' })}
          ${statCard({ label: 'Hours today', value: esc(duration(record?.sign_in, record?.sign_out)), meta: 'Recorded duty hours', iconName: 'chart' })}
        </div>
        <div class="split">
          ${panel({
            title: 'Duty register',
            subtitle: 'Sign in when you report for work and sign out when you leave.',
            body: signedIn && !signedOut
              ? `<div class="notice">${icon('clock')}<div>You signed in at <strong>${esc(fmtTime(record.sign_in))}</strong>. Remember to sign out before leaving the school.</div></div>
                 <form method="post" action="/worker/signout" style="margin-top:16px">
                   <button class="btn danger" type="submit">${icon('logout')} Sign out now</button>
                 </form>`
              : signedOut
                ? `<div class="notice gold">${icon('check')}<div>Your duty record for today is complete: <strong>${esc(fmtTime(record.sign_in))} – ${esc(fmtTime(record.sign_out))}</strong> (${esc(duration(record.sign_in, record.sign_out))}).</div></div>`
                : `<div class="notice gold">${icon('clock')}<div>You have not signed in today. Please sign in as soon as you report for duty.</div></div>
                   <form method="post" action="/worker/signin" style="margin-top:16px">
                     <button class="btn" type="submit">${icon('check')} Sign in now</button>
                   </form>`,
          })}
          ${panel({
            title: 'How it works',
            body: `<div class="list">
              <div class="list-item"><span class="material-icon">${icon('clock')}</span><div class="list-copy"><strong>Sign in at the start of duty</strong><small>The Deputy Principal (Boarding) can see your arrival time.</small></div></div>
              <div class="list-item"><span class="material-icon">${icon('logout')}</span><div class="list-copy"><strong>Sign out when you leave</strong><small>Your duty hours are calculated automatically.</small></div></div>
              <div class="list-item"><span class="material-icon">${icon('shield')}</span><div class="list-copy"><strong>Restricted access</strong><small>Support staff accounts cannot open exam timetables, student reports or revision materials.</small></div></div>
            </div>`,
          })}
        </div>
        ${panel({
          title: 'Recent duty records',
          subtitle: `Last ${history.length} working days`,
          body: table(['Date', 'Signed in', 'Signed out', 'Hours', 'Status'], rows, { empty: 'No attendance records yet. Sign in to start your duty register.' }),
          flush: true,
        })}`,
        { active: '/worker' }
      )
    );
  });

  r.post('/worker/signin', ['worker'], (ctx) => {
    const result = workerSignIn(ctx.user.id, todayISO(), nowTime());
    return redirect(`/worker?${result.ok ? 'ok' : 'err'}=${encodeURIComponent(result.message)}`);
  });

  r.post('/worker/signout', ['worker'], (ctx) => {
    const result = workerSignOut(ctx.user.id, todayISO(), nowTime());
    return redirect(`/worker?${result.ok ? 'ok' : 'err'}=${encodeURIComponent(result.message)}`);
  });
}
