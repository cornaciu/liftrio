import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import NutritionSummary from './NutritionSummary.jsx'
import { estimateWorkoutEnergy } from '../lib/workout-energy.js'
import { fmtNum } from '../lib/format.js'

describe('daily nutrition and workout balance', () => {
  it('credits finished workouts on the selected date and leaves macros unchanged', () => {
    const date = '2026-09-27'
    const start = Date.parse('2026-09-27T10:00:00Z')
    const workout = { d: date, start, end: start + 3600000, bw: 75, unit: 'kg',
      entries: [{ id: 'lift', target: { mode: 'reps' }, sets: Array(16).fill(null).map(() => ({ done: true, w: 60, r: 10, rir: 2 })) }] }
    const S = { unit: 'kg', workouts: [workout], bodyweight: [] }
    const nutrition = { targets: { kcal: 2000, protein: 150, carbs: 200, fat: 70 },
      entries: [{ date, grams: 100, per100: { kcal: 500, protein: 30, carbs: 50, fat: 20 } }] }
    const burned = estimateWorkoutEnergy(workout, S).kcal
    const html = renderToStaticMarkup(<NutritionSummary nutrition={nutrition} date={date} state={S} />)
    expect(html).toContain(`+~${fmtNum(burned)} kcal`)
    expect(html).toContain(`${fmtNum(2000 + burned - 500)} <small>kcal</small>`)
    expect(html).toContain('30</strong><span class="muted"> / 150</span> g')
    const otherDate = renderToStaticMarkup(<NutritionSummary nutrition={nutrition} date="2026-09-26" state={S} />)
    expect(otherDate).not.toContain('Workout calories')
  })

  it('centers the calorie value and shows imported fiber and salt totals', () => {
    const date = '2026-09-27'
    const html = renderToStaticMarkup(<NutritionSummary nutrition={{ entries: [], dailyMicros: { [date]: { fiber: 17.77, salt: 9.069 } } }} date={date} state={{ workouts: [] }} />)
    expect(html).toContain('class="nutrition-ring-center"')
    expect(html).toContain('Fiber')
    expect(html).toContain('17.8')
    expect(html).toContain('Salt')
    expect(html).toContain('9.1')
  })
})
