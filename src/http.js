import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const MAX_BODY = 8 * 1024 * 1024;

export const HANDLED = Symbol('handled');

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function attr(value) {
  return esc(value);
}

export function html(body, status = 200, headers = {}) {
  return { type: 'html', body, status, headers };
}

export function redirect(location, status = 303, headers = {}) {
  return { type: 'redirect', location, status, headers };
}

export function sendBinary(buffer, contentType, filename, download = false) {
  return {
    type: 'binary',
    body: buffer,
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename.replace(/["\r\n]/g, '')}"`,
    },
  };
}

export function sendFile(res, buffer, contentType, filename, download = false) {
  const result = sendBinary(buffer, contentType, filename, download);
  writeResult(res, result);
}

export function writeResult(res, result) {
  if (!result) return;
  if (result.type === 'redirect') {
    res.writeHead(result.status, { Location: result.location, ...result.headers });
    res.end();
    return;
  }
  const headers = { ...result.headers };
  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'text/html; charset=utf-8';
  }
  headers['X-Content-Type-Options'] = 'nosniff';
  headers['Referrer-Policy'] = 'same-origin';
  headers['Cache-Control'] = headers['Cache-Control'] || 'no-store';
  res.writeHead(result.status || 200, headers);
  res.end(result.body);
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

export function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    if (!key) return;
    out[key] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return out;
}

export function setCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.clear) parts.push('Max-Age=0');
  return parts.join('; ');
}

function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = {};
  const delimiter = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(delimiter);
  while (cursor !== -1) {
    let start = cursor + delimiter.length;
    if (buffer.subarray(start, start + 2).toString() === '--') break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const next = buffer.indexOf(delimiter, start);
    if (next === -1) break;
    let part = buffer.subarray(start, next);
    if (part.subarray(-2).toString() === '\r\n') part = part.subarray(0, -2);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      cursor = next;
      continue;
    }
    const rawHeaders = part.subarray(0, headerEnd).toString('utf8');
    const data = part.subarray(headerEnd + 4);
    const nameMatch = /name="([^"]*)"/i.exec(rawHeaders);
    const fileMatch = /filename="([^"]*)"/i.exec(rawHeaders);
    const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders);
    if (nameMatch) {
      const name = nameMatch[1];
      if (fileMatch && fileMatch[1]) {
        files[name] = {
          filename: path.basename(fileMatch[1]),
          contentType: (typeMatch ? typeMatch[1].trim() : 'application/octet-stream'),
          data,
        };
      } else {
        fields[name] = data.toString('utf8');
      }
    }
    cursor = next;
  }
  return { fields, files };
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        const boundary = /boundary=([^;]+)/i.exec(contentType);
        if (!boundary) return resolve({ fields: {}, files: {} });
        return resolve(parseMultipart(buffer, boundary[1].trim().replace(/^"|"$/g, '')));
      }
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(buffer.toString('utf8'));
        const fields = {};
        for (const [key, value] of params) fields[key] = value;
        return resolve({ fields, files: {} });
      }
      return resolve({ fields: {}, files: {} });
    });
    req.on('error', reject);
  });
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function mimeFor(name) {
  return mimeTypes[path.extname(name).toLowerCase()] || 'application/octet-stream';
}

export function servePublic(res, pathname) {
  const relative = pathname.replace(/^\/assets\//, '');
  const target = path.resolve(config.publicDir, relative);
  if (!target.startsWith(config.publicDir + path.sep)) {
    res.writeHead(404).end('Not found');
    return true;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;
  const body = fs.readFileSync(target);
  res.writeHead(200, {
    'Content-Type': mimeFor(target),
    'Cache-Control': 'public, max-age=60',
  });
  res.end(body);
  return true;
}

export function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateOnly(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function fmtDate(value, style = 'long') {
  if (!value) return '—';
  const date = value instanceof Date ? value : parseDateOnly(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const options =
    style === 'short'
      ? { day: 'numeric', month: 'short' }
      : style === 'day'
        ? { weekday: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('en-GB', options).format(date);
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const normalised = String(value).replace(' ', 'T');
  const date = new Date(normalised);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function fmtTime(value) {
  if (!value) return '—';
  const [h, m] = String(value).split(':').map(Number);
  if (Number.isNaN(h)) return value;
  const date = new Date(2000, 0, 1, h, m || 0);
  return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function daysUntil(value) {
  const date = parseDateOnly(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}

export function fmtCountdown(value) {
  const days = daysUntil(value);
  if (days === null) return '';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 0) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

export function gradeFor(score) {
  const value = Number(score || 0);
  if (value >= 80) return 'A';
  if (value >= 75) return 'A-';
  if (value >= 70) return 'B+';
  if (value >= 65) return 'B';
  if (value >= 60) return 'B-';
  if (value >= 55) return 'C+';
  if (value >= 50) return 'C';
  if (value >= 45) return 'C-';
  if (value >= 40) return 'D+';
  if (value >= 35) return 'D';
  if (value >= 30) return 'D-';
  return 'E';
}

export function gradeTone(score) {
  const g = gradeFor(score);
  if (g.startsWith('A') || g.startsWith('B')) return 'good';
  if (g.startsWith('C')) return 'warn';
  return 'bad';
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function nl2br(value) {
  return esc(value).replace(/\r?\n/g, '<br>');
}

export function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
