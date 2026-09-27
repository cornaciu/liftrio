const normalize = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .split(/\s+/)
  .map(word => word.endsWith('ies') && word.length > 4
    ? `${word.slice(0, -3)}y`
    : word.endsWith('s') && !word.endsWith('ss') && word.length > 4
      ? word.slice(0, -1)
      : word)
  .join(' ')

const macroKey = item => ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'salt']
  .map(key => Math.round((Number(item.per100?.[key]) || 0) * 10) / 10)
  .join(':')

export function rankFoodResults(items, query) {
  const normalizedQuery = normalize(query)
  const queryWords = normalizedQuery.split(' ').filter(Boolean)
  const score = item => {
    const name = normalize(item.name)
    const matchedWords = queryWords.filter(word => name.includes(word)).length
    return (name === normalizedQuery ? 100 : name.includes(normalizedQuery) ? 60 : matchedWords * 10) +
      (!item.brand ? 5 : 0)
  }
  return [...items].sort((a, b) => score(b) - score(a))
}

export function groupFoodResults(items) {
  const groups = new Map()
  for (const item of items) {
    const key = `${normalize(item.name)}\u0000${normalize(item.brand)}`
    let group = groups.get(key)
    if (!group) {
      group = { name: item.name, brand: item.brand || '', variants: [], seen: new Set() }
      groups.set(key, group)
    }
    const fingerprint = `${item.code || ''}\u0000${macroKey(item)}`
    if (group.seen.has(fingerprint)) continue
    // Identical label/name/brand and identical macros are duplicate records.
    // Keep different macro profiles selectable as variants within one group.
    const sameNutrition = group.variants.some(existing => macroKey(existing) === macroKey(item))
    if (item.code && group.variants.some(existing => existing.code === item.code)) continue
    if (sameNutrition) continue
    group.seen.add(fingerprint)
    group.variants.push(item)
  }
  return [...groups.values()].map(({ seen, ...group }) => group)
}
