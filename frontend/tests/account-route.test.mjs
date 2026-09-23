import assert from 'node:assert/strict';
import test from 'node:test';
import { accountSectionForPath } from '../src/features/account/accountRoute.ts';

test('account sections resolve from addressable paths', () => {
  assert.equal(accountSectionForPath('/account/profile'), 'profile');
  assert.equal(accountSectionForPath('/account/preferences'), 'preferences');
  assert.equal(accountSectionForPath('/account'), 'profile');
  assert.equal(accountSectionForPath('/boards'), null);
});
