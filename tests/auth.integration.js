import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { connectMongoDB } from '../src/db/connectMongoDB.js';
import { authRouter, initializeAuth } from '../src/auth/router.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { hashToken } from '../src/auth/service.js';

const email = `auth-test-${randomUUID()}@example.invalid`;
const password = 'integration-test-password-123';
let server;
let userId;
try {
  await connectMongoDB(); await initializeAuth();
  const app = express(); app.use(express.json()); app.use('/auth', authRouter);
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/auth`;
  const request = async (path, body, token) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const registration = await request('/register', { email, password, confirmPassword: password, name: 'Integration Test' });
  assert.equal(registration.status, 201);
  userId = registration.data.user.id;
  assert.equal('passwordHash' in registration.data.user, false);
  const stored = await User.findById(userId).select('+passwordHash');
  assert.match(stored.passwordHash, /^\$argon2id\$/);
  const session = await Session.findOne({ userId });
  assert.equal(session.tokenHash, hashToken(registration.data.token));
  assert.notEqual(session.tokenHash, registration.data.token);
  assert.equal((await request('/me')).status, 401);
  assert.equal((await request('/me', null, 'f'.repeat(64))).status, 401);
  assert.equal((await request('/me', null, registration.data.token)).data.user.id, userId);
  assert.equal((await request('/profile', { name: 'Updated', avatar: null })).status, 401);
  assert.equal((await request('/profile', { name: ' ', avatar: null }, registration.data.token)).status, 400);
  const updated = await request('/profile', { name: ' Updated ', avatar: null, email: 'other@example.invalid', userId: 'other' }, registration.data.token);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.user.name, 'Updated');
  assert.equal(updated.data.user.email, email);
  assert.equal(updated.data.user.id, userId);
  assert.equal((await request('/me', null, registration.data.token)).data.user.name, 'Updated');
  assert.equal((await request('/register', { email, password, confirmPassword: password, name: 'Test' })).status, 409);
  assert.equal((await request('/login', { email, password: 'incorrect-password' })).status, 401);
  const login = await request('/login', { email: email.toUpperCase(), password }, registration.data.token);
  assert.equal(login.status, 200);
  assert.equal((await request('/me', null, registration.data.token)).status, 401);
  assert.equal((await request('/logout', {}, login.data.token)).status, 200);
  assert.equal((await request('/me', null, login.data.token)).status, 401);
  const expiring = await request('/login', { email, password });
  await Session.updateOne({ tokenHash: hashToken(expiring.data.token) }, { expiresAt: new Date(0) });
  assert.equal((await request('/me', null, expiring.data.token)).status, 401);
  for (let i = 0; i < 11; i++) {
    const attempt = await request('/login', { email: `limit-${email}`, password });
    if (i === 10) assert.equal(attempt.status, 429);
  }
  console.log('PASS: registration, password/session hashes, duplicate email, login, invalid/expired sessions, rotation, logout and rate limit.');
} finally {
  if (!userId && mongoose.connection.readyState === 1) userId = (await User.findOne({ email }))?.id;
  if (userId) { await Session.deleteMany({ userId }); await User.deleteOne({ _id: userId, email }); }
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
}
