import test from 'node:test';
import assert from 'node:assert/strict';
import { coachingRoute } from '../shared/coaching.js';

const setup = () => {
  const admin = { id: 'admin', name: 'Owner', admin: true };
  const trainer = { id: 'trainer', name: 'Coach', trainer: true };
  const client = { id: 'client', name: 'Athlete' };
  const stranger = { id: 'stranger', name: 'Other' };
  const db = { users: [admin, trainer, client, stranger], coachLinks: [], coachPlans: [] };
  let saved = 0;
  const call = async (key, user, body = {}) => {
    let result;
    await coachingRoute({ key, db, user, body, saveDb: () => { saved++ },
      reply: (status, data) => { result = { status, data } } });
    return result;
  };
  return { admin, trainer, client, stranger, db, call, saves: () => saved };
};
const plan = { opengym_plan: 1, name: 'Plan A', week: { 1: 'r1' },
  routines: [{ id: 'r1', name: 'Legs', ex: [{ id: '0585', sets: 3 }] }], customEx: [] };

test('a trainer can only send plans after the client grants access', async () => {
  const { trainer, client, stranger, call } = setup();
  const send = (user, clientId) => call('POST /api/coaching/send', user, { clientId, plan });
  assert.equal((await send(trainer, client.id)).status, 403);
  assert.equal((await call('POST /api/coaching/consent', stranger, { trainerId: trainer.id, allow: true })).status, 200);
  assert.equal((await send(trainer, client.id)).status, 403);
  assert.equal((await call('POST /api/coaching/consent', client, { trainerId: trainer.id, allow: true })).status, 200);
  assert.equal((await send(stranger, client.id)).status, 403);
  const sent = await send(trainer, client.id);
  assert.equal(sent.status, 200);
  const otherView = await call('GET /api/coaching', stranger);
  assert.equal(otherView.data.assignments.length, 0);
  const clientView = await call('GET /api/coaching', client);
  assert.equal(clientView.data.assignments[0].plan.routines[0].name, 'Legs');
  assert.equal((await call('POST /api/coaching/respond', trainer, { id: sent.data.id, accept: true })).status, 404);
  assert.equal((await call('POST /api/coaching/respond', client, { id: sent.data.id, accept: true })).status, 200);
});

test('revocation withdraws pending plans and prevents further sends', async () => {
  const { trainer, client, call, db } = setup();
  await call('POST /api/coaching/consent', client, { trainerId: trainer.id, allow: true });
  const sent = await call('POST /api/coaching/send', trainer, { clientId: client.id, plan });
  await call('POST /api/coaching/consent', client, { trainerId: trainer.id, allow: false });
  assert.equal(db.coachPlans[0].status, 'withdrawn');
  assert.equal((await call('POST /api/coaching/respond', client, { id: sent.data.id, accept: true })).status, 409);
  assert.equal((await call('POST /api/coaching/send', trainer, { clientId: client.id, plan })).status, 403);
});

test('only admins can change roles and demoting a trainer revokes access', async () => {
  const { admin, trainer, client, call, db } = setup();
  assert.equal((await call('POST /api/admin/user/role', trainer, { id: client.id, role: 'admin' })).status, 403);
  await call('POST /api/coaching/consent', client, { trainerId: trainer.id, allow: true });
  assert.equal((await call('POST /api/admin/user/role', admin, { id: trainer.id, role: 'member' })).status, 200);
  assert.equal(db.coachLinks.length, 0);
  assert.equal((await call('POST /api/coaching/send', trainer, { clientId: client.id, plan })).status, 403);
  assert.equal((await call('POST /api/admin/user/role', admin, { id: admin.id, role: 'member' })).status, 400);
});
