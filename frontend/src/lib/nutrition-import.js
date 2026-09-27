import { NUTRIENTS } from './nutrition.js'

const MACROS = ['kcal', 'protein', 'carbs', 'fat']

const MONTHS_RO = {
  ianuarie: 1, februarie: 2, martie: 3, aprilie: 4, mai: 5, iunie: 6,
  iulie: 7, august: 8, septembrie: 9, octombrie: 10, noiembrie: 11, decembrie: 12
}
const text = value => String(value ?? '').trim()
const key = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const number = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(text(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function dateFromHeader(value) {
  const match = text(value).toLocaleLowerCase('ro').match(/(?:^|\s)(\d{1,2})\s+([a-zăâîșț]+),?\s+(\d{4})/i)
  if (!match) return null
  const month = MONTHS_RO[key(match[2])]
  if (!month) return null
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`
}

function dateFromSummary(value) {
  const match = text(value).match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (!match) return null
  return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`
}

function gramsFromServing(value) {
  const matches = [...text(value).matchAll(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grame?|grams?|ml)\b/gi)]
  if (!matches.length) return 0
  return number(matches[matches.length - 1][1])
}

const MEALS = {
  'mic dejun': 'Breakfast', breakfast: 'Breakfast',
  pranz: 'Lunch', lunch: 'Lunch',
  cina: 'Dinner', dinner: 'Dinner',
  gustare: 'Snacks', gustari: 'Snacks', snacks: 'Snacks'
}

/** Parse the detailed “Jurnal” sheet in an Eat & Track XLSX export. */
export function parseEatTrackWorkbook(workbook, idFactory = () => crypto.randomUUID()) {
  const sheetName = workbook.SheetNames?.find(name => key(name) === 'jurnal')
  if (!sheetName) throw new Error('The Eat & Track “Jurnal” sheet was not found.')
  const rows = workbook.Sheets[sheetName]
  const entries = []
  const skipped = []
  const summarySheet = workbook.SheetNames?.find(name => key(name).startsWith('jurnal sumar'))
  const dailyMicros = {}
  if (summarySheet) {
    const summaryRows = workbook.Sheets[summarySheet] || []
    const header = (summaryRows[0] || []).map(key)
    const dateIndex = header.indexOf('data')
    const fiberIndex = header.findIndex(value => value.startsWith('fibre') || value.startsWith('fiber'))
    const saltIndex = header.findIndex(value => value.startsWith('sare') || value.startsWith('salt'))
    const saltScale = saltIndex >= 0 && header[saltIndex].includes('mg') ? 1000 : 1
    if (dateIndex >= 0) {
      for (const row of summaryRows.slice(1)) {
        const summaryDate = dateFromSummary(row[dateIndex])
        if (!summaryDate) continue
        dailyMicros[summaryDate] = {
          ...(fiberIndex >= 0 ? { fiber: number(row[fiberIndex]) } : {}),
          ...(saltIndex >= 0 ? { salt: number(row[saltIndex]) / saltScale } : {})
        }
      }
    }
  }
  let date = null
  let meal = null
  let inFoodTable = false

  for (const [rowIndex, row] of rows.entries()) {
    const first = key(row[0])
    const parsedDate = dateFromHeader(row[0])
    if (parsedDate) { date = parsedDate; meal = null; inFoodTable = false; continue }
    if (first === 'aliment' && key(row[1]) === 'portie') { inFoodTable = true; continue }
    if (MEALS[first]) { meal = MEALS[first]; inFoodTable = false; continue }
    if (first === 'total' || first === 'total zi') { inFoodTable = false; continue }
    if (!inFoodTable || !date || !meal || !text(row[0])) continue

    const name = text(row[0])
    const grams = gramsFromServing(row[1])
    const consumed = {
      protein: number(row[2]), carbs: number(row[3]), fat: number(row[4]), kcal: number(row[5])
    }
    if (!grams || !MACROS.every(nutrient => Number.isFinite(consumed[nutrient]))) {
      skipped.push({ name, row: rowIndex + 1, reason: !grams ? 'missing serving weight' : 'invalid nutrition values' })
      continue
    }
    const per100 = Object.fromEntries(NUTRIENTS.map(nutrient => [nutrient, MACROS.includes(nutrient) ? Math.round(consumed[nutrient] / grams * 1000) / 10 : 0]))
    entries.push({
      id: idFactory(), importRef: `eat-track:${date}:${rowIndex + 1}`, source: 'eat-track',
      date, meal, name, brand: '', grams, per100
    })
  }

  if (!entries.length) throw new Error('No food entries with measurable portions were found in the “Jurnal” sheet.')
  return { entries, skipped, dailyMicros }
}

export function sameLibraryFood(a, b) {
  if (key(a?.name) !== key(b?.name)) return false
  return NUTRIENTS.every(nutrient => Math.abs(number(a?.per100?.[nutrient]) - number(b?.per100?.[nutrient])) <= (nutrient === 'kcal' ? 1 : 0.2))
}

export function foodsFromEntries(entries, existing = [], idFactory = () => crypto.randomUUID()) {
  const foods = [...existing]
  const added = []
  for (const entry of entries) {
    const match = foods.find(food => sameLibraryFood(food, entry))
    if (match) { entry.foodId = match.id; continue }
    const food = { id: idFactory(), name: entry.name, brand: entry.brand || '', per100: { ...entry.per100 }, source: 'eat-track' }
    foods.push(food); added.push(food); entry.foodId = food.id
  }
  return { foods, added }
}

export function mergeImportedEntries(existing = [], imported = []) {
  const refs = new Set(existing.map(entry => entry.importRef).filter(Boolean))
  const additions = imported.filter(entry => !entry.importRef || !refs.has(entry.importRef))
  return { entries: [...existing, ...additions], additions, added: additions.length, skippedDuplicates: imported.length - additions.length }
}

/** Return daily micronutrient summaries that are missing or differ from an import. */
export function microTotalsToUpdate(existing = {}, imported = {}, tolerance = 0.001) {
  return Object.fromEntries(Object.entries(imported).filter(([date, incoming]) => {
    const current = existing[date]
    return !current || ['fiber', 'salt'].some(nutrient =>
      Number.isFinite(Number(incoming?.[nutrient])) &&
      Math.abs(Number(current[nutrient] || 0) - Number(incoming[nutrient])) > tolerance
    )
  }))
}

/** Keep the imported daily summary on the journal rows as a durable fallback. */
export function attachDailyMicros(entries = [], dailyMicros = {}) {
  const attachedDates = new Set()
  return entries.map(entry => {
    const copy = { ...entry }
    delete copy.dailyMicros
    if (copy.source === 'eat-track' && dailyMicros[copy.date] && !attachedDates.has(copy.date)) {
      copy.dailyMicros = { ...dailyMicros[copy.date] }
      attachedDates.add(copy.date)
    }
    return copy
  })
}
