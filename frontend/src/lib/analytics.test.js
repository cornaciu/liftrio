import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
vi.mock('./demo.js', () => ({ DEMO: false }))
vi.mock('./mobile.js', () => ({ MOBILE: false }))
import { visitorId, trackVisit, setAnalyticsEnabled, analyticsEnabled } from './analytics.js'

beforeEach(() => {
  const storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  })
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  vi.stubGlobal('document', { visibilityState: 'visible' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  vi.useFakeTimers()
  setAnalyticsEnabled(true)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('guest analytics transport', () => {
  it('keeps one random token across visits, deduplicates reloads and sends no profile data', async () => {
    const id = visitorId()
    expect(visitorId()).toBe(id)
    await trackVisit('landing')
    await trackVisit('landing')
    await trackVisit('guest')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ visitorId: id, mode: 'guest' })
    vi.advanceTimersByTime(5 * 60000)
    await trackVisit('guest')
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('opt-out prevents new requests and registration tokens', async () => {
    const id = visitorId()
    setAnalyticsEnabled(false)
    expect(analyticsEnabled()).toBe(false)
    expect(visitorId()).toBe(null)
    await trackVisit('guest')
    expect(fetch).not.toHaveBeenCalled()
    setAnalyticsEnabled(true)
    expect(visitorId()).not.toBe(id)
  })
  it('never counts background tabs and retries an offline visit without throwing', async () => {
    document.visibilityState = 'hidden'
    await trackVisit('guest')
    expect(fetch).not.toHaveBeenCalled()
    document.visibilityState = 'visible'
    fetch.mockRejectedValueOnce(new Error('offline'))
    await expect(trackVisit('guest')).resolves.toBeUndefined()
    await trackVisit('guest')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('leaves the app usable when browser storage is unavailable', async () => {
    localStorage.getItem = () => { throw new Error('unavailable') }
    expect(visitorId()).toBe(null)
    await trackVisit('guest')
    expect(fetch).not.toHaveBeenCalled()
  })
})
