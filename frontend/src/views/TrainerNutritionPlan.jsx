import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, NumberField } from '../components/ui.jsx'

const blankMeal = () => ({ name: '', details: '' })
const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) })

export default function TrainerNutritionPlan() {
  const { clientId } = useParams()
  const nav = useNavigate()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [targets, setTargets] = useState({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
  const [meals, setMeals] = useState([blankMeal()])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/coaching').then(data => setClient((data.clients || []).find(c => c.id === clientId) || null))
      .catch(e => setError(e.message || t('Could not load client.')))
      .finally(() => setLoading(false))
  }, [clientId])

  const setMeal = (index, key, value) => setMeals(items => items.map((meal, i) => i === index ? { ...meal, [key]: value } : meal))
  const send = async () => {
    setError('')
    if (!name.trim() || !targets.kcal || meals.some(m => !m.name.trim() || !m.details.trim())) {
      setError(t('Add a plan name, a calorie target and details for every meal.'))
      return
    }
    setBusy(true)
    try {
      await post('/api/coaching/nutrition/send', { clientId, plan: {
        name: name.trim(), targets, meals: meals.map(m => ({ name: m.name.trim(), details: m.details.trim() })), notes: notes.trim()
      } })
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
        <div className="coach-target-grid">
          {[['kcal', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g']].map(([key, label, unit]) =>
            <label className="coach-field" key={key}>{t(label)} ({unit})<NumberField className="coach-number" aria-label={`${t(label)} (${unit})`} value={targets[key]} decimal={false} onChange={value => setTargets(current => ({ ...current, [key]: value }))} /></label>)}
        </div>
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
