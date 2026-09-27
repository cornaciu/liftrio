import { describe, expect, it } from 'vitest'
import { estimateWorkoutEnergy, workoutCaloriesForDate } from './workout-energy.js'

const start = new Date('2026-09-27T10:00:00Z').getTime()
const set = (w = 60, rir = 2) => ({ done: true, w, r: 10, rir })
const workout = (sets = Array(16).fill(null).map(() => set()), minutes = 60) => ({
  d: '2026-09-27', start, end: start + minutes * 60000, bw: 75, unit: 'kg',
  entries: [{ id: 'unknown-lift', sets, target: { mode: 'reps' } }],
})

describe('workout active calorie estimate', () => {
  it('uses a conservative session estimate and excludes resting energy', () => {
    const result = estimateWorkoutEnergy(workout(), { unit: 'kg', bodyweight: [] })
    expect(result.kcal).toBeGreaterThan(170)
    expect(result.kcal).toBeLessThan(310)
    expect(result.weightSource).toBe('session')
  })

  it('reacts modestly to recorded effort and weight without equating kg lifted to kcal', () => {
    const light = estimateWorkoutEnergy(workout(Array(16).fill(null).map(() => set(20, 5))), { unit: 'kg' })
    const hard = estimateWorkoutEnergy(workout(Array(16).fill(null).map(() => set(100, 0))), { unit: 'kg' })
    expect(hard.kcal).toBeGreaterThan(light.kcal)
    expect(hard.kcal / light.kcal).toBeLessThan(1.5)
  })

  it('uses the last available weigh-in for a workout imported without body weight', () => {
    const w = { ...workout(), bw: null }
    const result = estimateWorkoutEnergy(w, { unit: 'kg', bodyweight: [{ d: '2026-09-26', w: 74 }] })
    expect(result.weightKg).toBe(74)
    expect(result.weightSource).toBe('prior')
  })

  it('infers duration for older imports with no usable times', () => {
    const w = workout()
    const imported = estimateWorkoutEnergy({ ...w, end: w.start, bw: null }, {
      unit: 'kg', bodyweight: [{ d: '2026-09-28', w: 74 }]
    })
    expect(imported.durationSource).toBe('inferred')
    expect(imported.minutes).toBe(44)
    expect(imported.weightSource).toBe('latest')
    expect(imported.kcal).toBeGreaterThan(0)
  })

  it('totals completed workouts only on their own date', () => {
    const first = workout()
    const second = { ...workout(), bw: 75, end: start, id: 'older-import' }
    const S = { unit: 'kg', bodyweight: [], workouts: [first, second, { ...workout(), d: '2026-09-26' }] }
    expect(workoutCaloriesForDate(S, '2026-09-27')).toBe(
      estimateWorkoutEnergy(first, S).kcal + estimateWorkoutEnergy(second, S).kcal
    )
    expect(workoutCaloriesForDate(S, '2026-09-25')).toBe(0)
  })

  it('needs body weight and completed sets to make an estimate', () => {
    const w = workout()
    expect(estimateWorkoutEnergy({ ...w, bw: null }, { unit: 'kg', bodyweight: [] })).toBeNull()
    expect(estimateWorkoutEnergy(workout([{ done: false, w: 60, r: 10 }]), { unit: 'kg' })).toBeNull()
  })
})
