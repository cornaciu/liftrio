import crypto from 'node:crypto'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { analyticsVisitorKey } from '../../../shared/analytics.js'

const fixture = vi.hoisted(() => ({ kv: new Map(), query: vi.fn(), verification: true }))
vi.mock('pg', () => ({ default: { Pool: class {
  async connect() { return { query: fixture.query, release() {} } }
} } }))
vi.mock('web-push', () => ({ default: {
  setVapidDetails() {}, generateVAPIDKeys() { return { publicKey: 'test', privateKey: 'test' } },
} }))
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: async () => ({ challenge: 'test' }),
  verifyRegistrationResponse: async () => ({ verified: fixture.verification, registrationInfo: {
    credential: { id: 'test-passkey', publicKey: Buffer.from('test'), counter: 0 },
  } }),
  generateAuthenticationOptions: vi.fn(), verifyAuthenticationResponse: vi.fn(),
}))

let handler
const id = 'cd02a4ba-9239-4ffa-8aee-06a14f6a284a'
const visitorKey = analyticsVisitorKey(id, 'test-secret')

beforeEach(async () => {
  fixture.kv = new Map([
    ['db', { users: [{ id: 'member', name: 'Member' }, { id: 'admin', name: 'Admin', admin: true }], creds: [] }],
    ['secret', 'test-secret'], ['vapid', { publicKey: 'test', privateKey: 'test' }],
  ])
  fixture.verification = true
  fixture.query.mockReset().mockImplementation(async (sql, params) => {
    if (['begin', 'commit', 'rollback'].includes(sql)) return { rows: [] }
    if (sql.includes("values ('db','{}')")) return { rows: [] }
    if (sql.includes("where key='db'")) return { rows: [{ value: fixture.kv.get('db') }] }
    if (sql.startsWith('select value')) return { rows: fixture.kv.has(params[0]) ? [{ value: fixture.kv.get(params[0]) }] : [] }
    if (sql.startsWith('insert into public.opengym_kv')) {
      fixture.kv.set(params[0], JSON.parse(params[1])); return { rows: [] }
    }
    if (sql.startsWith('delete from public.opengym_kv')) {
      const value = fixture.kv.get(params[0]); fixture.kv.delete(params[0]); return { rows: value ? [{ value }] : [] }
    }
    if (sql.includes('count(*)::int')) return { rows: [{ visitors: 1, returning: 0, sessions: 1, converted: 0, since: '1790790000000' }] }
    if (sql.includes('right(key, 10)')) return { rows: [] }
    throw new Error('Unexpected SQL: ' + sql)
  })
  vi.stubEnv('POSTGRES_URL', 'postgres://localhost/test')
  vi.stubEnv('POSTGRES_CA_CERT_BASE64', Buffer.from('-----BEGIN CERTIFICATE-----').toString('base64'))
  vi.stubEnv('ORIGIN', 'https://liftrio.vercel.app')
  vi.resetModules()
  handler = (await import('../../../api/handler.js')).default
})
afterEach(() => vi.unstubAllEnvs())

function cookie(uid) {
  const payload = `${uid}:${Date.now() + 86400000}:0`
  return 'gymsid=' + payload + '.' + crypto.createHmac('sha256', 'test-secret').update(payload).digest('base64url')
}
async function request(route, body = {}, uid, origin = 'https://liftrio.vercel.app') {
  const result = {}
  await handler({ method: route.startsWith('admin/') ? 'GET' : 'POST', query: { route }, body,
    headers: { origin, ...(uid ? { cookie: cookie(uid) } : {}) }, url: '/api/' + route }, {
    writeHead(code) { result.status = code; this.headersSent = true },
    end(value) { result.body = JSON.parse(value) },
  })
  return result
}

it('rejects invalid tokens and origins without analytics writes', async () => {
  expect((await request('analytics/visit', { visitorId: 'Member', mode: 'guest' })).status).toBe(400)
  expect((await request('analytics/visit', { visitorId: id, mode: 'guest' }, null, 'https://other.example')).status).toBe(403)
  expect(fixture.kv.has(visitorKey)).toBe(false)
})

it('counts a guest once and excludes signed-in traffic', async () => {
  expect((await request('analytics/visit', { visitorId: id, mode: 'landing' })).status).toBe(200)
  await request('analytics/visit', { visitorId: id, mode: 'guest' })
  await request('analytics/visit', { visitorId: id, mode: 'guest' })
  expect(fixture.kv.get(visitorKey).guestSessions).toBe(1)
  const previous = fixture.kv.get(visitorKey)
  await request('analytics/visit', { visitorId: id, mode: 'guest' }, 'member')
  expect(fixture.kv.get(visitorKey)).toBe(previous)
  expect(previous).not.toHaveProperty('userId')
})

it('only admins can read guest analytics', async () => {
  expect((await request('admin/analytics')).status).toBe(401)
  expect((await request('admin/analytics', {}, 'member')).status).toBe(403)
  const result = await request('admin/analytics', {}, 'admin')
  expect(result.status).toBe(200)
  expect(result.body.summary.visitors).toBe(1)
})

it('records a conversion only after verified new registration following a guest visit', async () => {
  await request('analytics/visit', { visitorId: id, mode: 'guest' })
  const options = await request('register/options', { username: 'NewGuest', visitorId: id })
  expect(options.status).toBe(200)
  const result = await request('register/verify', { cid: options.body.cid, credential: { response: {} } })
  expect(result.status).toBe(200)
  expect(fixture.kv.get(visitorKey).convertedAt).toBeGreaterThan(0)
  expect(fixture.kv.get(visitorKey)).not.toHaveProperty('userId')
})

it('failed registration never counts as conversion', async () => {
  await request('analytics/visit', { visitorId: id, mode: 'guest' })
  const options = await request('register/options', { username: 'NewGuest', visitorId: id })
  fixture.verification = false
  expect((await request('register/verify', { cid: options.body.cid, credential: {} })).status).toBe(400)
  expect(fixture.kv.get(visitorKey).convertedAt).toBe(null)
})
