import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';

export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const hashPassword = (password) => argon2.hash(password, {
  type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
});
export const publicUser = (user) => ({
  id: user.id, email: user.email, name: user.name, avatar: user.avatar,
  createdAt: user.createdAt,
});
export function readToken(req) {
  const header = req.get('authorization') || '';
  return /^Bearer [a-f0-9]{64}$/.test(header) ? header.slice(7) : null;
}
export async function getUserForToken(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  return session ? User.findById(session.userId) : null;
}
export async function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  await Session.create({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) });
  return token;
}
export function validateCredentials(body, registering) {
  if (!body || typeof body !== 'object') return null;
  const { password } = body;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  if (typeof password !== 'string' || password.length < (registering ? 15 : 1) || password.length > 128) return null;
  if (registering && (name.length < 2 || name.length > 32 || body.confirmPassword !== password)) return null;
  return { email, password, name };
}
