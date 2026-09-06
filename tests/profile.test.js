import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../src/auth/profile.js';

test('profile accepts a trimmed name and avatar removal, ignoring protected fields', () => {
  assert.deepEqual(validateProfile({ name: '  Олег  ', avatar: null, email: 'other@example.com', userId: 'other' }), { name: 'Олег', avatar: null });
});
test('profile rejects invalid names, remote URLs, active image formats and oversized data', () => {
  for (const name of ['', ' ', 'a', 'a'.repeat(33), { $ne: null }]) assert.equal(validateProfile({ name, avatar: null }), null);
  for (const avatar of [undefined, {}, 'https://example.com/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,YWJj', 'data:image/jpeg;base64,' + 'A'.repeat(65536)]) {
    assert.equal(validateProfile({ name: 'Олег', avatar }), null);
  }
});
