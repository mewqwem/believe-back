import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { hashPassword, hashToken, validateCredentials } from '../src/auth/service.js';

test('passwords use salted Argon2id and verify only the correct password', async () => {
  const password = 'test-only-password-12345';
  const [a, b] = await Promise.all([hashPassword(password), hashPassword(password)]);
  assert.match(a, /^\$argon2id\$/);
  assert.notEqual(a, b);
  assert.equal(await argon2.verify(a, password), true);
  assert.equal(await argon2.verify(a, 'wrong-password'), false);
});
test('credentials reject injection, short passwords and mismatched confirmation', () => {
  const values = { name: ' Test ', email: ' TEST@example.com ', password: 'test-password-long', confirmPassword: 'test-password-long' };
  assert.equal(validateCredentials(values, true).email, 'test@example.com');
  assert.equal(validateCredentials(values, true).name, 'Test');
  for (const bad of [null, {}, { ...values, email: { $ne: null } }, { ...values, password: 'short' }, { ...values, confirmPassword: 'different' }, { ...values, name: ' ' }]) assert.equal(validateCredentials(bad, true), null);
  assert.notEqual(hashToken('a'.repeat(64)), 'a'.repeat(64));
});
