import { describe, expect, it } from 'vitest'
import { groupFoodResults, rankFoodResults } from './foodSearch.js'

const food = (name, { brand = '', kcal = 120, protein = 25, carbs = 0, fat = 2, code = '' } = {}) => ({
  name, brand, code, per100: { kcal, protein, carbs, fat }
})

describe('food search results', () => {
  it('ranks an unbranded exact-name match ahead of branded matches', () => {
    const ranked = rankFoodResults([
      food('Grilled Chicken Breast', { brand: 'Great Value' }),
      food('Grilled chicken breasts')
    ], 'grilled chicken breast')

    expect(ranked[0].brand).toBe('')
  })

  it('groups case and plural duplicates, while keeping different nutrition values selectable', () => {
    const groups = groupFoodResults([
      food('Grilled Chicken Breast', { kcal: 120 }),
      food('grilled chicken breasts', { kcal: 120 }),
      food('Grilled chicken breast', { kcal: 110 }),
      food('Grilled chicken breast', { brand: 'Great Value', kcal: 119 })
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].variants.map(item => item.per100.kcal)).toEqual([120, 110])
    expect(groups[1].brand).toBe('Great Value')
  })

  it('removes repeated records with the same barcode', () => {
    const groups = groupFoodResults([
      food('Grilled chicken breast', { code: '12345678', kcal: 120 }),
      food('Grilled chicken breast', { code: '12345678', kcal: 130 })
    ])

    expect(groups[0].variants).toHaveLength(1)
  })
})
