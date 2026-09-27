import crypto from 'node:crypto';

export const roleOf = (user, adminUids = []) =>
  user && (user.admin === true || adminUids.includes(user.id)) ? 'admin'
    : user?.trainer === true ? 'trainer' : 'member';

const activeTrainer = (db, id, adminUids) => {
  const user = db.users.find(u => u.id === id && !u.disabled);
  return user && roleOf(user, adminUids) !== 'member' ? user : null;
};

const validPlan = plan => {
  if (!plan || plan.opengym_plan !== 1 || !Array.isArray(plan.routines) ||
      !plan.routines.length || plan.routines.length > 24 ||
      JSON.stringify(plan).length > 100000 || !plan.routines.every(r =>
        typeof r.id === 'string' && typeof r.name === 'string' && r.name.length <= 100 &&
        Array.isArray(r.ex) && r.ex.length <= 40 && r.ex.every(e =>
          typeof e.id === 'string' && e.id.length <= 80 &&
          Number.isInteger(+e.sets) && +e.sets >= 1 && +e.sets <= 30))) return false;
  return true;
};

// Both the self-hosted API and the Vercel adapter use this policy. The user owns the
// grant. A trainer never receives another profile's state and can only submit a plan
// for that user to review and merge into their own state.
export async function coachingRoute({ key, db, user, body = {}, saveDb, reply, adminUids = [] }) {
  if (!key.startsWith('GET /api/coaching') && !key.startsWith('POST /api/coaching') &&
      key !== 'POST /api/admin/user/role') return false;
  if (!user) { reply(401, { error: 'not signed in' }); return true; }
  db.coachLinks ||= [];
  db.coachPlans ||= [];
  const role = roleOf(user, adminUids);
  const linkFor = (trainerId, clientId) => db.coachLinks.find(l => l.trainerId === trainerId && l.clientId === clientId);

  if (key === 'POST /api/admin/user/role') {
    if (role !== 'admin') { reply(403, { error: 'forbidden' }); return true; }
    const target = db.users.find(u => u.id === body.id);
    if (!target) { reply(404, { error: 'no such user' }); return true; }
    if (!['admin', 'trainer', 'member'].includes(body.role)) { reply(400, { error: 'invalid role' }); return true; }
    if (adminUids.includes(target.id) && body.role !== 'admin') { reply(400, { error: 'configured admin cannot be changed here' }); return true; }
    if (target.id === user.id && body.role !== 'admin') { reply(400, { error: 'cannot remove your own admin role' }); return true; }
    target.admin = body.role === 'admin';
    target.trainer = body.role === 'trainer';
    if (body.role === 'member') {
      db.coachLinks = db.coachLinks.filter(l => l.trainerId !== target.id);
      db.coachPlans.forEach(p => { if (p.trainerId === target.id && p.status === 'pending') p.status = 'withdrawn'; });
    }
    await saveDb();
    reply(200, { id: target.id, role: roleOf(target, adminUids) });
    return true;
  }

  if (key === 'GET /api/coaching') {
    const trainers = db.users.filter(u => u.id !== user.id && !u.disabled && roleOf(u, adminUids) !== 'member')
      .map(u => ({ id: u.id, name: u.name, role: roleOf(u, adminUids) }));
    const connections = db.coachLinks.filter(l => l.clientId === user.id)
      .map(l => ({ trainerId: l.trainerId, name: db.users.find(u => u.id === l.trainerId)?.name || '', since: l.since }));
    const clients = role === 'member' ? [] : db.coachLinks.filter(l => l.trainerId === user.id)
      .map(l => ({ id: l.clientId, name: db.users.find(u => u.id === l.clientId)?.name || '' }))
      .filter(c => db.users.some(u => u.id === c.id && !u.disabled));
    const assignments = db.coachPlans.filter(p => p.clientId === user.id || p.trainerId === user.id)
      .filter(p => p.clientId === user.id || !!linkFor(user.id, p.clientId))
      .map(p => ({ ...p, trainerName: db.users.find(u => u.id === p.trainerId)?.name || '',
        clientName: db.users.find(u => u.id === p.clientId)?.name || '' }));
    reply(200, { role, trainers, connections, clients, assignments });
    return true;
  }

  if (key === 'POST /api/coaching/consent') {
    const trainer = db.users.find(u => u.id === body.trainerId);
    if (!trainer || trainer.id === user.id ||
        (body.allow === true && !activeTrainer(db, trainer.id, adminUids))) {
      reply(400, { error: 'invalid trainer' }); return true;
    }
    if (body.allow === true) {
      if (!linkFor(trainer.id, user.id)) db.coachLinks.push({ trainerId: trainer.id, clientId: user.id, since: new Date().toISOString() });
    } else if (body.allow === false) {
      db.coachLinks = db.coachLinks.filter(l => !(l.trainerId === trainer.id && l.clientId === user.id));
      db.coachPlans.forEach(p => { if (p.trainerId === trainer.id && p.clientId === user.id && p.status === 'pending') p.status = 'withdrawn'; });
    } else { reply(400, { error: 'allow must be boolean' }); return true; }
    await saveDb();
    reply(200, { ok: true });
    return true;
  }

  if (key === 'POST /api/coaching/send') {
    if (role === 'member') { reply(403, { error: 'trainer role required' }); return true; }
    if (!linkFor(user.id, body.clientId) || !db.users.some(u => u.id === body.clientId && !u.disabled)) {
      reply(403, { error: 'client consent required' }); return true;
    }
    if (!validPlan(body.plan)) { reply(400, { error: 'invalid plan' }); return true; }
    if (db.coachPlans.filter(p => p.trainerId === user.id && p.clientId === body.clientId && p.status === 'pending').length >= 5) {
      reply(429, { error: 'too many plans awaiting this client' }); return true;
    }
    const assignment = { id: crypto.randomUUID(), trainerId: user.id, clientId: body.clientId,
      plan: body.plan, status: 'pending', created: new Date().toISOString() };
    db.coachPlans.push(assignment);
    await saveDb();
    reply(200, { id: assignment.id });
    return true;
  }

  if (key === 'POST /api/coaching/respond') {
    const p = db.coachPlans.find(x => x.id === body.id && x.clientId === user.id);
    if (!p) { reply(404, { error: 'plan not found' }); return true; }
    if (p.status !== 'pending') { reply(409, { error: 'plan already handled' }); return true; }
    if (body.accept === true && !linkFor(p.trainerId, user.id)) { reply(403, { error: 'trainer access revoked' }); return true; }
    if (typeof body.accept !== 'boolean') { reply(400, { error: 'accept must be boolean' }); return true; }
    p.status = body.accept ? 'accepted' : 'declined';
    p.decided = new Date().toISOString();
    p.summary = { name: p.plan.name, routines: p.plan.routines.length };
    delete p.plan;
    await saveDb();
    reply(200, { ok: true });
    return true;
  }
  reply(404, { error: 'not found' });
  return true;
}
