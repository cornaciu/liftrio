import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsVisitorKey, recordVisit, recordConversion, SESSION_GAP } from './analytics.js';

const id = 'cd02a4ba-9239-4ffa-8aee-06a14f6a284a';
const start = 1790790000000;

test('visitor keys accept only random UUIDs and store an HMAC, not the browser token', () => {
  const key = analyticsVisitorKey(id, 'secret');
  assert.match(key, /^analytics:visitor:[a-f0-9]{64}$/);
  assert.equal(key.includes(id), false);
  assert.equal(key, analyticsVisitorKey(id.toUpperCase(), 'secret'));
  assert.notEqual(key, analyticsVisitorKey(id, 'different secret'));
  for (const value of [null, '', 'Cornaciu', 'state:abc', {}, id + 'x']) assert.equal(analyticsVisitorKey(value, 'secret'), null);
});

test('landing, guest entry, reloads and route changes share one session', () => {
  const landing = recordVisit(null, 'landing', start);
  const guest = recordVisit(landing, 'guest', start + 1000);
  const reload = recordVisit(guest, 'guest', start + 2000);
  assert.equal(reload.sessions, 1);
  assert.equal(reload.guestSessions, 1);
  assert.equal(reload.firstGuestAt, start + 1000);
  assert.equal(reload.lastGuestAt, start + 2000);
  assert.equal(landing.guestSessions, 0);
});

test('only 30 minutes of inactivity makes a returning guest session', () => {
  const first = recordVisit(null, 'guest', start);
  const active = recordVisit(first, 'guest', start + SESSION_GAP - 1);
  assert.equal(active.guestSessions, 1);
  const returningLanding = recordVisit(active, 'landing', active.lastSeen + SESSION_GAP);
  assert.equal(returningLanding.sessions, 2);
  assert.equal(returningLanding.guestSessions, 1);
  const returningGuest = recordVisit(returningLanding, 'guest', returningLanding.lastSeen + 100);
  assert.equal(returningGuest.guestSessions, 2);
  assert.equal(returningGuest.firstGuestAt, start);
});

test('conversions count once and require guest usage', () => {
  assert.equal(recordConversion(null, start), null);
  const landing = recordVisit(null, 'landing', start);
  assert.equal(recordConversion(landing, start + 1), landing);
  const guest = recordVisit(landing, 'guest', start + 1);
  const converted = recordConversion(guest, start + 2);
  assert.equal(converted.convertedAt, start + 2);
  assert.equal(recordConversion(converted, start + 3), converted);
  assert.equal(recordVisit(converted, 'guest', start + SESSION_GAP + 2).convertedAt, start + 2);
  assert.equal(guest.convertedAt, null);
});
