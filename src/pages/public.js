import { config } from '../config.js';
import { roleHome } from '../auth.js';
import { calendarSettings } from '../data.js';
import { HANDLED, clientIp, esc, fmtDate, html, redirect } from '../http.js';
import { broadcast, subscribe } from '../events.js';
import {
  createEnquiry,
  getPublishedAnnouncement,
  listPublishedAnnouncements,
} from '../public-data.js';
import { icon } from '../views.js';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/academics', label: 'Academics' },
  { href: '/admissions', label: 'Admissions' },
  { href: '/news', label: 'News' },
  { href: '/contact', label: 'Contact' },
];

const enquiryHits = new Map();
const ENQUIRY_LIMIT = 6;
const ENQUIRY_WINDOW = 60 * 60 * 1000;

function enquiryBlocked(ip) {
  const now = Date.now();
  const hits = (enquiryHits.get(ip) || []).filter((time) => now - time < ENQUIRY_WINDOW);
  hits.push(now);
  enquiryHits.set(ip, hits);
  if (enquiryHits.size > 2000) {
    for (const [key, times] of enquiryHits) {
      if (!times.some((time) => now - time < ENQUIRY_WINDOW)) enquiryHits.delete(key);
    }
  }
  return hits.length > ENQUIRY_LIMIT;
}

function siteFlash(query = {}) {
  let out = '';
  if (query.ok) out += `<div class="site-flash success">${icon('check')}<span>${esc(query.ok)}</span></div>`;
  if (query.err) out += `<div class="site-flash error">${icon('alert')}<span>${esc(query.err)}</span></div>`;
  return out;
}

function prose(value) {
  return String(value || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function siteLayout(ctx, { title, description, active, body }) {
  const nav = NAV.map(
    (item) => `<a href="${item.href}" ${active === item.href ? 'class="active" aria-current="page"' : ''}>${esc(item.label)}</a>`
  ).join('');
  const portalHref = ctx.user ? roleHome[ctx.user.role] || '/login' : '/login';
  const portalLabel = ctx.user ? 'My portal' : 'Portal sign-in';
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · ${esc(config.school)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="stylesheet" href="/assets/app.css?v=6">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f3d5c'/%3E%3Ctext x='32' y='44' font-family='Georgia' font-size='34' fill='%23e3b552' text-anchor='middle'%3EM%3C/text%3E%3C/svg%3E">
  <script src="/assets/public-live.js?v=6" defer></script>
</head>
<body class="site-body">
  <a class="site-skip" href="#site-main">Skip to content</a>
  <div class="site-topbar">
    <div class="site-wrap">
      <span>${icon('phone', 'icon tiny')}${esc(config.phone)}</span>
      <span>${icon('mail', 'icon tiny')}${esc(config.email)}</span>
      <a href="${portalHref}" class="site-topbar-portal">${icon('user', 'icon tiny')}${esc(portalLabel)}</a>
    </div>
  </div>
  <header class="site-head">
    <div class="site-wrap site-head-inner">
      <a class="site-brand" href="/">
        <span class="crest">M</span>
        <span><strong>${esc(config.school)}</strong><small>${esc(config.motto)}</small></span>
      </a>
      <nav class="site-nav" aria-label="School website">${nav}</nav>
      <a class="btn site-cta" href="/admissions">Apply / enquire ${icon('arrow')}</a>
    </div>
  </header>
  <main id="site-main">${siteFlash(ctx.query)}${body}</main>
  <footer class="site-footer">
    <div class="site-wrap site-foot-grid">
      <div class="site-foot-brand">
        <span class="crest">M</span>
        <strong>${esc(config.school)}</strong>
        <p>${esc(config.motto)}</p>
      </div>
      <div>
        <h3>Explore</h3>
        <a href="/about">About the school</a>
        <a href="/academics">Academics</a>
        <a href="/admissions">Admissions</a>
        <a href="/news">News &amp; notices</a>
        <a href="/contact">Contact us</a>
      </div>
      <div>
        <h3>Visit us</h3>
        <p>${esc(config.address)}</p>
        <p>${esc(config.phone)}</p>
        <p>${esc(config.email)}</p>
      </div>
      <div>
        <h3>School portal</h3>
        <p>Students, parents and staff sign in with the account issued by the school administrator.</p>
        <a class="site-foot-portal" href="/login">${icon('user', 'icon tiny')}Portal sign-in</a>
      </div>
    </div>
    <div class="site-wrap site-foot-base">
      <span>&copy; ${year} ${esc(config.school)}</span>
      <span>${esc(config.term)} · ${config.year}</span>
    </div>
  </footer>
</body>
</html>`;
}

function newsCard(item) {
  const date = fmtDate(item.published_at || item.created_at);
  return `<article class="news-card">
    <div class="news-card-top">
      <span class="news-cat">${esc(item.category)}</span>
      ${Number(item.pinned) ? '<span class="news-pin">Pinned</span>' : ''}
    </div>
    <h3><a href="/news/${item.id}">${esc(item.title)}</a></h3>
    <p>${esc(item.summary)}</p>
    <div class="news-meta"><span>${icon('calendar', 'icon tiny')}${esc(date)}</span><a href="/news/${item.id}">Read more ${icon('arrowRight', 'icon tiny')}</a></div>
  </article>`;
}

function newsCards(items, limit, emptyMessage) {
  const visible = items.slice(0, limit);
  if (!visible.length) {
    return `<div class="news-empty" data-news-empty>${icon('inbox')}<p>${esc(emptyMessage)}</p></div>`;
  }
  return visible.map(newsCard).join('');
}

function termDates(calendar) {
  const range = (start, end) => {
    if (!start && !end) return 'To be announced';
    if (start && end) return `${fmtDate(start)} — ${fmtDate(end)}`;
    return fmtDate(start || end);
  };
  return {
    opening: fmtDate(calendar.opening_date),
    closing: fmtDate(calendar.closing_date),
    exams: range(calendar.exam_start, calendar.exam_end),
    term: `${calendar.term || config.term} · ${calendar.year || config.year}`,
  };
}

function homePage(ctx) {
  const news = listPublishedAnnouncements({ limit: 3 });
  const dates = termDates(calendarSettings());
  return html(
    siteLayout(ctx, {
      title: 'Welcome',
      description:
        'MUKHAWELI SCHOOL is a day and boarding secondary school in Nairobi, Kenya, offering Form 1 to Form 4 education.',
      active: '/',
      body: `<section class="site-hero">
        <div class="site-wrap site-hero-grid">
          <div class="site-hero-copy">
            <p class="site-kicker"><span class="dot"></span>${esc(dates.term)}</p>
            <h1>A school where knowledge meets <span>character.</span></h1>
            <p class="site-lede">${esc(config.school)} is a day and boarding secondary school in Nairobi, forming confident learners through rigorous academics, strong values and personal support.</p>
            <div class="site-actions">
              <a class="btn gold" href="/admissions">Explore admissions ${icon('arrow')}</a>
              <a class="btn ghost site-ghost" href="/contact">Contact the school</a>
            </div>
            <ul class="site-hero-points">
              <li>${icon('check', 'icon tiny')}Form 1 to Form 4</li>
              <li>${icon('check', 'icon tiny')}Boarding and day places</li>
              <li>${icon('check', 'icon tiny')}A single portal for families and staff</li>
            </ul>
          </div>
          <aside class="site-hero-card">
            <span class="crest">M</span>
            <p class="site-card-label">${esc(dates.term)}</p>
            <h2>At a glance</h2>
            <dl class="site-date-list">
              <div><dt>Opening day</dt><dd>${esc(dates.opening)}</dd></div>
              <div><dt>Closing day</dt><dd>${esc(dates.closing)}</dd></div>
              <div><dt>Examinations</dt><dd>${esc(dates.exams)}</dd></div>
            </dl>
            <a class="btn site-card-btn" href="${ctx.user ? roleHome[ctx.user.role] || '/login' : '/login'}">${ctx.user ? 'Open my portal' : 'Sign in to the portal'} ${icon('arrow')}</a>
            <p class="site-card-note">Accounts are issued by the school administrator after admission or employment.</p>
          </aside>
        </div>
      </section>

      <section class="site-section">
        <div class="site-wrap">
          <div class="site-section-head">
            <div><p class="site-eyebrow">From the school office</p><h2>News &amp; notices</h2></div>
            <a class="site-text-link" href="/news">All news ${icon('arrowRight', 'icon tiny')}</a>
          </div>
          <div class="news-grid" id="latest-news" data-news-limit="3" data-news-empty="School announcements will appear here once the office publishes them." data-public-live>
            ${newsCards(news, 3, 'School announcements will appear here once the office publishes them.')}
          </div>
        </div>
      </section>

      <section class="site-section alt">
        <div class="site-wrap">
          <div class="site-section-head">
            <div><p class="site-eyebrow">Why Mukhaweli</p><h2>An education with roots and reach.</h2></div>
          </div>
          <div class="site-feature-grid">
            <article class="site-feature">
              <span class="site-feature-icon">${icon('award')}</span>
              <h3>Academic rigour</h3>
              <p>A broad curriculum, careful assessment and teaching that stretches every learner towards their best.</p>
            </article>
            <article class="site-feature">
              <span class="site-feature-icon">${icon('building')}</span>
              <h3>Boarding &amp; welfare</h3>
              <p>Safe, structured boarding with resident staff, clear routines and personal attention for every student.</p>
            </article>
            <article class="site-feature">
              <span class="site-feature-icon">${icon('users')}</span>
              <h3>Character &amp; service</h3>
              <p>Knowledge, integrity and service shape daily life through leadership, clubs and community involvement.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="site-section">
        <div class="site-wrap site-split">
          <div>
            <p class="site-eyebrow">A connected school</p>
            <h2>Families stay close to learning.</h2>
            <p class="site-body-copy">Every admitted student, parent or guardian receives a portal account from the school administrator. Results, fee balances, term dates and school notices are available in one private place.</p>
            <ul class="site-check-list">
              <li>${icon('check', 'icon tiny')}Students follow results, timetables and revision materials.</li>
              <li>${icon('check', 'icon tiny')}Parents see their own children's fees and receipts.</li>
              <li>${icon('check', 'icon tiny')}Staff manage classes, marks and school communication.</li>
            </ul>
            <a class="btn ghost" href="/login">${icon('user')} Go to the portal sign-in</a>
          </div>
          <div class="site-callout">
            <span class="site-feature-icon">${icon('shield')}</span>
            <h3>No self-registration</h3>
            <p>Portal accounts are created only by the school administrator. If you need access, contact the school office on ${esc(config.phone)}.</p>
            <a class="site-text-link" href="/contact">Contact the office ${icon('arrowRight', 'icon tiny')}</a>
          </div>
        </div>
      </section>

      <section class="site-cta-band">
        <div class="site-wrap site-cta-inner">
          <div><p class="site-eyebrow">Join the community</p><h2>Ready to learn at Mukhaweli?</h2></div>
          <div class="site-actions">
            <a class="btn gold" href="/admissions">Start an admission enquiry ${icon('arrow')}</a>
            <a class="btn ghost site-ghost" href="/about">About the school</a>
          </div>
        </div>
      </section>`,
    })
  );
}

function aboutPage(ctx) {
  return html(
    siteLayout(ctx, {
      title: 'About us',
      description: 'The story, mission and values of MUKHAWELI SCHOOL.',
      active: '/about',
      body: `<section class="site-page-hero">
        <div class="site-wrap">
          <p class="site-eyebrow">About the school</p>
          <h1>A community built around every learner.</h1>
          <p class="site-lede">${esc(config.school)} exists to help young people grow in knowledge, integrity and service — in the classroom, in the boarding house and in the wider community.</p>
        </div>
      </section>
      <section class="site-section">
        <div class="site-wrap site-split">
          <div>
            <h2>Our story</h2>
            <p class="site-body-copy">${esc(config.school)} is a secondary school in ${esc(config.address)}. We serve day and boarding students from Form 1 to Form 4, with a staff team committed to careful teaching, honest feedback and the wellbeing of every learner.</p>
            <p class="site-body-copy">Our motto — ${esc(config.motto)} — is not a slogan on a wall. It shapes how we teach, how we correct, how we celebrate achievement and how we serve the community around us.</p>
            <h2 style="margin-top:28px">Our mission</h2>
            <p class="site-body-copy">To provide a rigorous, caring secondary education that equips every student with the knowledge, skills and character to serve their community with integrity.</p>
            <h2 style="margin-top:28px">Our vision</h2>
            <p class="site-body-copy">A school recognised for academic seriousness, strong values and graduates who contribute meaningfully wherever they go.</p>
          </div>
          <aside class="site-value-card">
            <p class="site-eyebrow">Our motto</p>
            <p class="site-motto">${esc(config.motto)}</p>
            <div class="site-value-list">
              <div><strong>Knowledge</strong><span>Curiosity, effort and disciplined study.</span></div>
              <div><strong>Integrity</strong><span>Honesty in work, conduct and relationships.</span></div>
              <div><strong>Service</strong><span>Using what we learn to strengthen others.</span></div>
              <div><strong>Respect</strong><span>Courtesy and dignity for every person.</span></div>
            </div>
          </aside>
        </div>
      </section>
      <section class="site-section alt">
        <div class="site-wrap">
          <div class="site-section-head"><div><p class="site-eyebrow">School life</p><h2>Facilities and support</h2></div></div>
          <div class="site-feature-grid">
            <article class="site-feature"><span class="site-feature-icon">${icon('book')}</span><h3>Learning spaces</h3><p>Classrooms, a library and science facilities designed for practical, focused learning.</p></article>
            <article class="site-feature"><span class="site-feature-icon">${icon('building')}</span><h3>Boarding houses</h3><p>Supervised boarding with resident staff, study time and clear daily routines.</p></article>
            <article class="site-feature"><span class="site-feature-icon">${icon('award')}</span><h3>Co-curricular life</h3><p>Sport, music, debate, leadership and service clubs that build confidence beyond the classroom.</p></article>
          </div>
        </div>
      </section>
      <section class="site-cta-band"><div class="site-wrap site-cta-inner">
        <div><p class="site-eyebrow">Visit us</p><h2>Come and see the school.</h2></div>
        <div class="site-actions"><a class="btn gold" href="/contact">Arrange a visit ${icon('arrow')}</a><a class="btn ghost site-ghost" href="/admissions">Admissions</a></div>
      </div></section>`,
    })
  );
}

function academicsPage(ctx) {
  const subjects = ctx.db.prepare('SELECT name FROM subjects ORDER BY name').all();
  const subjectChips = subjects.length
    ? subjects.map((row) => `<span class="site-chip">${esc(row.name)}</span>`).join('')
    : '<span class="site-chip">Subjects will be published soon</span>';
  return html(
    siteLayout(ctx, {
      title: 'Academics',
      description: 'The curriculum, subjects and academic support offered at MUKHAWELI SCHOOL.',
      active: '/academics',
      body: `<section class="site-page-hero">
        <div class="site-wrap">
          <p class="site-eyebrow">Academics</p>
          <h1>A broad, rigorous curriculum.</h1>
          <p class="site-lede">Careful teaching, regular assessment and honest feedback help every student build a strong academic foundation from Form 1 to Form 4.</p>
        </div>
      </section>
      <section class="site-section">
        <div class="site-wrap site-split">
          <div>
            <h2>What we teach</h2>
            <p class="site-body-copy">Our curriculum covers languages, mathematics, sciences, humanities, business and technical subjects. Students are prepared for national examinations while developing the study habits and confidence they need beyond school.</p>
            <div class="site-chip-row">${subjectChips}</div>
            <h2 style="margin-top:28px">How we teach</h2>
            <p class="site-body-copy">Lessons are planned around clear learning goals. Teachers use continuous assessment, revision and practical work to check understanding early and give students honest, useful feedback.</p>
          </div>
          <aside class="site-callout">
            <span class="site-feature-icon">${icon('clipboard')}</span>
            <h3>Assessment &amp; reporting</h3>
            <p>Students sit regular assessments and end-of-term examinations. Results are published through the school portal, where students and parents can follow progress privately.</p>
            <a class="site-text-link" href="/login">Portal sign-in ${icon('arrowRight', 'icon tiny')}</a>
          </aside>
        </div>
      </section>
      <section class="site-section alt">
        <div class="site-wrap">
          <div class="site-section-head"><div><p class="site-eyebrow">Beyond lessons</p><h2>Support for the whole learner</h2></div></div>
          <div class="site-feature-grid">
            <article class="site-feature"><span class="site-feature-icon">${icon('users')}</span><h3>Pastoral care</h3><p>Class teachers and boarding staff know each student and follow their academic and personal progress.</p></article>
            <article class="site-feature"><span class="site-feature-icon">${icon('book')}</span><h3>Revision &amp; study</h3><p>Structured revision, past papers and study time help students prepare steadily for examinations.</p></article>
            <article class="site-feature"><span class="site-feature-icon">${icon('award')}</span><h3>Co-curricular</h3><p>Sport, music, debate and service clubs develop teamwork, leadership and confidence.</p></article>
          </div>
        </div>
      </section>
      <section class="site-cta-band"><div class="site-wrap site-cta-inner">
        <div><p class="site-eyebrow">Admissions</p><h2>Join a serious learning community.</h2></div>
        <div class="site-actions"><a class="btn gold" href="/admissions">Enquire about a place ${icon('arrow')}</a></div>
      </div></section>`,
    })
  );
}

function admissionForm(values = {}, error = '') {
  return `<form method="post" action="/admissions/enquiry" class="site-form">
    ${error ? `<div class="site-flash error">${icon('alert')}<span>${esc(error)}</span></div>` : ''}
    <input type="text" name="website" class="site-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="site-form-grid">
      <div class="field"><label for="adm-name">Parent / guardian name</label><input id="adm-name" name="name" value="${esc(values.name || '')}" required autocomplete="name"></div>
      <div class="field"><label for="adm-email">Email address</label><input id="adm-email" name="email" type="email" value="${esc(values.email || '')}" required autocomplete="email"></div>
      <div class="field"><label for="adm-phone">Phone number</label><input id="adm-phone" name="phone" value="${esc(values.phone || '')}" autocomplete="tel" placeholder="+254 ..."></div>
      <div class="field"><label for="adm-subject">Enquiry type</label>
        <select id="adm-subject" name="subject" required>
          <option value="Form One admission" ${values.subject === 'Form One admission' ? 'selected' : ''}>Form One admission</option>
          <option value="Transfer admission" ${values.subject === 'Transfer admission' ? 'selected' : ''}>Transfer admission</option>
          <option value="Boarding place" ${values.subject === 'Boarding place' ? 'selected' : ''}>Boarding place</option>
          <option value="School visit" ${values.subject === 'School visit' ? 'selected' : ''}>School visit</option>
          <option value="General admission question" ${values.subject === 'General admission question' ? 'selected' : ''}>General admission question</option>
        </select>
      </div>
      <div class="field span-2"><label for="adm-message">Your message</label><textarea id="adm-message" name="message" rows="5" required placeholder="Tell us the student's current class, the year you are applying for, and any questions.">${esc(values.message || '')}</textarea></div>
    </div>
    <div class="site-form-foot">
      <p>This form sends an enquiry to the school office. It does not create a portal account.</p>
      <button class="btn" type="submit">Send enquiry ${icon('arrow')}</button>
    </div>
  </form>`;
}

function admissionsPage(ctx, { values = {}, error = '' } = {}) {
  return html(
    siteLayout(ctx, {
      title: 'Admissions',
      description: 'Admissions information and enquiries for MUKHAWELI SCHOOL.',
      active: '/admissions',
      body: `<section class="site-page-hero">
        <div class="site-wrap">
          <p class="site-eyebrow">Admissions</p>
          <h1>Admissions at Mukhaweli.</h1>
          <p class="site-lede">We admit students into Form 1 and accept transfers where places exist. Start with an enquiry — the school office will guide you through the next steps.</p>
        </div>
      </section>
      <section class="site-section">
        <div class="site-wrap site-split">
          <div>
            <h2>How to apply</h2>
            <ol class="site-steps">
              <li><span>1</span><div><strong>Send an enquiry</strong><p>Use the form on this page or call the school office.</p></div></li>
              <li><span>2</span><div><strong>Visit the school</strong><p>Meet the admissions team, tour the campus and ask questions.</p></div></li>
              <li><span>3</span><div><strong>Complete the application</strong><p>Provide the student's details, academic records and required documents.</p></div></li>
              <li><span>4</span><div><strong>Receive placement</strong><p>On admission, the school administrator creates the student and guardian portal accounts.</p></div></li>
            </ol>
            <h2 style="margin-top:28px">What to bring</h2>
            <ul class="site-check-list">
              <li>${icon('check', 'icon tiny')}A copy of the student's birth certificate.</li>
              <li>${icon('check', 'icon tiny')}Primary school leaving certificate or last school report.</li>
              <li>${icon('check', 'icon tiny')}Transfer letter, where applicable.</li>
              <li>${icon('check', 'icon tiny')}Parent or guardian contact details.</li>
            </ul>
            <div class="site-note">${icon('shield', 'icon tiny')}<p><strong>Portal accounts are not self-service.</strong> Students and parents receive portal logins from the school administrator once admission is confirmed.</p></div>
          </div>
          <div class="site-form-card">
            <h2>Start an enquiry</h2>
            <p>The school office receives your message immediately and will respond using the contact details you provide.</p>
            ${admissionForm(values, error)}
          </div>
        </div>
      </section>`,
    }),
    error ? 400 : 200
  );
}

function newsPage(ctx) {
  const news = listPublishedAnnouncements({ limit: 50 });
  return html(
    siteLayout(ctx, {
      title: 'News & notices',
      description: 'Announcements, events and notices from MUKHAWELI SCHOOL.',
      active: '/news',
      body: `<section class="site-page-hero">
        <div class="site-wrap">
          <p class="site-eyebrow">News &amp; notices</p>
          <h1>What is happening at school.</h1>
          <p class="site-lede">Notices, events and achievements published by the school office appear here immediately.</p>
        </div>
      </section>
      <section class="site-section">
        <div class="site-wrap">
          <div class="news-grid" id="news-list" data-news-limit="50" data-news-empty="No announcements have been published yet. Please check back soon." data-public-live>
            ${newsCards(news, 50, 'No announcements have been published yet. Please check back soon.')}
          </div>
        </div>
      </section>`,
    })
  );
}

function newsDetailPage(ctx) {
  const item = getPublishedAnnouncement(ctx.params.id);
  if (!item) {
    return html(
      siteLayout(ctx, {
        title: 'Announcement not found',
        description: 'The requested announcement is not available.',
        active: '/news',
        body: `<section class="site-page-hero"><div class="site-wrap"><p class="site-eyebrow">News &amp; notices</p><h1>Announcement not found.</h1><p class="site-lede">This notice may have been removed or is no longer published.</p></div></section>
        <section class="site-section"><div class="site-wrap"><a class="btn ghost" href="/news">${icon('arrowRight')} Back to all news</a></div></section>`,
      }),
      404
    );
  }
  return html(
    siteLayout(ctx, {
      title: item.title,
      description: item.summary,
      active: '/news',
      body: `<section class="site-page-hero">
        <div class="site-wrap site-article-head">
          <p class="site-eyebrow"><a href="/news">News &amp; notices</a> · ${esc(item.category)}</p>
          <h1>${esc(item.title)}</h1>
          <p class="site-article-meta">${icon('calendar', 'icon tiny')}${esc(fmtDate(item.published_at || item.created_at))}${Number(item.pinned) ? ' · Pinned notice' : ''}</p>
          <p class="site-lede">${esc(item.summary)}</p>
        </div>
      </section>
      <section class="site-section">
        <div class="site-wrap site-article">
          <div class="site-prose">${prose(item.body)}</div>
          <a class="btn ghost" href="/news">${icon('arrowRight')} Back to all news</a>
        </div>
      </section>`,
    })
  );
}

function contactForm(values = {}, error = '') {
  return `<form method="post" action="/contact" class="site-form">
    ${error ? `<div class="site-flash error">${icon('alert')}<span>${esc(error)}</span></div>` : ''}
    <input type="text" name="website" class="site-honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="site-form-grid">
      <div class="field"><label for="ct-name">Your name</label><input id="ct-name" name="name" value="${esc(values.name || '')}" required autocomplete="name"></div>
      <div class="field"><label for="ct-email">Email address</label><input id="ct-email" name="email" type="email" value="${esc(values.email || '')}" required autocomplete="email"></div>
      <div class="field"><label for="ct-phone">Phone number</label><input id="ct-phone" name="phone" value="${esc(values.phone || '')}" autocomplete="tel" placeholder="+254 ..."></div>
      <div class="field"><label for="ct-subject">Subject</label><input id="ct-subject" name="subject" value="${esc(values.subject || '')}" required></div>
      <div class="field span-2"><label for="ct-message">Message</label><textarea id="ct-message" name="message" rows="5" required>${esc(values.message || '')}</textarea></div>
    </div>
    <div class="site-form-foot">
      <p>We use your details only to respond to this enquiry.</p>
      <button class="btn" type="submit">Send message ${icon('arrow')}</button>
    </div>
  </form>`;
}

function contactPage(ctx, { values = {}, error = '' } = {}) {
  return html(
    siteLayout(ctx, {
      title: 'Contact us',
      description: 'Contact MUKHAWELI SCHOOL by phone, email or using the school enquiry form.',
      active: '/contact',
      body: `<section class="site-page-hero">
        <div class="site-wrap">
          <p class="site-eyebrow">Contact us</p>
          <h1>Talk to the school.</h1>
          <p class="site-lede">For admissions, visits, fees or general questions, contact the school office. We will respond using the details you give us.</p>
        </div>
      </section>
      <section class="site-section">
        <div class="site-wrap site-contact-grid">
          <div class="site-contact-cards">
            <article class="site-contact-card"><span class="site-feature-icon">${icon('phone')}</span><h3>Call</h3><p><a href="tel:${esc(config.phone.replace(/\s+/g, ''))}">${esc(config.phone)}</a></p><small>Monday to Friday, 8:00am – 4:30pm</small></article>
            <article class="site-contact-card"><span class="site-feature-icon">${icon('mail')}</span><h3>Email</h3><p><a href="mailto:${esc(config.email)}">${esc(config.email)}</a></p><small>We reply during school office hours.</small></article>
            <article class="site-contact-card"><span class="site-feature-icon">${icon('building')}</span><h3>Visit</h3><p>${esc(config.address)}</p><small>Please arrange visits in advance.</small></article>
            <article class="site-contact-card"><span class="site-feature-icon">${icon('clock')}</span><h3>Office hours</h3><p>Monday – Friday</p><small>8:00am – 4:30pm, term time</small></article>
          </div>
          <div class="site-form-card">
            <h2>Send a message</h2>
            <p>Your message is delivered straight to the school administrator's enquiry inbox.</p>
            ${contactForm(values, error)}
          </div>
        </div>
      </section>`,
    }),
    error ? 400 : 200
  );
}

function announceJson() {
  const items = listPublishedAnnouncements({ limit: 50 }).map((item) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    category: item.category,
    pinned: Number(item.pinned),
    date: fmtDate(item.published_at || item.created_at),
  }));
  return html(JSON.stringify({ items }), 200, { 'Content-Type': 'application/json; charset=utf-8' });
}

function submitEnquiry(kind) {
  return (ctx) => {
    const page = kind === 'admission' ? admissionsPage : contactPage;
    const base = kind === 'admission' ? '/admissions' : '/contact';
    if (String(ctx.fields.website || '').trim()) return redirect(`${base}?ok=Thank you. Your message has been received.`);
    const values = {
      name: String(ctx.fields.name || '').trim().slice(0, 120),
      email: String(ctx.fields.email || '').trim().toLowerCase().slice(0, 180),
      phone: String(ctx.fields.phone || '').trim().slice(0, 40),
      subject: String(ctx.fields.subject || '').trim().slice(0, 160),
      message: String(ctx.fields.message || '').trim().slice(0, 5000),
    };
    const fail = (message, status = 400) => ({ ...page(ctx, { values, error: message }), status });
    if (values.name.length < 2) return fail('Enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return fail('Enter a valid email address.');
    if (!values.subject) return fail('Choose or enter a subject.');
    if (values.message.length < 10) return fail('Please write a little more detail (at least 10 characters).');
    if (enquiryBlocked(clientIp(ctx.req))) {
      return fail('Too many messages have been sent from this connection. Please try again later.', 429);
    }
    const id = createEnquiry({ ...values, kind });
    broadcast('enquiry', { id, name: values.name, subject: values.subject, kind });
    return redirect(`${base}?ok=${encodeURIComponent('Thank you. Your message has been received by the school office.')}`);
  };
}

export function register(r) {
  r.get('/', ['public'], homePage);
  r.get('/about', ['public'], aboutPage);
  r.get('/academics', ['public'], academicsPage);
  r.get('/admissions', ['public'], (ctx) => admissionsPage(ctx));
  r.post('/admissions/enquiry', ['public'], submitEnquiry('admission'));
  r.get('/news', ['public'], newsPage);
  r.get('/news/:id', ['public'], newsDetailPage);
  r.get('/contact', ['public'], (ctx) => contactPage(ctx));
  r.post('/contact', ['public'], submitEnquiry('general'));

  r.get('/api/public/announcements', ['public'], announceJson);
  r.get('/api/public/live', ['public'], (ctx) => {
    subscribe(ctx.res, ['announcements']);
    return HANDLED;
  });
}
