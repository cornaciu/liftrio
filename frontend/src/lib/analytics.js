import { DEMO } from './demo.js'
import { MOBILE } from './mobile.js'

const ID_KEY = 'liftrio_visitor_id'
const OPT_OUT_KEY = 'liftrio_analytics_disabled'
export const ANALYTICS_CHANGED = 'liftrio:analytics-changed'
const lastSent = new Map()

export function analyticsEnabled() {
  if (DEMO || MOBILE) return false
  try { return localStorage.getItem(OPT_OUT_KEY) !== '1' } catch { return false }
}

export function visitorId() {
  if (!analyticsEnabled()) return null
  try {
    let id = localStorage.getItem(ID_KEY)
    if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id || '')) {
      id = globalThis.crypto?.randomUUID?.()
      if (!id) return null
      localStorage.setItem(ID_KEY, id)
    }
    return id
  } catch { return null }
}

export function setAnalyticsEnabled(enabled) {
  try {
    if (enabled) localStorage.removeItem(OPT_OUT_KEY)
    else {
      localStorage.setItem(OPT_OUT_KEY, '1')
      localStorage.removeItem(ID_KEY)
    }
  } catch { /* unavailable storage: analytics stays disabled */ }
  lastSent.clear()
  window.dispatchEvent(new Event(ANALYTICS_CHANGED))
}

export function trackVisit(mode) {
  if (document.visibilityState === 'hidden') return
  const id = visitorId()
  if (!id || !['landing', 'guest'].includes(mode)) return
  const key = id + ':' + mode
  const now = Date.now()
  if (lastSent.has(key) && now - lastSent.get(key) < 60000) return
  lastSent.set(key, now)
  // Best effort: a failed/offline analytics request never interrupts local usage.
  return fetch('/api/analytics/visit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: id, mode }), keepalive: true,
  }).then(response => { if (!response.ok) lastSent.delete(key) })
    .catch(() => { lastSent.delete(key) })
}
