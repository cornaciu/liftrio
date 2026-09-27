import { describe, expect, it } from 'vitest'
import { foodsFromEntries, mergeImportedEntries, parseEatTrackWorkbook, sameLibraryFood } from './nutrition-import.js'
import { totalsFor } from './nutrition.js'

const workbook = { SheetNames: ['Jurnal', 'Jurnal (Sumar)'], Sheets: { Jurnal: [
  ['Marți, 22 Septembrie, 2026'],
  ['Mic Dejun'], ['Aliment', 'Portie', 'Proteine', 'Carbohidrati', 'Grasimi', 'Calorii'],
  ['Ou fiert', '3 Oua medii - M (180g)', 22.68, 1.98, 19.08, 279],
  ['Ulei de masline', '1 Lingurita (5ml)', 0, 0, 5, 41.2],
  ['Total:', 22.68, 1.98, 24.08, 320.2],
  ['Cina'], ['Aliment', 'Portie', 'Proteine', 'Carbohidrati', 'Grasimi', 'Calorii'],
  ['Ou fiert', '100 Grame', 12.6, 1.1, 10.6, 155],
  ['Total:', 12.6, 1.1, 10.6, 155],
  ['Miercuri, 23 Septembrie, 2026'],
  ['Gustare'], ['Aliment', 'Portie', 'Proteine', 'Carbohidrati', 'Grasimi', 'Calorii'],
  ['Iaurt', '1 portie', 10, 5, 2, 80]
] , 'Jurnal (Sumar)': [
  ['Data', 'Calorii (kCal)', 'Proteine (g)', 'Carbohidrati (g)', 'Grasimi (g)', 'Grasimi saturate (g)', 'Zaharuri (g)', 'Fibre (g)', 'Sare (mg)'],
  ['22-09-2026', 2000, 150, 200, 70, 20, 25, 24.5, 5200]
] } }

describe('Eat & Track nutrition import', () => {
  it('reads dated meal rows, converts portions into per-100g nutrients and skips unmeasurable servings', () => {
    let id = 0
    const result = parseEatTrackWorkbook(workbook, () => `entry-${++id}`)
    expect(result.entries).toHaveLength(3)
    expect(result.entries[0]).toMatchObject({ date: '2026-09-22', meal: 'Breakfast', name: 'Ou fiert', grams: 180 })
    expect(result.entries[0].per100).toEqual({ kcal: 155, protein: 12.6, carbs: 1.1, fat: 10.6, fiber: 0, salt: 0 })
    expect(result.entries[1].per100).toMatchObject({ kcal: 824, fat: 100 })
    expect(result.entries[2]).toMatchObject({ date: '2026-09-22', meal: 'Dinner' })
    expect(result.skipped).toHaveLength(1)
    expect(result.dailyMicros['2026-09-22']).toEqual({ fiber: 24.5, salt: 5.2 })
  })

  it('reuses matching library items and avoids importing the same workbook rows twice', () => {
    const parsed = parseEatTrackWorkbook(workbook, () => 'same-id')
    const first = mergeImportedEntries([], parsed.entries)
    const duplicate = mergeImportedEntries(first.entries, parsed.entries)
    const library = foodsFromEntries(first.additions, [])
    expect(first.added).toBe(3)
    expect(duplicate.added).toBe(0)
    expect(library.foods).toHaveLength(2)
    expect(library.added).toHaveLength(2)
    expect(sameLibraryFood(library.foods[0], parsed.entries[0])).toBe(true)
  })

  it('rejects exports without the detailed food journal', () => {
    expect(() => parseEatTrackWorkbook({ SheetNames: ['Jurnal (Sumar)'], Sheets: {} })).toThrow(/Jurnal/)
  })

  it('combines Eat & Track daily fiber and salt totals with later foods without double counting imported entries', () => {
    const date = '2026-09-22'
    const dailyMicros = { [date]: { fiber: 24.5, salt: 5.2 } }
    const entries = [
      { date, source: 'eat-track', grams: 100, per100: { kcal: 100, protein: 10, carbs: 10, fat: 2, fiber: 0, salt: 0 } },
      { date, grams: 50, per100: { kcal: 200, protein: 5, carbs: 20, fat: 3, fiber: 4, salt: 1.2 } }
    ]
    expect(totalsFor(entries, date, dailyMicros)).toEqual({ kcal: 200, protein: 12.5, carbs: 20, fat: 3.5, fiber: 26.5, salt: 5.8 })
  })
})
