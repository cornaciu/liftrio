// Vercel adapter for openGym. Persistent state and one-use WebAuthn challenges
// live in Supabase Postgres; no process memory or writable filesystem is needed.
import crypto from 'node:crypto';
import pg from 'pg';
import webpush from 'web-push';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';

const databaseUrl = process.env.POSTGRES_URL && new URL(process.env.POSTGRES_URL);
// node-postgres treats sslmode in a URL as an override for the ssl object.
// Remove it so the supplied CA is actually used to verify the connection.
databaseUrl?.searchParams.delete('sslmode');
const ca = process.env.POSTGRES_CA_CERT_BASE64 && Buffer.from(process.env.POSTGRES_CA_CERT_BASE64, 'base64').toString('utf8');
const pool = new pg.Pool({
  connectionString: databaseUrl?.toString(),
  ssl: ca ? { ca, rejectUnauthorized: true } : undefined,
  max: 2,
  idleTimeoutMillis: 10000
});
const RP_ID = process.env.RP_ID || 'open-gym-bay.vercel.app';
const ORIGIN = process.env.ORIGIN || `https://${RP_ID}`;
const RP_NAME = process.env.RP_NAME || 'openGym';
const INVITE_ONLY = /^(1|true|yes|on)$/i.test(process.env.INVITE_ONLY || '');
const ADMIN_UIDS = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
const SESSION_DAYS = Math.max(1, +(process.env.SESSION_DAYS || 90) || 90);
const SECURE = ORIGIN.startsWith('https:') ? ' Secure;' : '';
const emptyDb = () => ({ users: [], creds: [], subs: [], invites: [] });
const isAdmin = user => !!user && (user.admin === true || ADMIN_UIDS.includes(user.id));
const bodyOf = req => {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body && typeof req.body === 'object' ? req.body : {};
};
const send = (res, code, object, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(object));
};

export default async function handler(req, res) {
  if (!process.env.POSTGRES_URL) return send(res, 503, { error: 'database not configured' });
  if (!ca?.includes('-----BEGIN CERTIFICATE-----')) return send(res, 503, { error: 'database CA certificate not configured' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Serialize writes to the small instance-wide document, including credential
    // counters and invite consumption. Separate per-user states are independent.
    await client.query("insert into public.opengym_kv(key,value) values ('db','{}') on conflict do nothing");
    const row = await client.query("select value from public.opengym_kv where key='db' for update");
    const db = { ...emptyDb(), ...row.rows[0].value };
    const get = async key => (await client.query('select value from public.opengym_kv where key=$1', [key])).rows[0]?.value ?? null;
    const put = async (key, value) => client.query('insert into public.opengym_kv(key,value) values ($1,$2::jsonb) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(value)]);
    const take = async key => (await client.query('delete from public.opengym_kv where key=$1 returning value', [key])).rows[0]?.value ?? null;
    const saveDb = async () => put('db', db);
    let secret = await get('secret');
    if (!secret) { secret = crypto.randomBytes(32).toString('hex'); await put('secret', secret); }
    const sign = payload => payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const sessionVersion = user => user.sv || 0;
    const sessionCookie = user => `gymsid=${sign(`${user.id}:${Date.now() + SESSION_DAYS * 86400000}:${sessionVersion(user)}`)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly;${SECURE} SameSite=Lax`;
    const clearCookie = `gymsid=; Path=/; Max-Age=0; HttpOnly;${SECURE} SameSite=Lax`;
    const readSession = () => {
      const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('gymsid='))?.slice(7);
      if (!token) return null;
      const dot = token.lastIndexOf('.');
      if (dot < 0) return null;
      const payload = token.slice(0, dot), mac = token.slice(dot + 1);
      const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
      try { if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null; }
      catch { return null; }
      const [uid, exp, version] = payload.split(':');
      if (!uid || +exp < Date.now()) return null;
      const user = db.users.find(u => u.id === uid);
      if (!user || user.disabled || Number(version ?? 0) !== sessionVersion(user)) return null;
      return user;
    };
    const requireUser = () => {
      const user = readSession();
      if (!user) send(res, 401, { error: 'not signed in' });
      return user;
    };
    const requireAdmin = () => {
      const user = requireUser();
      if (user && !isAdmin(user)) { send(res, 403, { error: 'forbidden' }); return null; }
      return user;
    };
    const challenge = async data => {
      const cid = crypto.randomBytes(16).toString('base64url');
      await put(`challenge:${cid}`, { ...data, exp: Date.now() + 300000 });
      return cid;
    };
    const consumeChallenge = async cid => {
      if (typeof cid !== 'string' || !/^[\w-]{20,50}$/.test(cid)) return null;
      const result = await take(`challenge:${cid}`);
      return result?.exp > Date.now() ? result : null;
    };
    const stateOf = uid => get(`state:${uid}`);
    const route = String(req.query?.route || '').replace(/^\/+/, '') || new URL(req.url, ORIGIN).pathname.replace(/^\/api\//, '');
    const key = `${req.method} /api/${route}`;
    const body = ['POST', 'PUT'].includes(req.method) ? bodyOf(req) : {};
    let vapid = await get('vapid');
    if (!vapid) { vapid = webpush.generateVAPIDKeys(); await put('vapid', vapid); }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || ORIGIN, vapid.publicKey, vapid.privateKey);
    const sendPush = async (uid, payload) => {
      const subs = db.subs.filter(s => s.userId === uid);
      await Promise.all(subs.map(async sub => {
        try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload)); }
        catch (error) {
          if ([404, 410].includes(error.statusCode)) db.subs = db.subs.filter(s => s.endpoint !== sub.endpoint);
          else console.error('push failed', error.statusCode || error.message);
        }
      }));
      await saveDb();
    };

    switch (key) {
      case 'GET /api/health': send(res, 200, { ok: true, users: db.users.length }); break;
      case 'GET /api/config': send(res, 200, { invite_only: INVITE_ONLY }); break;
      case 'GET /api/me': {
        const user = requireUser();
        if (user) send(res, 200, { user: { id: user.id, name: user.name, admin: isAdmin(user) } });
        break;
      }
      case 'POST /api/register/options': {
        const name = String(body.name || '').trim().slice(0, 40);
        const code = String(body.code || '').trim().toUpperCase();
        if (!name) { send(res, 400, { error: 'name required' }); break; }
        if (INVITE_ONLY && !db.invites.some(i => i.code === code && !i.usedBy && !i.revoked)) { send(res, 403, { error: 'a valid invite code is required' }); break; }
        const uid = crypto.randomBytes(12).toString('base64url');
        const options = await generateRegistrationOptions({ rpName: RP_NAME, rpID: RP_ID, userID: Buffer.from(uid), userName: name, userDisplayName: name, attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }, excludeCredentials: [] });
        const cid = await challenge({ challenge: options.challenge, uid, name, code });
        send(res, 200, { cid, options }); break;
      }
      case 'POST /api/register/verify': {
        const c = await consumeChallenge(body.cid);
        if (!c?.uid) { send(res, 400, { error: 'challenge expired — try again' }); break; }
        let verification;
        try { verification = await verifyRegistrationResponse({ response: body.credential, expectedChallenge: c.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: false }); }
        catch (e) { send(res, 400, { error: 'verification failed: ' + e.message }); break; }
        if (!verification.verified) { send(res, 400, { error: 'not verified' }); break; }
        const { credential } = verification.registrationInfo;
        if (db.creds.some(x => x.id === credential.id)) { send(res, 409, { error: 'credential already registered' }); break; }
        const invite = INVITE_ONLY ? db.invites.find(i => i.code === c.code && !i.usedBy && !i.revoked) : null;
        if (INVITE_ONLY && !invite) { send(res, 403, { error: 'invite code is no longer valid' }); break; }
        const user = { id: c.uid, name: c.name, created: new Date().toISOString() };
        if (invite) { user.invitedBy = invite.code; invite.usedBy = user.id; invite.usedAt = user.created; }
        db.users.push(user);
        db.creds.push({ id: credential.id, userId: user.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter || 0, transports: body.credential?.response?.transports || [] });
        await saveDb();
        send(res, 200, { user: { id: user.id, name: user.name, admin: isAdmin(user) } }, { 'Set-Cookie': sessionCookie(user) }); break;
      }
      case 'POST /api/login/options': {
        const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'preferred', allowCredentials: [] });
        const cid = await challenge({ challenge: options.challenge });
        send(res, 200, { cid, options }); break;
      }
      case 'POST /api/login/verify': {
        const c = await consumeChallenge(body.cid);
        if (!c) { send(res, 400, { error: 'challenge expired — try again' }); break; }
        const cred = db.creds.find(x => x.id === body.credential?.id);
        if (!cred) { send(res, 404, { error: 'unknown passkey — create a profile first' }); break; }
        let verification;
        try { verification = await verifyAuthenticationResponse({ response: body.credential, expectedChallenge: c.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: false, credential: { id: cred.id, publicKey: Buffer.from(cred.publicKey, 'base64url'), counter: cred.counter, transports: cred.transports } }); }
        catch (e) { send(res, 400, { error: 'verification failed: ' + e.message }); break; }
        if (!verification.verified) { send(res, 400, { error: 'not verified' }); break; }
        cred.counter = verification.authenticationInfo.newCounter;
        await saveDb();
        const user = db.users.find(u => u.id === cred.userId);
        if (!user) send(res, 500, { error: 'user missing' });
        else if (user.disabled) send(res, 403, { error: 'this account has been disabled' });
        else send(res, 200, { user: { id: user.id, name: user.name, admin: isAdmin(user) } }, { 'Set-Cookie': sessionCookie(user) });
        break;
      }
      case 'POST /api/logout': send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie }); break;
      case 'POST /api/logout/all': {
        const user = requireUser(); if (!user) break;
        user.sv = sessionVersion(user) + 1; await saveDb();
        send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie }); break;
      }
      case 'GET /api/data': {
        const user = requireUser(); if (!user) break;
        send(res, 200, { state: await stateOf(user.id) }); break;
      }
      case 'PUT /api/data': {
        const user = requireUser(); if (!user) break;
        if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) { send(res, 400, { error: 'state required' }); break; }
        delete body.state.active;
        await put(`state:${user.id}`, body.state);
        send(res, 200, { ok: true, ts: body.state._ts || null }); break;
      }
      case 'GET /api/push/public-key': send(res, 200, { key: vapid.publicKey }); break;
      case 'POST /api/push/subscribe': {
        const user = requireUser(); if (!user) break;
        const sub = body.subscription;
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) { send(res, 400, { error: 'invalid subscription' }); break; }
        db.subs = db.subs.filter(s => s.endpoint !== sub.endpoint);
        db.subs.push({ userId: user.id, endpoint: sub.endpoint, keys: sub.keys, created: new Date().toISOString() });
        await saveDb(); send(res, 200, { ok: true }); break;
      }
      case 'POST /api/push/unsubscribe': {
        const user = requireUser(); if (!user) break;
        db.subs = db.subs.filter(s => !(s.userId === user.id && s.endpoint === body.endpoint));
        await saveDb(); send(res, 200, { ok: true }); break;
      }
      case 'POST /api/push/test': {
        const user = requireUser(); if (!user) break;
        await sendPush(user.id, { title: 'openGym', body: 'Test notification ✅', tag: 'test' });
        send(res, 200, { ok: true }); break;
      }
      case 'POST /api/push/rest-timer':
      case 'POST /api/push/rest-timer/cancel': {
        const user = requireUser(); if (!user) break;
        send(res, 501, { error: 'background rest-timer alerts require a persistent worker' }); break;
      }
      case 'POST /api/activity': {
        const user = requireUser(); if (user) send(res, 200, { ok: true }); break;
      }
      case 'GET /api/admin/users': {
        if (!requireAdmin()) break;
        const users = await Promise.all(db.users.map(async u => {
          const S = await stateOf(u.id) || {};
          const workouts = S.workouts || [];
          return { id: u.id, name: u.name, created: u.created || null, disabled: !!u.disabled, admin: isAdmin(u), invitedBy: u.invitedBy || null, workouts: workouts.length, lastWorkout: workouts.at(-1)?.d || null, lastSync: S._ts || null, hasPush: db.subs.some(s => s.userId === u.id), live: null };
        }));
        send(res, 200, { users, invite_only: INVITE_ONLY, now: Date.now() }); break;
      }
      case 'GET /api/admin/user': {
        if (!requireAdmin()) break;
        const id = new URL(req.url, ORIGIN).searchParams.get('id') || req.query?.id;
        const u = db.users.find(x => x.id === id);
        if (!u) { send(res, 404, { error: 'no such user' }); break; }
        const S = await stateOf(u.id) || {};
        send(res, 200, { user: { id: u.id, name: u.name, created: u.created || null, disabled: !!u.disabled, admin: isAdmin(u), invitedBy: u.invitedBy || null }, unit: S.unit || 'kg', lastSync: S._ts || null, routines: (S.routines || []).map(r => ({ id: r.id, name: r.name, emoji: r.emoji, count: (r.ex || []).length })), bodyweight: S.bodyweight || [], workouts: (S.workouts || []).slice().reverse() }); break;
      }
      case 'POST /api/admin/user/disable': {
        if (!requireAdmin()) break;
        const u = db.users.find(x => x.id === body.id);
        if (!u) send(res, 404, { error: 'no such user' });
        else if (isAdmin(u)) send(res, 400, { error: 'cannot disable an admin' });
        else { u.disabled = !!body.disabled; await saveDb(); send(res, 200, { ok: true, id: u.id, disabled: u.disabled }); }
        break;
      }
      case 'GET /api/admin/invites': {
        if (!requireAdmin()) break;
        send(res, 200, { invites: db.invites.map(i => ({ ...i, usedByName: i.usedBy ? db.users.find(u => u.id === i.usedBy)?.name || null : null })), invite_only: INVITE_ONLY }); break;
      }
      case 'POST /api/admin/invites/new': {
        const admin = requireAdmin(); if (!admin) break;
        let code;
        do { code = crypto.randomBytes(8).toString('hex').toUpperCase(); } while (db.invites.some(i => i.code === code));
        const invite = { code, note: String(body.note || '').slice(0, 60), createdBy: admin.id, created: new Date().toISOString() };
        db.invites.push(invite); await saveDb(); send(res, 200, { invite }); break;
      }
      case 'POST /api/admin/invites/revoke': {
        if (!requireAdmin()) break;
        const inv = db.invites.find(i => i.code === String(body.code || '').toUpperCase());
        if (!inv) send(res, 404, { error: 'no such code' });
        else if (inv.usedBy) send(res, 400, { error: 'already used — cannot revoke' });
        else { db.invites = db.invites.filter(i => i.code !== inv.code); await saveDb(); send(res, 200, { ok: true }); }
        break;
      }
      default: send(res, 404, { error: 'not found' });
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    console.error('openGym API', error);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  } finally { client.release(); }
}
