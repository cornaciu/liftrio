import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, dateLocale } from '../lib/i18n.js'
import { todayISO, isoOf, fmtNum } from '../lib/format.js'
import { DEFAULT_TARGETS, NUTRIENTS, caloriesFromMacros, foodFromProduct, totalsFor } from '../lib/nutrition.js'
import { groupFoodResults, rankFoodResults } from '../lib/foodSearch.js'
import { attachDailyMicros, foodsFromEntries, mergeImportedEntries, microTotalsToUpdate, parseEatTrackWorkbook } from '../lib/nutrition-import.js'
import { Button, NumberField, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import NutritionSummary from '../components/NutritionSummary.jsx'

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']
const LABELS = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fiber: 'Fiber', salt: 'Salt' }
const MACRO_ENERGY = { protein: 4, carbs: 4, fat: 9 }

async function lookup(params) {
  const response = await fetch('/api/food?' + new URLSearchParams(params))
  if (!response.ok) throw new Error(t('Food search is temporarily unavailable. You can add the food manually.'))
  const data = await response.json()
  return { products: (data.products || []).map(foodFromProduct).filter(Boolean), market: data.market }
}

function Scanner({ onCode, onClose }) {
  const video = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false, controls
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled) return
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video.current, result => {
          if (result && !cancelled) {
            cancelled = true
            controls?.stop()
            onCode(result.getText())
          }
        })
        if (cancelled) controls.stop()
      } catch { if (!cancelled) setError(t('Camera unavailable. Enter the barcode manually.')) }
    })()
    return () => { cancelled = true; controls?.stop() }
  }, [onCode])
  return <div className="card" style={{ marginTop: 12 }}>
    <div className="row between"><strong>{t('Scan barcode')}</strong><button className="iconbtn" onClick={onClose} aria-label={t('Close')}><Icon name="xmark" /></button></div>
    <video ref={video} muted playsInline autoPlay style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 10, marginTop: 10 }} />
    <p className="small muted">{error || t('Point the camera at the product barcode.')}</p>
  </div>
}

export default function Nutrition() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const nutrition = S.nutrition || { targets: DEFAULT_TARGETS, entries: [] }
  const entries = nutrition.entries || []
  const targets = { ...DEFAULT_TARGETS, ...nutrition.targets }
  const macroCalories = caloriesFromMacros(targets)
  const targetDifference = Math.round((Number(targets.kcal) - macroCalories) * 10) / 10
  const [date, setDate] = useState(todayISO())
  const [meal, setMeal] = useState('Breakfast')
  const [food, setFood] = useState(null)
  const [grams, setGrams] = useState(100)
  const [query, setQuery] = useState('')
  const [barcode, setBarcode] = useState('')
  const [barcodeEntry, setBarcodeEntry] = useState(false)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState(false)
  const [editTargets, setEditTargets] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [importBusy, setImportBusy] = useState(false)
  const importRef = useRef(null)
  const addRef = useRef(null)
  const [custom, setCustom] = useState({ name: '', kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const totals = totalsFor(entries, date, nutrition.dailyMicros)
  const selected = entries.filter(e => e.date === date)
  const recent = [...entries].reverse().filter((e, i, all) => all.findIndex(other => (other.code || other.name) === (e.code || e.name)) === i).slice(0, 6)
  useEffect(() => { if (showAdd) addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [showAdd, meal])

  const moveDay = amount => {
    const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + amount); setDate(isoOf(d))
  }
  const search = async params => {
    setMessage(''); setBusy(true); setResults([])
    try {
      let products = [], market = 'local'
      try { ({ products, market } = await lookup(params)) }
      catch (error) { if (!nutrition.foods?.length) throw error }
      if (params.code && products.length === 1) {
        select(products[0])
        return
      }
      const localFoods = (nutrition.foods || []).filter(item => {
        const haystack = `${item.name} ${item.brand || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        return params.code ? item.code === params.code : params.q.toLowerCase().split(/\s+/).every(word => haystack.includes(word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
      })
      const ranked = params.code ? [...localFoods, ...products] : rankFoodResults([...localFoods, ...products], params.q)
      setResults(groupFoodResults(ranked))
      if (!products.length && !localFoods.length && market !== 'local') setMessage(t('No product found. Add it manually and check the label.'))
      else if (!products.length && !localFoods.length) setMessage(t('Food search is temporarily unavailable. You can add the food manually.'))
      else if (market === 'global') setMessage(t('No Romanian matches. Showing international products.'))
    } catch (e) { setMessage(e.message) }
    finally { setBusy(false) }
  }
  const readEatTrack = async file => {
    setImportBusy(true); setImportPreview(null); setMessage('')
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
      const rowsBySheet = Object.fromEntries(workbook.SheetNames.map(name => [name, XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' })]))
      const parsed = parseEatTrackWorkbook({ ...workbook, Sheets: rowsBySheet })
      const dates = [...new Set(parsed.entries.map(entry => entry.date))].sort()
      const duplicateCheck = mergeImportedEntries(entries, parsed.entries)
      const libraryCheck = foodsFromEntries(duplicateCheck.additions.map(entry => ({ ...entry })), nutrition.foods || [])
      const microUpdates = microTotalsToUpdate(nutrition.dailyMicros || {}, parsed.dailyMicros || {})
      setImportPreview({ ...parsed, fileName: file.name, dates, newEntryCount: duplicateCheck.added, duplicateCount: duplicateCheck.skippedDuplicates, newFoodCount: libraryCheck.added.length, microUpdateCount: Object.keys(microUpdates).length })
    } catch (error) {
      setMessage(error?.message || t('Could not read this Eat & Track export.'))
    } finally { setImportBusy(false) }
  }
  const confirmEatTrackImport = () => {
    if (!importPreview) return
    const lastImportedDate = importPreview.dates.at(-1)
    update(s => {
      s.nutrition ||= { targets: DEFAULT_TARGETS, entries: [], foods: [] }
      s.nutrition.entries ||= []
      s.nutrition.foods ||= []
      s.nutrition.dailyMicros ||= {}
      const freshEntries = importPreview.entries.map(entry => ({ ...entry, per100: { ...entry.per100 } }))
      const merged = mergeImportedEntries(s.nutrition.entries, freshEntries)
      const library = foodsFromEntries(merged.additions, s.nutrition.foods)
      s.nutrition.entries = attachDailyMicros(merged.entries, importPreview.dailyMicros || {})
      s.nutrition.foods = library.foods
      Object.assign(s.nutrition.dailyMicros, importPreview.dailyMicros || {})
    })
    if (lastImportedDate) setDate(lastImportedDate)
    setMessage(t('Eat & Track import completed.'))
    setImportPreview(null)
  }
  const select = item => { setFood(item); setGrams(100); setResults([]); setScanning(false); setManual(false) }
  const add = () => {
    if (!food?.name?.trim() || !(Number(grams) > 0) || Number(grams) > 10000) return
    update(s => {
      s.nutrition ||= { targets: DEFAULT_TARGETS, entries: [] }
      s.nutrition.entries ||= []
      s.nutrition.entries.push({ id: crypto.randomUUID(), date, meal, name: food.name.trim(), brand: food.brand || '', code: food.code || '', grams: Number(grams), per100: food.per100 })
    })
    setFood(null); setShowAdd(false); setMessage('')
  }
  const saveCustom = () => {
    if (!custom.name.trim()) { setMessage(t('Enter a food name.')); return }
    select({ name: custom.name.trim(), per100: Object.fromEntries(NUTRIENTS.map(k => [k, Number(custom[k]) || 0])) })
  }
  const openAdd = m => { setMeal(m); setShowAdd(true); setResults([]); setMessage('') }
  const setTarget = (key, value) => update(s => {
    s.nutrition ||= { targets: {}, entries: [] }
    s.nutrition.targets ||= {}
    const previous = { ...DEFAULT_TARGETS, ...s.nutrition.targets }
    s.nutrition.targets[key] = value
    if (['protein', 'carbs', 'fat'].includes(key) && (!previous.kcal || previous.kcal === caloriesFromMacros(previous))) {
      s.nutrition.targets.kcal = caloriesFromMacros(s.nutrition.targets)
    }
  })

  const setMacroPercent = (key, percent) => update(s => {
    s.nutrition ||= { targets: {}, entries: [] }
    s.nutrition.targets ||= {}
    const kcal = Number(s.nutrition.targets.kcal) || 0
    s.nutrition.targets[key] = Math.round(kcal * Math.min(100, Number(percent) || 0) / 100 / MACRO_ENERGY[key] * 10) / 10
  })
  const macroPercent = key => targets.kcal ? Math.round((Number(targets[key]) || 0) * MACRO_ENERGY[key] / targets.kcal * 1000) / 10 : 0
  const percentTotal = Math.round(['protein', 'carbs', 'fat'].reduce((sum, key) => sum + macroPercent(key), 0) * 10) / 10

  return <div className="narrow nutrition">
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button><h1 style={{ marginLeft: 10 }}>{t('Nutrition')}</h1></div>
    <div className="card nutrition-day-card">
      <div className="row between"><button className="iconbtn" onClick={() => moveDay(-1)} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button><strong>{new Date(date + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</strong><button className="iconbtn" onClick={() => moveDay(1)} aria-label={t('Next day')}><Icon name="chevronRight" /></button></div>
      <NutritionSummary nutrition={nutrition} date={date} state={S} />
      <button className="nutrition-target-toggle" onClick={() => setEditTargets(v => !v)} aria-expanded={editTargets}><Icon name="target" /><span>{editTargets ? t('Hide daily targets') : t('Set daily targets')}</span><Icon name="chevronRight" className={editTargets ? 'nutrition-chevron open' : 'nutrition-chevron'} /></button>
      {editTargets && <div className="nutrition-target-panel">
        <label className="nutrition-input nutrition-kcal-input">{t('Calorie goal')} (kcal)<NumberField value={targets.kcal} onChange={v => setTarget('kcal', v)} decimal={false} /></label>
        <div className="nutrition-target-macros">{['protein', 'carbs', 'fat'].map(k => <div key={k} className="nutrition-target-macro">
          <strong>{t(LABELS[k])}</strong>
          <label className="nutrition-input">{t('Percentage')} (%)<NumberField value={macroPercent(k)} onChange={v => setMacroPercent(k, v)} disabled={!targets.kcal} /></label>
          <label className="nutrition-input">{t('Grams')} (g)<NumberField value={targets[k]} onChange={v => setTarget(k, v)} /></label>
        </div>)}</div>
        <p className="nutrition-percent-total">{t('Macro percentages: {0}% total.', percentTotal)}</p>
        <div className="nutrition-target-micros">{['fiber', 'salt'].map(k => <label key={k} className="nutrition-input">{t(LABELS[k])} (g)<NumberField value={targets[k]} onChange={v => setTarget(k, v)} /></label>)}</div>
        <div className="nutrition-calculated"><div><span>{t('Calculated from macros')}</span><strong>{fmtNum(macroCalories)} kcal</strong></div><small>{t('Protein and carbs: 4 kcal/g · fat: 9 kcal/g')}</small></div>
        {Math.abs(targetDifference) >= 1 && <div className="nutrition-target-difference"><span>{t('Difference from calorie goal')}: {fmtNum(Math.abs(targetDifference))} kcal</span><button onClick={() => setTarget('kcal', macroCalories)}>{t('Use macro total')}</button></div>}
      </div>}
    </div>

    {nutrition.coachPlan && <div className="card nutrition-coach-plan">
      <div className="row between"><h2>{nutrition.coachPlan.name}</h2><span className="tag acc">{t('From {0}', nutrition.coachPlan.trainerName)}</span></div>
      <p className="small muted">{t('Your accepted nutrition plan')}</p>
      {(nutrition.coachPlan.meals || []).map((meal, index) => <div className="nutrition-coach-meal" key={index}>
        <strong>{meal.name}</strong><p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{meal.details}</p>
      </div>)}
      {nutrition.coachPlan.notes && <p className="small muted" style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{nutrition.coachPlan.notes}</p>}
    </div>}

    <div className="nutrition-section-head"><div className="nutrition-section-title"><h2>{t('Food diary')}</h2></div><Button type="button" variant="tinted" icon="upload" onClick={() => importRef.current?.click()}>{t('Import Eat & Track')}</Button></div>
    <input ref={importRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={event => { const file = event.target.files?.[0]; if (file) readEatTrack(file); event.target.value = '' }} />
    {importBusy && <div className="card nutrition-import-preview"><span>{t('Reading Eat & Track export…')}</span></div>}
    {importPreview && <div className="card nutrition-import-preview" role="status">
      <div><strong>{t('Ready to import from Eat & Track')}</strong><span className="small muted">{importPreview.fileName}</span></div>
      <p className="small muted">{t('{0} food entries across {1} days', importPreview.entries.length, importPreview.dates.length)} · {importPreview.dates[0]}{importPreview.dates.length > 1 ? ` – ${importPreview.dates[importPreview.dates.length - 1]}` : ''}</p>
      <p className="small muted">{t('{0} entries will be added; {1} new foods will be saved to your library.', importPreview.newEntryCount, importPreview.newFoodCount)}{importPreview.duplicateCount ? ` ${t('{0} already imported entries will be skipped.', importPreview.duplicateCount)}` : ''}</p>
      {Object.keys(importPreview.dailyMicros || {}).length > 0 && <p className="small muted">{t('Fiber and salt totals from the daily summary will also be imported.')}</p>}
      {importPreview.microUpdateCount > 0 && <p className="small muted">{t('{0} days of fiber and salt totals will be added or updated.', importPreview.microUpdateCount)}</p>}
      {importPreview.skipped.length > 0 && <p className="small muted">{t('{0} entries without a readable portion weight will be skipped.', importPreview.skipped.length)}</p>}
      <div className="nutrition-import-actions"><Button type="button" variant="primary" onClick={confirmEatTrackImport} disabled={!importPreview.newEntryCount && !importPreview.microUpdateCount}>{importPreview.newEntryCount ? t('Import foods and diary') : t('Update fiber and salt totals')}</Button><Button type="button" variant="tinted" onClick={() => setImportPreview(null)}>{t('Cancel')}</Button></div>
    </div>}
    {MEALS.map(m => { const items = selected.filter(e => e.meal === m); const mealCalories = items.reduce((sum, e) => sum + (e.per100?.kcal || 0) * e.grams / 100, 0); return <div className="card nutrition-meal-card" key={m}>
      <div className="nutrition-meal-head"><div><h3>{t(m)}</h3><span className="small muted">{items.length ? `${fmtNum(mealCalories)} kcal · ${items.length} ${t('foods')}` : t('Nothing logged yet')}</span></div><button className="nutrition-add" onClick={() => openAdd(m)} aria-label={`${t('Add food')} · ${t(m)}`}><Icon name="plus" /> {t('Add food')}</button></div>
      {items.map(entry => <div key={entry.id} className="nutrition-entry"><div><strong>{entry.name}</strong><div className="small muted">{fmtNum(entry.grams)} g · P {fmtNum(entry.per100.protein * entry.grams / 100)} g · C {fmtNum(entry.per100.carbs * entry.grams / 100)} g · F {fmtNum(entry.per100.fat * entry.grams / 100)} g{(entry.per100.fiber || entry.per100.salt) ? ` · ${t('Fiber')} ${fmtNum((entry.per100.fiber || 0) * entry.grams / 100)} g · ${t('Salt')} ${fmtNum((entry.per100.salt || 0) * entry.grams / 100)} g` : ''}</div></div><div className="nutrition-entry-side"><strong>{fmtNum(entry.per100.kcal * entry.grams / 100)}</strong><button className="iconbtn" aria-label={t('Delete')} onClick={() => update(s => { s.nutrition.entries = s.nutrition.entries.filter(e => e.id !== entry.id) })}><Icon name="trash" /></button></div></div>)}
    </div> })}

    {showAdd && <div className="card nutrition-add-panel" ref={addRef}>
      <div className="row between"><h2>{t('Add food')} · {t(meal)}</h2><button className="iconbtn" aria-label={t('Close')} onClick={() => setShowAdd(false)}><Icon name="xmark" /></button></div>
      <div className="nutrition-meals" aria-label={t('Choose meal')}>{MEALS.map(m => <button type="button" key={m} aria-pressed={meal === m} className={meal === m ? 'on' : ''} onClick={() => setMeal(m)}>{t(m)}</button>)}</div>
      <label className="nutrition-search-label">{t('Search a food or brand')}</label>
      <form onSubmit={e => { e.preventDefault(); if (query.trim().length >= 2) search({ q: query.trim() }) }} className="nutrition-search"><TextField aria-label={t('Search a food or brand')} value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search food or brand')} /><Button type="submit" variant="primary" disabled={busy}>{t('Search')}</Button></form>
      <div className="nutrition-actions"><Button type="button" variant="tinted" icon="barcode" onClick={() => { setScanning(true); setBarcodeEntry(false) }}>{t('Scan barcode')}</Button><Button type="button" variant="tinted" icon="plus" onClick={() => setManual(v => !v)}>{t('Add manually')}</Button></div>
      <button className="nutrition-barcode-toggle" type="button" aria-expanded={barcodeEntry} onClick={() => setBarcodeEntry(v => !v)}>{t('Enter barcode manually')} <Icon name="chevronRight" className={barcodeEntry ? 'nutrition-chevron open' : 'nutrition-chevron'} /></button>
      {barcodeEntry && <form className="nutrition-search nutrition-barcode-form" onSubmit={e => { e.preventDefault(); if (/^\d{8,14}$/.test(barcode)) search({ code: barcode }) }}><TextField aria-label={t('Or enter barcode digits')} inputMode="numeric" pattern="[0-9]{8,14}" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder={t('Or enter barcode digits')} /><Button type="submit">{t('Find')}</Button></form>}
      {scanning && <Scanner onClose={() => setScanning(false)} onCode={code => { setScanning(false); setBarcode(code); search({ code }) }} />}
      {busy && <p className="small muted">{t('Searching…')}</p>}
      {message && <p className="small muted" role="status">{message}</p>}
      {!food && !results.length && !busy && recent.length > 0 && <div className="nutrition-recent"><h3>{t('Recently logged')}</h3>{recent.map((entry, i) => <button key={entry.id || i} className="nutrition-result" onClick={() => select(entry)}><span><strong>{entry.name}</strong><small>{entry.brand}</small></span><span>{fmtNum(entry.per100.kcal)} kcal / 100 g</span></button>)}</div>}
      {results.map((group, i) => group.variants.length === 1
        ? <button key={`${group.name}-${group.brand}-${i}`} className="nutrition-result" onClick={() => select(group.variants[0])}><span><strong>{group.name}</strong><small>{group.brand}</small></span><span>{fmtNum(group.variants[0].per100.kcal)} kcal / 100 g</span></button>
        : <details key={`${group.name}-${group.brand}-${i}`} className="nutrition-result-group">
          <summary className="nutrition-result"><span><strong>{group.name}</strong><small>{group.brand || t('Unbranded entry')} · {group.variants.length} {t('options')}</small></span><span>{t('Choose')}</span></summary>
          <div className="nutrition-result-variants">{group.variants.map((item, variantIndex) => <button key={item.code || `${item.per100.kcal}-${item.per100.protein}-${item.per100.carbs}-${item.per100.fat}-${variantIndex}`} className="nutrition-result-variant" onClick={() => select(item)}><span>{t('Option')} {variantIndex + 1}</span><span>{fmtNum(item.per100.kcal)} kcal / 100 g<small>P {fmtNum(item.per100.protein)} g · C {fmtNum(item.per100.carbs)} g · F {fmtNum(item.per100.fat)} g · Fi {fmtNum(item.per100.fiber || 0)} g · {t('Salt')}: {fmtNum(item.per100.salt || 0)} g</small></span></button>)}</div>
        </details>)}
      {manual && <div className="nutrition-form"><TextField value={custom.name} onChange={e => setCustom({ ...custom, name: e.target.value })} placeholder={t('Food name')} /><p className="small muted">{t('Nutrition values per 100 g, from the product label.')}</p><div className="nutrition-grid">{NUTRIENTS.map(k => <label key={k} className="nutrition-input">{t(LABELS[k])}{k === 'salt' ? ' (g)' : k === 'fiber' ? ' (g)' : ''}<NumberField value={custom[k] ?? 0} onChange={v => setCustom(c => ({ ...c, [k]: v }))} /></label>)}</div><Button onClick={saveCustom}>{t('Continue')}</Button></div>}
      {food && <div className="nutrition-form"><strong>{food.name}</strong>{food.brand && <span className="small muted">{food.brand}</span>}<p className="small muted">{t('Check the product label. Values are per 100 g.')}: {NUTRIENTS.map(k => `${t(LABELS[k])}: ${fmtNum(food.per100[k] || 0)}${k === 'kcal' ? '' : ' g'}`).join(' · ')}</p><label className="nutrition-input">{t('Amount eaten (g)')}<NumberField value={grams} onChange={setGrams} /></label><Button variant="primary" onClick={add} disabled={!grams || grams > 10000}>{t('Add to diary')}</Button></div>}
      <p className="nutrition-source-note">{t('Product data: Open Food Facts. Check the label before logging.')}</p>
    </div>}
  </div>
}
