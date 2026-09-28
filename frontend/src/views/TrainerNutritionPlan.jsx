import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, NumberField } from '../components/ui.jsx'

const blankMeal = () => ({ name: '', details: '' })
const ENERGY = { protein: 4, carbs: 4, fat: 9 }
const macroGrams = (kcal, shares) => Object.fromEntries(Object.keys(ENERGY).map(key => [key, Math.round((Number(kcal) || 0) * (Number(shares[key]) || 0) / 100 / ENERGY[key])]))
const macroKcal = grams => Object.keys(ENERGY).reduce((sum, key) => sum + (Number(grams[key]) || 0) * ENERGY[key], 0)
const macroShares = grams => {
  const total = macroKcal(grams)
  return Object.fromEntries(Object.keys(ENERGY).map(key => [key, total ? Math.round((Number(grams[key]) || 0) * ENERGY[key] / total * 10) / 10 : 0]))
}
const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) })

export default function TrainerNutritionPlan() {
  const { clientId } = useParams()
  const nav = useNavigate()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [targets, setTargets] = useState({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const [shares, setShares] = useState({ protein: 30, carbs: 40, fat: 30 })
  const [manualMacros, setManualMacros] = useState(false)
  const [meals, setMeals] = useState([blankMeal()])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/coaching').then(data => setClient((data.clients || []).find(c => c.id === clientId) || null))
      .catch(e => setError(e.message || t('Could not load client.')))
      .finally(() => setLoading(false))
  }, [clientId])

  const shareTotal = Object.values(shares).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const changeKcal = kcal => { setTargets({ kcal, ...macroGrams(kcal, shares) }); setManualMacros(false) }
  const changeShare = (key, value) => {
    const next = { ...shares, [key]: value }
    setShares(next)
    setTargets(current => ({ kcal: current.kcal, ...macroGrams(current.kcal, next) }))
    setManualMacros(false)
  }
  const changeGrams = (key, value) => {
    const grams = { ...targets, [key]: value }
    const kcal = macroKcal(grams)
    setTargets({ ...grams, kcal })
    setShares(macroShares(grams))
    setManualMacros(true)
  }
  const setMeal = (index, key, value) => setMeals(items => items.map((meal, i) => i === index ? { ...meal, [key]: value } : meal))
  const send = async () => {
    setError('')
    if (!name.trim() || !targets.kcal || meals.some(m => !m.name.trim() || !m.details.trim())) {
      setError(t('Add a plan name, a calorie target and details for every meal.'))
      return
    }
    if (!manualMacros && Math.abs(shareTotal - 100) > 0.01) {
      setError(t('Macro percentages must add up to 100%.'))
      return
    }
    setBusy(true)
    try {
      await post('/api/coaching/nutrition/send', { clientId, plan: {
        name: name.trim(), targets, meals: meals.map(m => ({ name: m.name.trim(), details: m.details.trim() })), notes: notes.trim()
      } })
      window.dispatchEvent(new Event('liftrio:coaching-change'))
      nav('/home')
    } catch (e) { setError(e.message || t('Could not send nutrition plan.')) }
    finally { setBusy(false) }
  }

  return <div className="narrow coach-nutrition">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Nutrition plan')}</h1><div className="sub">{client?.name || t('Client')}</div></div>
    </div>
    {loading && <div className="card small muted">{t('Loading client…')}</div>}
    {!loading && !client && <div className="card small muted">{t('Client not found.')}</div>}
    {client && !client.canSendNutrition && <div className="card small muted">{t('This client has not allowed nutrition plans yet.')}</div>}
    {client?.canSendNutrition && <>
      <div className="card coach-form-card">
        <h2>{t('Plan details')}</h2>
        <label className="coach-field">{t('Plan name')}<input className="input" maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder={t('Example: Balanced nutrition plan')} /></label>
        <p className="small muted">{t('Daily targets are suggestions. The client reviews and accepts the plan before it changes their account.')}</p>
        <label className="coach-field coach-kcal-field">{t('Calories')} (kcal)
          <NumberField className="coach-number" aria-label={t('Calories')} value={targets.kcal} decimal={false} onChange={changeKcal} />
        </label>
        <div className="coach-macro-heading"><strong>{t('Macro split')}</strong><span>{t('Protein · Carbs · Fat')}</span></div>
        <div className="coach-macro-grid">
          {[[ 'protein', 'Protein' ], [ 'carbs', 'Carbs' ], [ 'fat', 'Fat' ]].map(([key, label]) => <div className="coach-macro" key={key}>
            <strong>{t(label)}</strong>
            <label className="coach-field">{t('Percentage')} (%)
              <NumberField className="coach-number" aria-label={`${t(label)} (%)`} value={shares[key]} decimal onChange={value => changeShare(key, value)} />
            </label>
            <label className="coach-field">{t('Grams')} (g)
              <NumberField className="coach-number" aria-label={`${t(label)} (g)`} value={targets[key]} decimal={false} onChange={value => changeGrams(key, value)} />
            </label>
          </div>)}
        </div>
        <p className={`coach-macro-note ${!manualMacros && Math.abs(shareTotal - 100) > 0.01 ? 'invalid' : ''}`}>
          {manualMacros ? t('Calories are calculated from grams: protein × 4 + carbs × 4 + fat × 9.')
            : t('Macro percentages: {0}% total. Enter 100% to send the plan.', Math.round(shareTotal * 10) / 10)}
        </p>
      </div>
      <div className="card coach-form-card">
        <div className="row between coach-meals-head"><h2>{t('Meals')}</h2><Button size="sm" variant="tinted" icon="plus" disabled={meals.length >= 8} onClick={() => setMeals(items => [...items, blankMeal()])}>{t('Add meal')}</Button></div>
        {meals.map((meal, index) => <div className="coach-meal" key={index}>
          <div className="row between"><strong>{t('Meal {0}', index + 1)}</strong>{meals.length > 1 && <button className="iconbtn" aria-label={t('Remove meal')} onClick={() => setMeals(items => items.filter((_, i) => i !== index))}><Icon name="xmark" /></button>}</div>
          <label className="coach-field">{t('Meal name')}<input className="input" maxLength={80} value={meal.name} onChange={e => setMeal(index, 'name', e.target.value)} placeholder={t('Example: Breakfast')} /></label>
          <label className="coach-field">{t('Foods, portions and instructions')}<textarea className="input" maxLength={1000} rows={3} value={meal.details} onChange={e => setMeal(index, 'details', e.target.value)} placeholder={t('List foods and quantities for this meal')} /></label>
        </div>)}
      </div>
      <div className="card coach-form-card">
        <label className="coach-field">{t('Additional notes')}<textarea className="input" maxLength={2000} rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('Preferences, alternatives or timing')} /></label>
      </div>
      {error && <div className="card small" role="alert" style={{ color: 'var(--red)' }}>{error}</div>}
      <Button className="coach-send" variant="primary" disabled={busy} onClick={send}>{busy ? t('Sending…') : t('Send for approval')}</Button>
    </>}
  </div>
}
