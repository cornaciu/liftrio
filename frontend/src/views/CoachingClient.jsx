import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtDur, fmtNum, fmtVol, todayISO } from '../lib/format.js'
import { estimateWorkoutEnergy } from '../lib/workout-energy.js'
import { setLabel } from '../lib/history.js'
import NutritionSummary from '../components/NutritionSummary.jsx'
import Icon from '../components/Icon.jsx'
import { EXIDX } from '../lib/exercises.js'

function MacroLine({ entry }) {
  const per100 = entry.per100 || entry
  const grams = Number(entry.grams) || 0
  const value = key => fmtNum((Number(per100[key]) || 0) * grams / 100)
  return <div className="row between small" style={{ gap: 12, padding: '8px 0', borderBottom: '1px solid var(--sep)' }}>
    <div className="grow"><b>{entry.name}</b><div className="muted">{fmtDate(entry.date)} · {entry.meal || t('Meal')} · {fmtNum(grams)} g</div></div>
    <div className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{value('kcal')} kcal<br />P {value('protein')} · C {value('carbs')} · G {value('fat')}</div>
  </div>
}

export default function CoachingClient() {
  const nav = useNavigate()
  const { clientId } = useParams()
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const next = await api('/api/coaching/client/' + encodeURIComponent(clientId))
        if (alive) { setPayload(next); setError('') }
      } catch (e) {
        if (alive) { setError(e.status === 403 ? t('Dashboard access has been revoked.') : e.message || t('Could not load client data.')); setPayload(null) }
      } finally { if (alive) setLoading(false) }
    }
    load()
    const poll = setInterval(load, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearInterval(poll); document.removeEventListener('visibilitychange', onVisible) }
  }, [clientId])

  const state = payload?.state
  const client = payload?.client
  const today = todayISO()
  const workouts = (state?.workouts || []).slice().sort((a, b) => (b.d || '').localeCompare(a.d || '') || (b.end || 0) - (a.end || 0))
  const bodyweight = (state?.bodyweight || []).slice().sort((a, b) => (b.d || '').localeCompare(a.d || ''))
  const nutritionEntries = (state?.nutrition?.entries || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const todayEntries = nutritionEntries.filter(e => e.date === today)

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/coaching')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{client?.name || t('Client dashboard')}</h1><div className="sub">{t('Shared with your permission')}</div></div>
    </div>

    {loading && !payload && <div className="card muted small">{t('Loading client data…')}</div>}
    {error && <div className="card"><div className="row" style={{ gap: 9, color: 'var(--orange)' }}><Icon name="lock" />{error}</div></div>}
    {state && <>
      <div className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>{t('Overview')}</h2><span className="tag">{workouts.length} {t(workouts.length === 1 ? 'workout' : 'workouts')}</span></div>
        <div className="row" style={{ gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
          <div><div className="small muted">{t('Latest body weight')}</div><strong className="big">{bodyweight[0] ? fmtNum(bodyweight[0].w) : '—'} <span className="muted small">{state.unit || 'kg'}</span></strong></div>
          <div><div className="small muted">{t('Daily calorie target')}</div><strong className="big">{state.nutrition?.targets?.kcal ? fmtNum(state.nutrition.targets.kcal) : '—'} <span className="muted small">kcal</span></strong></div>
          <div><div className="small muted">{t('Routines')}</div><strong className="big">{state.routines?.length || 0}</strong></div>
        </div>
        {loading && <div className="dim small" style={{ marginTop: 8 }}>{t('Updating shared data…')}</div>}
      </div>

      <div className="card">
        <h2>{t('Nutrition today')}</h2>
        <NutritionSummary nutrition={state.nutrition} date={today} state={state} />
      </div>

      <div className="card">
        <h2>{t('Food diary history')}</h2>
        {nutritionEntries.length ? nutritionEntries.map((entry, i) => <MacroLine key={entry.id || `${entry.date}-${i}`} entry={entry} />)
          : <div className="muted small">{t('No foods logged yet.')}</div>}
        {todayEntries.length > 0 && <div className="dim small" style={{ marginTop: 10 }}>{t('{0} foods logged today', todayEntries.length)}</div>}
      </div>

      <div className="card">
        <h2>{t('Training plan')}</h2>
        {(state.routines || []).length ? state.routines.map(r => <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--sep)' }}>
          <div className="row between small"><b>{r.name}</b><span className="muted">{t('{0} exercises', (r.ex || []).length)}</span></div>
          <div className="small muted" style={{ marginTop: 4 }}>{(r.ex || []).map(ex => EXIDX[ex.id]?.n || state.customEx?.find(x => x.id === ex.id)?.n || ex.n || ex.id).join(' · ')}</div>
        </div>) : <div className="muted small">{t('No routines yet.')}</div>}
      </div>

      <div className="card">
        <h2>{t('Body weight history')}</h2>
        {bodyweight.length ? bodyweight.map((point, i) => <div className="row between small" key={point.id || `${point.d}-${i}`} style={{ padding: '7px 0', borderBottom: '1px solid var(--sep)' }}>
          <span>{fmtDate(point.d, true)}</span><b>{fmtNum(point.w)} {state.unit || 'kg'}</b>
        </div>) : <div className="muted small">{t('No entries yet.')}</div>}
      </div>

      <div className="card">
        <h2>{t('Workout history')}</h2>
        {workouts.length ? workouts.map((workout, i) => {
          const isOpen = expanded === (workout.id || i)
          const energy = estimateWorkoutEnergy(workout, state)
          const duration = workout.end && workout.start ? fmtDur(workout.end - workout.start) : null
          return <div key={workout.id || `${workout.d}-${i}`} style={{ borderBottom: '1px solid var(--sep)' }}>
            <button className="row between" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : (workout.id || i))}
              style={{ width: '100%', padding: '11px 0', textAlign: 'left', background: 'none', color: 'inherit', border: 0, cursor: 'pointer' }}>
              <span className="grow"><b>{workout.name || t('Workout')}</b><span className="small muted" style={{ display: 'block' }}>{[fmtDate(workout.d, true), duration, `${workout.entries?.length || 0} ${t('exercises')}`, energy ? `~${fmtNum(energy.kcal)} kcal` : null].filter(Boolean).join(' · ')}</span></span>
              <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} className="chev" />
            </button>
            {isOpen && <div style={{ padding: '0 0 12px 8px' }}>
              {(workout.entries || []).map((entry, j) => <div key={`${entry.id}-${j}`} style={{ marginBottom: 10 }}>
                <b>{EXIDX[entry.id]?.n || state.customEx?.find(x => x.id === entry.id)?.n || entry.n || entry.name || entry.id}</b>
                <div className="small muted">{(entry.sets || []).filter(set => set.done).map(set => setLabel(entry.id, set, entry.target)).join(' · ') || t('No completed sets')}</div>
              </div>)}
            </div>}
          </div>
        }) : <div className="muted small">{t('No workouts yet.')}</div>}
      </div>
      <div className="sect-f">{t('Dashboard data refreshes while this page is open. The client can revoke access at any time.')}</div>
    </>}
  </div>
}
