import { Router } from 'express';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { rateLimit } from 'express-rate-limit';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { validateProfile } from './profile.js';
import { SESSION_SECONDS, createSession, getUserForToken, hashPassword, hashToken, publicUser, readToken, validateCredentials } from './service.js';

export const authRouter = Router();
let ready = false;
export async function initializeAuth() {
  await Promise.all([User.init(), Session.init()]);
  ready = true;
}
// A comparable password verification path for unknown email addresses.
const dummyHash = hashPassword('unused-random-dummy-password-for-timing');

authRouter.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  if (!ready || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'Акаунти тимчасово недоступні. Можна продовжити гру як гість.' });
  next();
});
const attempts = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Забагато спроб. Спробуй пізніше.' } });
const emailAttempts = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  keyGenerator: (req) => hashToken(typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'invalid'),
  message: { message: 'Забагато спроб для цієї пошти. Спробуй через 15 хвилин.' } });

for (const mode of ['register', 'login']) {
  authRouter.post('/' + mode, attempts, emailAttempts, async (req, res) => {
    const values = validateCredentials(req.body, mode === 'register');
    if (!values) return res.status(400).json({ message: mode === 'register' ? 'Перевір ім’я, email і збіг паролів. Пароль має містити 15–128 символів.' : 'Введи коректний email і пароль.' });
    try {
      let user;
      if (mode === 'register') {
        user = await User.create({ email: values.email, name: values.name, passwordHash: await hashPassword(values.password) });
      } else {
        user = await User.findOne({ email: values.email }).select('+passwordHash');
        const valid = await argon2.verify(user?.passwordHash || await dummyHash, values.password);
        if (!user || !valid) return res.status(401).json({ message: 'Неправильна пошта або пароль.' });
      }
      const token = await createSession(user.id);
      // Revoke the previous browser session after successfully creating its replacement.
      const previous = readToken(req);
      if (previous) await Session.deleteOne({ tokenHash: hashToken(previous) });
      return res.status(mode === 'register' ? 201 : 200).json({ user: publicUser(user), token, expiresIn: SESSION_SECONDS });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'Не вдалося створити акаунт із цією поштою. Спробуй увійти.' });
      return res.status(503).json({ message: 'Не вдалося завершити запит. Спробуй пізніше.' });
    }
  });
}
authRouter.get('/me', async (req, res) => {
  const user = await getUserForToken(readToken(req));
  if (!user) return res.status(401).json({ message: 'Увійди в акаунт.' });
  res.json({ user: publicUser(user) });
});
authRouter.post('/profile', attempts, async (req, res) => {
  const user = await getUserForToken(readToken(req));
  if (!user) return res.status(401).json({ message: 'Увійди в акаунт.' });
  const values = validateProfile(req.body);
  if (!values) return res.status(400).json({ message: 'Некоректне ім’я або аватарка.' });
  const updated = await User.findByIdAndUpdate(user.id, { $set: values }, { new: true, runValidators: true });
  if (!updated) return res.status(401).json({ message: 'Увійди в акаунт.' });
  res.json({ user: publicUser(updated) });
});
authRouter.post('/logout', async (req, res) => {
  const token = readToken(req);
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
  res.json({ ok: true });
});
authRouter.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(503).json({ message: 'Сервіс акаунтів тимчасово недоступний.' });
});
