import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachingRoute } from './coaching.js';

const fixture = () => ({
  db: {
    users: [{ id: 'coach', name: 'Coach', trainer: true }, { id: 'client', name: 'Client' }],
    coachLinks: [], coachPlans: [], coachDataGrants: []
  },
  state: {
    client: {
      unit: 'kg', bodyweight: [{ d: '2026-09-27', w: 74 }], routines: [{ id: 'r1', name: 'Push', ex: [] }],
      workouts: [{ id: 'w1', d: '2026-09-27' }], nutrition: { targets: { kcal: 2300 }, entries: [{ name: 'Oats' }] },
      lang: 'ro', active: { secret: 'in progress' }, reminder: { on: true }
    }
  }
});

async function call(f, key, user, body = {}) {
  let response;
  const handled = await coachingRoute({
    key, db: f.db, user, body,
    readState: async id => f.state[id] || null,
    saveDb: async () => {},
    reply: (status, payload) => { response = { status, payload }; }
  });
  assert.equal(handled, true);
  return response;
}

test('dashboard data requires a separate client grant and only exposes training and nutrition fields', async () => {
  const f = fixture();
  const denied = await call(f, 'GET /api/coaching/client/client', f.db.users[0]);
  assert.equal(denied.status, 403);

  assert.equal((await call(f, 'POST /api/coaching/data-consent', f.db.users[1], { trainerId: 'coach', allow: true })).status, 403);
  await call(f, 'POST /api/coaching/consent', f.db.users[1], { trainerId: 'coach', allow: true });
  const consent = await call(f, 'POST /api/coaching/data-consent', f.db.users[1], { trainerId: 'coach', allow: true });
  assert.equal(consent.status, 200);
  const allowed = await call(f, 'GET /api/coaching/client/client', f.db.users[0]);
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.payload.client, { id: 'client', name: 'Client' });
  assert.equal(allowed.payload.state.nutrition.entries[0].name, 'Oats');
  assert.equal(allowed.payload.state.workouts[0].id, 'w1');
  assert.equal('active' in allowed.payload.state, false);
  assert.equal('reminder' in allowed.payload.state, false);
  assert.equal('lang' in allowed.payload.state, false);

  const revoked = await call(f, 'POST /api/coaching/data-consent', f.db.users[1], { trainerId: 'coach', allow: false });
  assert.equal(revoked.status, 200);
  assert.equal((await call(f, 'GET /api/coaching/client/client', f.db.users[0])).status, 403);
});

test('dashboard consent does not grant permission to send a training plan', async () => {
  const f = fixture();
  f.db.coachDataGrants.push({ trainerId: 'coach', clientId: 'client' });
  const listing = await call(f, 'GET /api/coaching', f.db.users[0]);
  assert.equal(listing.payload.clients[0].canViewDashboard, true);
  assert.equal(listing.payload.clients[0].canSendPlans, false);
  const denied = await call(f, 'POST /api/coaching/send', f.db.users[0], { clientId: 'client', plan: {} });
  assert.equal(denied.status, 403);
});

test('a client account cannot use the trainer dashboard endpoint', async () => {
  const f = fixture();
  f.db.coachDataGrants.push({ trainerId: 'coach', clientId: 'client' });
  const denied = await call(f, 'GET /api/coaching/client/client', f.db.users[1]);
  assert.equal(denied.status, 403);
});

test('trainer overview only contains shared client metrics', async () => {
  const f = fixture();
  await call(f, 'POST /api/coaching/consent', f.db.users[1], { trainerId: 'coach', allow: true });
  await call(f, 'POST /api/coaching/nutrition-consent', f.db.users[1], { trainerId: 'coach', allow: true });
  let result = await call(f, 'GET /api/coaching/overview', f.db.users[0]);
  assert.equal(result.payload.clients[0].overview, null);
  assert.equal(result.payload.clients[0].canSendNutrition, true);
  await call(f, 'POST /api/coaching/data-consent', f.db.users[1], { trainerId: 'coach', allow: true });
  result = await call(f, 'GET /api/coaching/overview', f.db.users[0]);
  assert.equal(result.payload.clients[0].overview.latestWeight, 74);
  assert.equal((await call(f, 'GET /api/coaching/overview', f.db.users[1])).status, 403);
});

test('nutrition plans require separate consent and client approval', async () => {
  const f = fixture();
  const plan = { name: 'Balanced', targets: { kcal: 2200, protein: 140, carbs: 260, fat: 60 },
    meals: [{ name: 'Lunch', details: 'Rice and vegetables' }], notes: '' };
  assert.equal((await call(f, 'POST /api/coaching/nutrition/send', f.db.users[0], { clientId: 'client', plan })).status, 403);
  await call(f, 'POST /api/coaching/nutrition-consent', f.db.users[1], { trainerId: 'coach', allow: true });
  const sent = await call(f, 'POST /api/coaching/nutrition/send', f.db.users[0], { clientId: 'client', plan });
  assert.equal(sent.status, 200);
  assert.equal((await call(f, 'POST /api/coaching/nutrition/respond', f.db.users[0], { id: sent.payload.id, accept: true })).status, 404);
  assert.equal((await call(f, 'POST /api/coaching/nutrition/respond', f.db.users[1], { id: sent.payload.id, accept: true })).status, 200);
  assert.equal(f.db.coachNutritionPlans[0].status, 'accepted');
  assert.equal('plan' in f.db.coachNutritionPlans[0], false);
});

test('revoking nutrition consent withdraws pending plans', async () => {
  const f = fixture();
  const plan = { name: 'Balanced', targets: { kcal: 2200, protein: 140, carbs: 260, fat: 60 },
    meals: [{ name: 'Lunch', details: 'Rice and vegetables' }], notes: '' };
  await call(f, 'POST /api/coaching/nutrition-consent', f.db.users[1], { trainerId: 'coach', allow: true });
  await call(f, 'POST /api/coaching/nutrition/send', f.db.users[0], { clientId: 'client', plan });
  await call(f, 'POST /api/coaching/nutrition-consent', f.db.users[1], { trainerId: 'coach', allow: false });
  assert.equal(f.db.coachNutritionPlans[0].status, 'withdrawn');
});

test('revoking trainer access also revokes dashboard and nutrition permissions', async () => {
  const f = fixture();
  await call(f, 'POST /api/coaching/consent', f.db.users[1], { trainerId: 'coach', allow: true });
  await call(f, 'POST /api/coaching/data-consent', f.db.users[1], { trainerId: 'coach', allow: true });
  await call(f, 'POST /api/coaching/nutrition-consent', f.db.users[1], { trainerId: 'coach', allow: true });
  await call(f, 'POST /api/coaching/consent', f.db.users[1], { trainerId: 'coach', allow: false });
  assert.equal(f.db.coachDataGrants.length, 0);
  assert.equal(f.db.coachNutritionGrants.length, 0);
  assert.equal((await call(f, 'GET /api/coaching/client/client', f.db.users[0])).status, 403);
});
