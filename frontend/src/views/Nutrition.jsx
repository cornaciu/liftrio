import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, dateLocale } from '../lib/i18n.js'
import { todayISO, isoOf, fmtNum } from '../lib/format.js'
import { DEFAULT_TARGETS, NUTRIENTS, foodFromProduct, totalsFor } from '../lib/nutrition.js'
import { Button, NumberField, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import NutritionSummary from '../components/NutritionSummary.jsx'

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']
const LABELS = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' }

async function lookup(params) {
  const response = await fetch('/api/food?' + new URLSearchParams(params))
  if (!response.ok) throw new Error(t('Food search is temporarily unavailable. You can add the food manually.'))
  return ((await response.json()).products || []).map(foodFromProduct).filter(Boolean)
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
  const [date, setDate] = useState(todayISO())
  const [meal, setMeal] = useState('Breakfast')
  const [food, setFood] = useState(null)
  const [grams, setGrams] = useState(100)
  const [query, setQuery] = useState('')
  const [barcode, setBarcode] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState(false)
  const [editTargets, setEditTargets] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const addRef = useRef(null)
  const [custom, setCustom] = useState({ name: '', kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const totals = totalsFor(entries, date)
  const selected = entries.filter(e => e.date === date)
  const recent = [...entries].reverse().filter((e, i, all) => all.findIndex(other => (other.code || other.name) === (e.code || e.name)) === i).slice(0, 6)
  useEffect(() => { if (showAdd) addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [showAdd, meal])

  const moveDay = amount => {
    const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + amount); setDate(isoOf(d))
  }
  const search = async params => {
    setMessage(''); setBusy(true); setResults([])
    try {
      const products = await lookup(params)
      setResults(products)
      if (!products.length) setMessage(t('No product found. Add it manually and check the label.'))
      if (params.code && products.length === 1) select(products[0])
    } catch (e) { setMessage(e.message) }
    finally { setBusy(false) }
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

  return <div className="narrow nutrition">
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button><h1 style={{ marginLeft: 10 }}>{t('Nutrition')}</h1></div>
    <div className="card nutrition-day-card">
      <div className="row between"><button className="iconbtn" onClick={() => moveDay(-1)} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button><strong>{new Date(date + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</strong><button className="iconbtn" onClick={() => moveDay(1)} aria-label={t('Next day')}><Icon name="chevronRight" /></button></div>
      <NutritionSummary nutrition={nutrition} date={date} />
      <button className="nutrition-link" onClick={() => setEditTargets(v => !v)}>{t('Daily targets')}</button>
      {editTargets && <div className="nutrition-grid">{NUTRIENTS.map(k => <label key={k} className="nutrition-input">{t(LABELS[k])} ({k === 'kcal' ? 'kcal' : 'g'})<NumberField value={targets[k]} onChange={v => update(s => { s.nutrition ||= { targets: {}, entries: [] }; s.nutrition.targets ||= {}; s.nutrition.targets[k] = v })} /></label>)}</div>}
    </div>

    <div className="nutrition-section-head"><h2>{t('Food diary')}</h2><span className="small muted">{fmtNum(totals.kcal)} kcal</span></div>
    {MEALS.map(m => { const items = selected.filter(e => e.meal === m); const mealCalories = items.reduce((sum, e) => sum + (e.per100?.kcal || 0) * e.grams / 100, 0); return <div className="card nutrition-meal-card" key={m}>
      <div className="nutrition-meal-head"><div><h3>{t(m)}</h3><span className="small muted">{items.length ? `${fmtNum(mealCalories)} kcal · ${items.length} ${t('foods')}` : t('Nothing logged yet')}</span></div><button className="nutrition-add" onClick={() => openAdd(m)} aria-label={`${t('Add food')} · ${t(m)}`}><Icon name="plus" /></button></div>
      {items.map(entry => <div key={entry.id} className="nutrition-entry"><div><strong>{entry.name}</strong><div className="small muted">{fmtNum(entry.grams)} g · P {fmtNum(entry.per100.protein * entry.grams / 100)} g · C {fmtNum(entry.per100.carbs * entry.grams / 100)} g · F {fmtNum(entry.per100.fat * entry.grams / 100)} g</div></div><div className="nutrition-entry-side"><strong>{fmtNum(entry.per100.kcal * entry.grams / 100)}</strong><button className="iconbtn" aria-label={t('Delete')} onClick={() => update(s => { s.nutrition.entries = s.nutrition.entries.filter(e => e.id !== entry.id) })}><Icon name="trash" /></button></div></div>)}
    </div> })}

    {showAdd && <div className="card nutrition-add-panel" ref={addRef}>
      <div className="row between"><h2>{t('Add food')} · {t(meal)}</h2><button className="iconbtn" aria-label={t('Close')} onClick={() => setShowAdd(false)}><Icon name="xmark" /></button></div>
      <div className="nutrition-meals">{MEALS.map(m => <button key={m} className={meal === m ? 'on' : ''} onClick={() => setMeal(m)}>{t(m)}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); if (query.trim().length >= 2) search({ q: query.trim() }) }} className="nutrition-search"><TextField aria-label={t('Search a food or brand')} value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search a food or brand')} /><Button type="submit" variant="primary" disabled={busy}>{t('Search')}</Button></form>
      <div className="nutrition-actions"><Button type="button" icon="magnifier" onClick={() => setScanning(true)}>{t('Scan barcode')}</Button><Button type="button" icon="plus" onClick={() => setManual(v => !v)}>{t('Add manually')}</Button></div>
      <form className="nutrition-search" onSubmit={e => { e.preventDefault(); if (/^\d{8,14}$/.test(barcode)) search({ code: barcode }) }}><TextField aria-label={t('Or enter barcode digits')} inputMode="numeric" pattern="[0-9]{8,14}" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder={t('Or enter barcode digits')} /><Button type="submit">{t('Find')}</Button></form>
      {scanning && <Scanner onClose={() => setScanning(false)} onCode={code => { setScanning(false); setBarcode(code); search({ code }) }} />}
      {busy && <p className="small muted">{t('Searching…')}</p>}
      {message && <p className="small muted" role="status">{message}</p>}
      {!food && !results.length && !busy && recent.length > 0 && <div className="nutrition-recent"><h3>{t('Recently logged')}</h3>{recent.map((entry, i) => <button key={entry.id || i} className="nutrition-result" onClick={() => select(entry)}><span><strong>{entry.name}</strong><small>{entry.brand}</small></span><span>{fmtNum(entry.per100.kcal)} kcal / 100 g</span></button>)}</div>}
      {results.map((item, i) => <button key={item.code || i} className="nutrition-result" onClick={() => select(item)}><span><strong>{item.name}</strong><small>{item.brand}</small></span><span>{fmtNum(item.per100.kcal)} kcal / 100 g</span></button>)}
      {manual && <div className="nutrition-form"><TextField value={custom.name} onChange={e => setCustom({ ...custom, name: e.target.value })} placeholder={t('Food name')} /><p className="small muted">{t('Nutrition values per 100 g, from the product label.')}</p><div className="nutrition-grid">{NUTRIENTS.map(k => <label key={k} className="nutrition-input">{t(LABELS[k])}<NumberField value={custom[k]} onChange={v => setCustom(c => ({ ...c, [k]: v }))} /></label>)}</div><Button onClick={saveCustom}>{t('Continue')}</Button></div>}
      {food && <div className="nutrition-form"><strong>{food.name}</strong>{food.brand && <span className="small muted">{food.brand}</span>}<p className="small muted">{t('Check the product label. Values are per 100 g.')}: {NUTRIENTS.map(k => `${t(LABELS[k])}: ${fmtNum(food.per100[k])}`).join(' · ')}</p><label className="nutrition-input">{t('Amount eaten (g)')}<NumberField value={grams} onChange={setGrams} /></label><Button variant="primary" onClick={add} disabled={!grams || grams > 10000}>{t('Add to diary')}</Button></div>}
      <p className="small muted">{t('Product data: Open Food Facts. Check the label before logging.')}</p>
    </div>}
  </div>
}
