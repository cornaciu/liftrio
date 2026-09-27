import { modeOf } from './history.js'

const clamp = (n, min, max) => Math.min(max, Math.max(min, n))
const kgOf = (weight, unit) => Number(weight) * (unit === 'lb' ? 0.45359237 : 1)

/** Approximate ACTIVE energy, excluding the calories burned at rest during the session.
 * 2024 Adult Compendium: varied resistance training 3.5 MET, vigorous lifting 6 MET.
 * https://pacompendium.com/conditioning-exercise/
 * MET is roughly kcal per kg per hour: https://pacompendium.com/
 * Sets, relative volume and recorded effort only make modest adjustments to the session
 * average. Weight on a bar is not itself a direct measure of metabolic work.
 */
export function estimateWorkoutEnergy(workout, state) {
  if (!workout) return null

  const sets = (workout.entries || []).flatMap(entry =>
    (entry.sets || []).filter(s => s.done).map(s => ({ entry, set: s })))
  if (!sets.length) return null
  const cardio = sets.filter(({ entry }) => modeOf({ ...(entry.target || {}), id: entry.id }) === 'cardio')
  const strength = sets.filter(({ entry }) => modeOf({ ...(entry.target || {}), id: entry.id }) !== 'cardio')
  const cardioLogged = cardio.reduce((sum, { set }) => sum + Math.max(0, Number(set.min) || 0), 0)
  const loggedMinutes = (+workout.end - +workout.start) / 60000
  const durationSource = Number.isFinite(loggedMinutes) && loggedMinutes >= 1 && loggedMinutes <= 360 ? 'logged' : 'inferred'
  // Many CSV exports have sets but no trustworthy start/end time. Use the cardio minutes
  // plus a modest per-set allowance for lifting and rest; mark this as inferred in the UI.
  const inferredMinutes = cardioLogged + (strength.length ? clamp(4 + strength.length * 2.5, 5, 180) : 0)
  const minutes = durationSource === 'logged' ? loggedMinutes : clamp(inferredMinutes || 5, 5, 240)

  const ownWeight = Number(workout.bw)
  const weighIns = (state?.bodyweight || []).filter(b => Number(b.w) > 0)
  const prior = weighIns.filter(b => b.d <= workout.d).sort((a, b) => b.d.localeCompare(a.d))[0]
  const measured = ownWeight > 0 ? ownWeight : (prior || weighIns.at(-1))?.w
  const weightKg = kgOf(measured, ownWeight > 0 ? (workout.unit || state?.unit) : state?.unit)
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 350) return null

  const cardioMinutes = Math.min(minutes, cardioLogged)
  const strengthMinutes = minutes - cardioMinutes

  const hours = Math.max(minutes / 60, 1 / 60)
  const density = strength.length / hours
  const volumeKg = strength.reduce((sum, { set }) =>
    sum + Math.max(0, kgOf(set.w || 0, workout.unit || state?.unit)) * Math.max(0, Number(set.r) || 0), 0)
  const relativeVolume = volumeKg / weightKg / hours
  const ratings = strength.map(({ set }) =>
    set.rir != null ? Number(set.rir) : set.rpe != null ? 10 - Number(set.rpe) : null)
    .filter(n => Number.isFinite(n))
  const avgRir = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  const effort = avgRir == null ? 0 : clamp((3 - avgRir) * 0.12, -0.3, 0.36)
  const strengthMet = clamp(3.5 + clamp((density - 16) * 0.045, -0.4, 1.0)
    + clamp((relativeVolume - 30) * 0.004, 0, 0.3) + effort, 3, 5.5)
  // Cardio equipment isn't recorded reliably enough to infer running or cycling economy.
  const cardioMet = 5.5
  const kcal = Math.round(weightKg * (strengthMinutes * (strength.length ? strengthMet - 1 : 0)
    + cardioMinutes * (cardioMet - 1)) / 60)
  return { kcal, minutes: Math.round(minutes), weightKg: Math.round(weightKg * 10) / 10,
    met: Math.round(strengthMet * 10) / 10, durationSource,
    weightSource: ownWeight > 0 ? 'session' : prior ? 'prior' : 'latest' }
}

export function workoutCaloriesForDate(state, date) {
  return (state?.workouts || []).filter(w => w.d === date).reduce((sum, w) =>
    sum + (estimateWorkoutEnergy(w, state)?.kcal || 0), 0)
}
