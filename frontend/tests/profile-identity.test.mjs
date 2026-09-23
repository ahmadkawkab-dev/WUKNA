import assert from 'node:assert/strict';
import test from 'node:test';
import { identityLabel } from '../src/features/profile/identity.ts';

test('profile identity prefers display name, then username, then email', () => {
  assert.equal(identityLabel({ displayName: '  Ahmad K. ', username: 'ahmad', email: 'ahmad@example.com' }), 'Ahmad K.');
  assert.equal(identityLabel({ displayName: '  ', username: 'ahmad', email: 'ahmad@example.com' }), 'ahmad');
  assert.equal(identityLabel({ email: 'ahmad@example.com' }), 'ahmad@example.com');
  assert.equal(identityLabel({}), 'Wukna user');
});
