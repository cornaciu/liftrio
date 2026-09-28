import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { t, dateLocale } from '../lib/i18n.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

const overviewCache = new Map()

export default function TrainerHome() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const [overview, setOverview] = useState(() => overviewCache.get(user?.id) || null)
  const [loading, setLoading] = useState(() => !overviewCache.has(user?.id))
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const cached = overviewCache.get(user?.id)
    setOverview(cached || null)
    setLoading(!cached)
    const load = () => api('/api/coaching/overview').then(data => {
      if (alive) {
        const next = data.clients || []
        overviewCache.set(user?.id, next)
        setOverview(next)
        setError('')
      }
    }).catch(e => { if (alive) setError(e.message || t('Could not load clients.')) })
      .finally(() => { if (alive) setLoading(false) })
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('liftrio:coaching-change', load)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('liftrio:coaching-change', load) }
  }, [user?.id])

  const clients = overview || []
  const shared = clients.filter(c => c.canViewDashboard).length
  const pending = clients.reduce((sum, c) => sum + (c.pendingTraining || 0) + (c.pendingNutrition || 0), 0)
  return <div className="narrow trainer-home">
    <div className="hdr">
      <div><h1>{t('Hi {0}', user?.name || '')}</h1><div className="sub">{new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>

    <div className="trainer-hero">
      <span className="trainer-kicker">{t('Trainer workspace')}</span>
      <h2>{t('Your clients, at a glance')}</h2>
      <p>{t('Follow their progress and prepare training or nutrition plans for each client.')}</p>
      <div className="trainer-metrics">
        <div><strong>{overview ? clients.length : '—'}</strong><span>{t('Clients')}</span></div>
        <div><strong>{overview ? shared : '—'}</strong><span>{t('Shared dashboards')}</span></div>
        <div><strong>{overview ? pending : '—'}</strong><span>{t('Plans awaiting approval')}</span></div>
      </div>
    </div>

    <div className="row between trainer-section-head">
      <h2>{t('Clients')}</h2>
      <Button size="sm" variant="tinted" onClick={() => nav('/coaching')}>{t('Manage')}</Button>
    </div>
    {loading && !overview && <div className="card muted small">{t('Loading clients…')}</div>}
    {error && <div className="card small" role="alert">{error}</div>}
    {!loading && overview && !clients.length && <div className="card trainer-empty">
      <Icon name="personCircle" />
      <strong>{t('No connected clients yet')}</strong>
      <p>{t('Clients choose which trainers can send plans and view their dashboard. Ask them to grant access in Trainer access.')}</p>
    </div>}
    {clients.map(client => <div className="card trainer-client" key={client.id}>
      <div className="trainer-client-head">
        <span className="trainer-avatar" aria-hidden="true">{(client.name || t('Client')).trim().charAt(0).toLocaleUpperCase()}</span>
        <div className="trainer-client-identity"><span className="trainer-client-label">{t('Client')}</span><h3>{client.name}</h3><span className="trainer-share-status">{client.canViewDashboard ? t('Dashboard shared') : t('Dashboard not shared')}</span></div>
        {client.canViewDashboard && <button className="iconbtn" aria-label={t('View {0}', client.name)} onClick={() => nav('/coaching/client/' + encodeURIComponent(client.id))}><Icon name="chevronRight" /></button>}
      </div>
      {client.overview ? <div className="trainer-client-stats">
        <div><span>{t('Last workout')}</span><b>{client.overview.lastWorkout ? fmtDate(client.overview.lastWorkout, true) : '—'}</b></div>
        <div><span>{t('Weight')}</span><b>{client.overview.latestWeight != null ? fmtNum(client.overview.latestWeight) + ' ' + client.overview.unit : '—'}</b></div>
        <div><span>{t('Routines')}</span><b>{client.overview.routines}</b></div>
      </div> : <p className="small muted trainer-private">{t('Progress appears after the client shares their dashboard.')}</p>}
      {((client.pendingTraining || 0) + (client.pendingNutrition || 0)) > 0 && <p className="small muted trainer-pending">{t('{0} plans awaiting approval', client.pendingTraining + client.pendingNutrition)}</p>}
      <div className="trainer-client-actions">
        <Button size="sm" variant="tinted" icon="dumbbell" disabled={!client.canSendPlans}
          onClick={() => nav('/plan?client=' + encodeURIComponent(client.id))}>{t('Training plan')}</Button>
        <Button size="sm" variant="tinted" icon="flame" disabled={!client.canSendNutrition}
          onClick={() => nav('/coaching/nutrition/' + encodeURIComponent(client.id))}>{t('Nutrition plan')}</Button>
      </div>
      {(!client.canSendPlans || !client.canSendNutrition) && <div className="small dim">{t('The client must allow each type of plan before you can send it.')}</div>}
    </div>)}
  </div>
}
