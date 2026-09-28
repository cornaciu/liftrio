import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { buildPlanBundle, mergePlan, parsePlan } from '../lib/plan-share.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, Switch } from '../components/ui.jsx'

const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) })

export default function Coaching() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const pushState = useStore(s => s.pushState)
  const toast = useUI(s => s.toast)
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [clientId, setClientId] = useState('')
  const [selection, setSelection] = useState('all')
  const [schedule, setSchedule] = useState(true)

  const reload = () => api('/api/coaching').then(setData).catch(e => toast(e.message))
  useEffect(() => { if (user) reload() }, [user?.id])
  if (!user) return null

  const act = async fn => {
    if (busy) return
    setBusy(true)
    try { await fn(); await reload(); window.dispatchEvent(new Event('liftrio:coaching-change')) } catch (e) { toast(e.message || t('Could not save changes')) }
    finally { setBusy(false) }
  }
  const grant = (trainerId, allow) => act(async () => {
    await post('/api/coaching/consent', { trainerId, allow })
    toast(allow ? t('Trainer access granted') : t('Trainer access revoked'))
  })
  const shareDashboard = (trainerId, allow) => act(async () => {
    await post('/api/coaching/data-consent', { trainerId, allow })
    toast(allow ? t('Dashboard sharing enabled') : t('Dashboard sharing stopped'))
  })
  const shareNutrition = (trainerId, allow) => act(async () => {
    await post('/api/coaching/nutrition-consent', { trainerId, allow })
    toast(allow ? t('Nutrition plan permission granted') : t('Nutrition plan permission revoked'))
  })
  const respondNutrition = (assignment, accept) => act(async () => {
    if (accept && !(S.coachNutritionAssignmentIds || []).includes(assignment.id)) {
      update(s => {
        s.nutrition ||= { targets: {}, entries: [] }
        s.nutrition.targets = { ...s.nutrition.targets, ...assignment.plan.targets }
        s.nutrition.coachPlan = { name: assignment.plan.name, meals: assignment.plan.meals, notes: assignment.plan.notes, trainerName: assignment.trainerName, accepted: new Date().toISOString() }
        s.coachNutritionAssignmentIds = [...(s.coachNutritionAssignmentIds || []), assignment.id]
      })
      if (!(await pushState())) throw new Error(t('Could not sync the plan. Try again when you are online.'))
    }
    await post('/api/coaching/nutrition/respond', { id: assignment.id, accept })
    toast(accept ? t('Nutrition plan added to your account') : t('Nutrition plan declined'))
  })
  const send = () => act(async () => {
    if (!clientId) throw new Error(t('Choose a client'))
    const full = buildPlanBundle(S, S.name || user.name)
    const plan = selection === 'all' ? full : {
      ...full, routines: full.routines.filter(r => r.id === selection),
      week: Object.fromEntries(Object.entries(full.week).filter(([, id]) => id === selection))
    }
    const used = new Set(plan.routines.flatMap(r => r.ex.map(e => e.id)))
    plan.customEx = full.customEx.filter(e => used.has(e.id))
    await post('/api/coaching/send', { clientId, plan })
    toast(t('Plan sent for approval'))
  })
  const respond = (assignment, accept) => act(async () => {
    if (accept) {
      const plan = parsePlan(assignment.plan)
      if (plan.dropped) throw new Error(t('Some exercises are unavailable. Ask the trainer to update the plan.'))
      if (!(S.coachAssignmentIds || []).includes(assignment.id)) {
        update(s => {
          mergePlan(s, plan, { schedule: schedule && Object.keys(assignment.plan.week || {}).length > 0 })
          s.coachAssignmentIds = [...(s.coachAssignmentIds || []), assignment.id]
        })
      }
      if (!(await pushState())) throw new Error(t('Could not sync the plan. Try again when you are online.'))
    }
    await post('/api/coaching/respond', { id: assignment.id, accept })
    toast(accept ? t('Plan added to your account') : t('Plan declined'))
  })

  const connected = new Set((data?.connections || []).map(c => c.trainerId))
  const dashboardGrants = new Set(data?.dashboardGrants || [])
  const nutritionGrants = new Set(data?.nutritionGrants || [])
  const incoming = (data?.assignments || []).filter(a => a.clientId === user.id && a.status === 'pending')
  const sent = (data?.assignments || []).filter(a => a.trainerId === user.id).slice().reverse()
  const incomingNutrition = (data?.nutritionAssignments || []).filter(a => a.clientId === user.id && a.status === 'pending')
  const sentNutrition = (data?.nutritionAssignments || []).filter(a => a.trainerId === user.id).slice().reverse()
  const isTrainer = data?.role === 'trainer' || data?.role === 'admin'

  return <div className="narrow coach-page">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav(isTrainer ? '/home' : '/settings')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{isTrainer ? t('Clients') : t('Trainer access')}</h1><div className="sub">{isTrainer ? t('Your clients and sent plans') : t('Your plans stay yours until you accept one')}</div></div>
    </div>

    {data && !isTrainer && <div className="coach-hero">
      <div className="coach-hero-icon"><Icon name="shield" /></div>
      <div className="coach-hero-copy">
        <div className="coach-eyebrow">{t('Your data, your choice')}</div>
        <h2>{t('Build a better coaching connection')}</h2>
        <p>{t('Choose separately whether a trainer can send plans or view your progress.')}</p>
      </div>
    </div>}

    {data && !isTrainer && <div className="card coach-card">
      <div className="coach-section-head"><span className="coach-section-icon"><Icon name="personCircle" /></span><div><h2>{t('Your trainers')}</h2><p>{t('Plan permission and dashboard sharing are separate. You can change either at any time.')}</p></div></div>
      {(data?.trainers || []).map(trainer => <div className="coach-trainer" key={trainer.id}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="coach-person"><span className="coach-avatar"><Icon name="person" /></span><div><b>{trainer.name}</b><div className="small muted">{trainer.role === 'admin' ? t('Admin') : t('Trainer')}</div></div></div>
          <div className="coach-permission">
            <div className="coach-permission-copy"><b>{t('May send training plans')}</b><span>{t('You approve each plan before it is added.')}</span></div>
            <Button size="sm" variant={connected.has(trainer.id) ? 'danger' : 'tinted'} disabled={busy}
              onClick={() => grant(trainer.id, !connected.has(trainer.id))}>{connected.has(trainer.id) ? t('Revoke access') : t('Allow')}</Button>
          </div>
          <div className="coach-permission">
            <div className="coach-permission-copy"><b>{t('Can view my dashboard')}</b><span>{t('Nutrition, workouts, weight and history')}</span></div>
            <Switch checked={dashboardGrants.has(trainer.id)} disabled={busy} ariaLabel={t('Share dashboard with {0}', trainer.name)}
              onChange={allow => shareDashboard(trainer.id, allow)} />
          </div>
          <div className="coach-permission">
            <div className="coach-permission-copy"><b>{t('May send nutrition plans')}</b><span>{t('You approve each nutrition plan before it changes your targets.')}</span></div>
            <Switch checked={nutritionGrants.has(trainer.id)} disabled={busy} ariaLabel={t('Allow nutrition plans from {0}', trainer.name)}
              onChange={allow => shareNutrition(trainer.id, allow)} />
          </div>
        </div>
      </div>)}
      {data && !data.trainers.length && <div className="coach-empty"><Icon name="personCircle" /><span>{t('No trainers available yet.')}</span></div>}
    </div>}

    {data && !isTrainer && <div className="card coach-card">
      <h2>{t('Plans awaiting your approval')}</h2>
      {incoming.map(a => <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--sep)' }}>
        <div style={{ fontWeight: 600 }}>{a.plan.name || a.trainerName}</div>
        <div className="small muted">{t('From {0} · {1} routines', a.trainerName, a.plan.routines.length)}</div>
        <div className="small" style={{ margin: '8px 0' }}>{a.plan.routines.map(r => `${r.name} (${r.ex.length})`).join(' · ')}</div>
        {Object.keys(a.plan.week || {}).length > 0 && <label className="row small" style={{ gap: 8, marginBottom: 10 }}>
          <input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} />
          {t('Use this weekly schedule')}
        </label>}
        <div className="row" style={{ gap: 8 }}>
          <Button variant="primary" size="sm" disabled={busy || !connected.has(a.trainerId)} onClick={() => respond(a, true)}>{t('Accept plan')}</Button>
          <Button size="sm" disabled={busy} onClick={() => respond(a, false)}>{t('Decline')}</Button>
        </div>
      </div>)}
      {data && !incoming.length && <div className="muted small">{t('No plans waiting.')}</div>}
    </div>}

    {data && !isTrainer && <div className="card coach-card">
      <h2>{t('Nutrition plans awaiting your approval')}</h2>
      {incomingNutrition.map(a => <div key={a.id} className="coach-nutrition-review">
        <strong>{a.plan.name}</strong><div className="small muted">{t('From {0}', a.trainerName)} · {a.plan.targets.kcal} kcal</div>
        <div className="small" style={{ marginTop: 8 }}>{t('Protein')} {a.plan.targets.protein} g · {t('Carbs')} {a.plan.targets.carbs} g · {t('Fat')} {a.plan.targets.fat} g</div>
        {a.plan.meals.map((meal, i) => <div className="small" key={i} style={{ marginTop: 8 }}><b>{meal.name}</b><div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{meal.details}</div></div>)}
        {a.plan.notes && <p className="small muted" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{a.plan.notes}</p>}
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Button variant="primary" size="sm" disabled={busy || !nutritionGrants.has(a.trainerId)} onClick={() => respondNutrition(a, true)}>{t('Accept plan')}</Button>
          <Button size="sm" disabled={busy} onClick={() => respondNutrition(a, false)}>{t('Decline')}</Button>
        </div>
      </div>)}
      {!incomingNutrition.length && <div className="muted small">{t('No nutrition plans waiting.')}</div>}
    </div>}

    {isTrainer && <div className="card coach-card coach-trainer-panel">
      <div className="coach-panel-heading"><Icon name="dumbbell" /><h2>{t('Send a training plan')}</h2></div>
      <p className="muted small">{t('Only people who gave you access appear here. Build the routines in your Plan tab, then send a copy for them to approve.')}</p>
      <label className="small muted" htmlFor="coach-client">{t('Client')}</label>
      <select className="input" id="coach-client" value={clientId} onChange={e => setClientId(e.target.value)}>
        <option value="">{t('Choose a client')}</option>
        {(data.clients || []).filter(c => c.canSendPlans).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label className="small muted" htmlFor="coach-plan" style={{ display: 'block', marginTop: 12 }}>{t('Plan')}</label>
      <select className="input" id="coach-plan" value={selection} onChange={e => setSelection(e.target.value)}>
        <option value="all">{t('Entire weekly plan')}</option>
        {S.routines.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <div style={{ height: 12 }} />
      <Button variant="primary" disabled={busy || !clientId || !S.routines.length} onClick={send}>{t('Send for approval')}</Button>
      {data && !data.clients.length && <p className="muted small">{t('A client must allow you first.')}</p>}
      {sent.length > 0 && <><h4 className="sec">{t('Sent plans')}</h4>{sent.slice(0, 10).map(a => <div className="row between small" key={a.id} style={{ padding: '7px 0' }}><span>{a.clientName} · {a.plan?.name || a.summary?.name || t('Plan')}</span><span className="muted">{t(a.status)}</span></div>)}</>}
    </div>}
    {isTrainer && <div className="card coach-card coach-trainer-panel">
      <div className="coach-panel-heading"><Icon name="flame" /><h2>{t('Nutrition plans')}</h2></div>
      <p className="muted small">{t('Create a meal plan and daily targets for clients who allowed nutrition plans.')}</p>
      {(data?.clients || []).filter(c => c.canSendNutrition).map(c => <div className="coach-client-row" key={c.id}>
        <span className="coach-client-initial">{(c.name || t('Client')).trim().charAt(0).toLocaleUpperCase()}</span><b>{c.name}</b><Button size="sm" variant="tinted" onClick={() => nav('/coaching/nutrition/' + encodeURIComponent(c.id))}>{t('Create plan')}</Button>
      </div>)}
      {data && !data.clients.some(c => c.canSendNutrition) && <div className="muted small">{t('No clients have allowed nutrition plans yet.')}</div>}
      {sentNutrition.length > 0 && <><h4 className="sec">{t('Sent nutrition plans')}</h4>{sentNutrition.slice(0, 10).map(a => <div className="row between small" key={a.id} style={{ padding: '7px 0' }}><span>{a.clientName} · {a.plan?.name || a.summary?.name}</span><span className="muted">{t(a.status)}</span></div>)}</>}
    </div>}
    {isTrainer && <div className="card coach-card coach-trainer-panel">
      <div className="coach-panel-heading"><Icon name="personCircle" /><h2>{t('Client dashboards')}</h2></div>
      <p className="muted small">{t('Only clients who explicitly shared their dashboard appear here. Access includes nutrition, training, body weight and history.')}</p>
      {(data?.clients || []).filter(c => c.canViewDashboard).map(c => <div className="coach-client-row" key={c.id}>
        <span className="coach-client-initial">{(c.name || t('Client')).trim().charAt(0).toLocaleUpperCase()}</span><div className="coach-client-meta"><b>{c.name}</b><div className="small muted">{t(c.canSendPlans ? 'Plan access and dashboard access' : 'Dashboard access only')}</div></div>
        <Button size="sm" variant="tinted" trailingIcon="chevronRight" onClick={() => nav('/coaching/client/' + encodeURIComponent(c.id))}>{t('View')}</Button>
      </div>)}
      {data && !data.clients.some(c => c.canViewDashboard) && <div className="muted small">{t('No clients have shared their dashboard yet.')}</div>}
    </div>}
  </div>
}
