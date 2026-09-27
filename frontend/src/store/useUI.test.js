import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ api: vi.fn(), beep: vi.fn(), vibrate: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: mocks.api }))
vi.mock('../lib/sound.js', () => ({ beep: mocks.beep, vibrate: mocks.vibrate }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, scheduleRestAlert: vi.fn(), cancelRestAlert: vi.fn() }))
vi.mock('./useStore.js', () => ({ useStore: { getState: () => ({ user: { id: 'user-1' }, S: { sound: false } }) } }))

const flush = async () => { for (let i = 0; i < 32; i++) await Promise.resolve() }
let useUI
let listeners

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  listeners = new Map()
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener: vi.fn((name, fn) => listeners.set(name, fn)),
    removeEventListener: vi.fn((name, fn) => { if (listeners.get(name) === fn) listeners.delete(name) })
  }
  mocks.api.mockReset().mockResolvedValue({ ok: true })
  mocks.beep.mockReset()
  ;({ useUI } = await import('./useUI.js'))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  delete globalThis.document
})

describe('rest alerts', () => {
  it('sends cancel before the replacement timer schedule even when the first request is slow', async () => {
    let release
    mocks.api.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    useUI.getState().startRest(30)
    await flush()
    useUI.getState().startRest(45)
    await flush()
    expect(mocks.api.mock.calls.map(([path]) => path)).toEqual(['/api/push/rest-timer'])
    release({ ok: true })
    await flush()
    expect(mocks.api.mock.calls.map(([path]) => path)).toEqual([
      '/api/push/rest-timer', '/api/push/rest-timer/cancel', '/api/push/rest-timer'
    ])
    expect(JSON.parse(mocks.api.mock.calls[2][1].body)).toEqual({ seconds: 45 })
  })

  it('does not cancel a due push when the app resumes after the rest expired while hidden', async () => {
    useUI.getState().startRest(10)
    await flush()
    document.visibilityState = 'hidden'
    listeners.get('visibilitychange')()
    vi.advanceTimersByTime(11000)
    document.visibilityState = 'visible'
    listeners.get('visibilitychange')()
    await flush()
    expect(useUI.getState().timer).toBeNull()
    expect(mocks.api.mock.calls.map(([path]) => path)).toEqual(['/api/push/rest-timer'])
  })

  it('cancels a pending push when the app returns before the timer expires', async () => {
    useUI.getState().startRest(20)
    await flush()
    document.visibilityState = 'hidden'
    listeners.get('visibilitychange')()
    vi.advanceTimersByTime(5000)
    document.visibilityState = 'visible'
    listeners.get('visibilitychange')()
    vi.advanceTimersByTime(16000)
    await flush()
    expect(mocks.api.mock.calls.map(([path]) => path)).toEqual([
      '/api/push/rest-timer', '/api/push/rest-timer/cancel'
    ])
  })
})
