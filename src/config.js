import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';
const generatedAdminPassword = !process.env.ADMIN_PASSWORD && production;

export const config = {
  school: 'MUKHAWELI SCHOOL',
  shortName: 'Mukhaweli',
  motto: 'Knowledge · Integrity · Service',
  address: 'P.O. Box 2245, Nairobi, Kenya',
  phone: '+254 700 000 000',
  email: 'info@mukhaweli.ac.ke',
  domain: 'mukhaweli.ac.ke',
  studentDomain: 'student.mukhaweli.ac.ke',
  currency: 'KES',
  term: 'Term 3',
  year: 2026,
  examName: 'End of Term 3 2026',
  admin: {
    name: process.env.ADMIN_NAME || 'System Administrator',
    email: (process.env.ADMIN_EMAIL || 'admin@mukhaweli.ac.ke').trim().toLowerCase(),
    password:
      process.env.ADMIN_PASSWORD ||
      (generatedAdminPassword ? crypto.randomBytes(15).toString('base64url') : 'Mukhaweli@2026'),
    generatedPassword: generatedAdminPassword,
  },
  port: Number(process.env.PORT || 3000),
  sessionTtlMs: 12 * 60 * 60 * 1000,
  root,
  dataDir: path.join(root, 'data'),
  uploadDir: path.join(root, 'data', 'uploads'),
  publicDir: path.join(root, 'public'),
  dbFile: path.join(root, 'data', 'school.db'),
};

export function money(value) {
  const amount = Number(value || 0);
  return `KES ${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(amount)}`;
}
