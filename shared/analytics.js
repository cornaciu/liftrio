import crypto from 'node:crypto';

export const ANALYTICS_PREFIX = 'analytics:visitor:';
export const SESSION_GAP = 30 * 60 * 1000;

// Only a random browser token is accepted. Names, account IDs and request metadata
// never enter the analytics record. The stored token cannot be reused by the client.
export function analyticsVisitorKey(id, secret) {
  if (typeof id !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id)) return null;
  return ANALYTICS_PREFIX + crypto.createHmac('sha256', secret).update(id.toLowerCase()).digest('hex');
}

export function recordVisit(previous, mode, now = Date.now()) {
  if (!['landing', 'guest'].includes(mode)) throw new Error('invalid analytics mode');
  const freshSession = !previous || now - previous.lastSeen >= SESSION_GAP;
  const record = previous ? { ...previous } : {
    firstSeen: now, sessions: 0, guestSessions: 0,
    firstGuestAt: null, lastGuestAt: null, convertedAt: null,
  };
  if (freshSession) {
    record.sessions += 1;
    record.sessionHasGuest = false;
  }
  record.lastSeen = now;
  if (mode === 'guest') {
    if (!record.sessionHasGuest) record.guestSessions += 1;
    record.sessionHasGuest = true;
    record.firstGuestAt ??= now;
    record.lastGuestAt = now;
  }
  return record;
}

export function recordConversion(previous, now = Date.now()) {
  // A successful new registration counts once, only after guest usage on this browser.
  if (!previous?.firstGuestAt || previous.convertedAt) return previous;
  return { ...previous, convertedAt: now };
}
