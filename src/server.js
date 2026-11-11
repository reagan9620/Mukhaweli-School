import http from 'node:http';
import { config } from './config.js';
import { getDb, initDb } from './db.js';
import { getSessionUser, pruneAuthTables } from './auth.js';
import {
  HANDLED,
  esc,
  html,
  parseCookies,
  readBody,
  redirect,
  servePublic,
  writeResult,
} from './http.js';
import { Router } from './router.js';
import { icon, panel, publicPage } from './views.js';
import { accessDenied, notFound } from './pages/shared.js';
import { register as registerPublic } from './pages/public.js';
import { register as registerAuth } from './pages/auth.js';
import { register as registerAdmin } from './pages/admin.js';
import { registerAdminSite } from './pages/admin-site.js';
import { registerShared } from './pages/shared.js';
import { register as registerPrincipal } from './pages/principal.js';
import { register as registerWorker } from './pages/worker.js';
import { register as registerBom } from './pages/bom.js';
import { register as registerBoarding } from './pages/boarding.js';
import { register as registerAcademics } from './pages/academics.js';
import { register as registerDos } from './pages/dos.js';
import { register as registerTeacher } from './pages/teacher.js';
import { register as registerStudent } from './pages/student.js';
import { register as registerParent } from './pages/parent.js';

initDb();
const db = getDb();

const router = new Router();
registerPublic(router);
registerAuth(router);
registerAdmin(router);
registerAdminSite(router);
registerShared(router);
registerPrincipal(router);
registerWorker(router);
registerBom(router);
registerBoarding(router);
registerAcademics(router);
registerDos(router);
registerTeacher(router);
registerStudent(router);
registerParent(router);

function queryObject(searchParams) {
  const query = {};
  for (const [key, value] of searchParams) query[key] = value;
  return query;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function publicNotFound() {
  return html(
    publicPage(
      'Page not found',
      `<div class="login" style="display:grid;place-items:center;min-height:100vh">
        <div style="max-width:440px;text-align:center">
          <span class="crest" style="margin:0 auto 16px">M</span>
          <h1 style="font-family:Georgia,serif">Page not found</h1>
          <p style="color:#6b7c90;margin:10px 0 20px">The page you requested does not exist or has moved.</p>
          <div class="public-404-actions">
            <a class="btn" href="/">Go to the school website</a>
            <a class="btn ghost" href="/login">Portal sign-in</a>
          </div>
        </div>
      </div>`
    ),
    404
  );
}

function serverError() {
  return html(
    publicPage(
      'Something went wrong',
      panel({
        title: 'Something went wrong',
        body: `<div class="notice gold">${icon('alert')}<div>The school portal hit an unexpected error. Please try again, or return to your dashboard.</div></div>
          <div style="margin-top:16px"><a class="btn ghost" href="/dashboard">Back to my portal</a></div>`,
      })
    ),
    500
  );
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    if (method === 'GET' || method === 'HEAD') {
      if (pathname === '/favicon.ico') {
        res.writeHead(204).end();
        return;
      }
      if (pathname.startsWith('/assets/')) {
        if (servePublic(res, pathname)) return;
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
    }

    const match = router.match(method, pathname);
    const cookies = parseCookies(req.headers.cookie || '');
    const user = getSessionUser(db, cookies.sid);
    const ctx = {
      req,
      res,
      db,
      user,
      sessionToken: cookies.sid || null,
      pathname,
      method,
      query: queryObject(url.searchParams),
      params: match ? match.params : {},
      fields: {},
      files: {},
    };

    const loginPath =
      pathname === '/admin' || pathname.startsWith('/admin/') ? '/admin/login' : '/login';

    if (user && Number(user.must_change_password) === 1) {
      const exempt =
        pathname === '/account/password' ||
        pathname === '/logout' ||
        pathname.startsWith('/assets/');
      if (!exempt) {
        return writeResult(res, redirect('/account/password'));
      }
    }

    if (!match) {
      writeResult(res, user ? notFound(ctx) : publicNotFound());
      return;
    }

    const roles = match.route.roles;
    if (roles === null && !user) {
      return writeResult(res, {
        type: 'redirect',
        status: 303,
        location: `${loginPath}?next=${encodeURIComponent(pathname + url.search)}`,
        headers: {},
      });
    }
    if (roles !== null && !roles.includes('public')) {
      if (!user) {
        return writeResult(res, {
          type: 'redirect',
          status: 303,
          location: `${loginPath}?next=${encodeURIComponent(pathname + url.search)}`,
          headers: {},
        });
      }
      if (!roles.includes(user.role)) {
        if (roles.length === 1 && roles[0] === 'admin') {
          writeResult(res, notFound(ctx));
          return;
        }
        writeResult(res, accessDenied(ctx));
        return;
      }
    }

    if (method === 'POST') {
      if (!sameOrigin(req)) {
        writeResult(res, html(panel({ title: 'Request blocked', body: '<p class="muted">Cross-origin form submissions are not accepted.</p>' }), 403));
        return;
      }
      try {
        const body = await readBody(req);
        ctx.fields = body.fields;
        ctx.files = body.files;
      } catch (error) {
        const tooLarge = /too large/i.test(error.message);
        writeResult(
          res,
          html(panel({ title: 'Request rejected', body: `<p class="muted">${esc(tooLarge ? 'The uploaded content is too large (8 MB limit).' : 'The form could not be read.')}</p>` }), tooLarge ? 413 : 400)
        );
        return;
      }
    }

    let result = await match.route.handler(ctx);
    if (result === HANDLED) return;
    if (result === undefined || result === null) result = user ? notFound(ctx) : publicNotFound();
    writeResult(res, result);
  } catch (error) {
    console.error(`[${req.method}] ${req.url}`, error);
    try {
      writeResult(res, serverError());
    } catch {
      res.writeHead(500).end('Server error');
    }
  }
});

setInterval(() => pruneAuthTables(db), 60 * 60 * 1000).unref();

server.listen(config.port, () => {
  console.log(`${config.school} portal running at http://localhost:${config.port}`);
  console.log(`Administrator console: http://localhost:${config.port}/admin/login`);
});
