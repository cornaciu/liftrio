import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { buildPlanBundle, mergePlan, parsePlan } from '../lib/plan-share.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

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
    try { await fn(); await reload() } catch (e) { toast(e.message || t('Could not save changes')) }
    finally { setBusy(false) }
  }
  const grant = (trainerId, allow) => act(async () => {
    await post('/api/coaching/consent', { trainerId, allow })
    toast(allow ? t('Trainer access granted') : t('Trainer access revoked'))
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
  const incoming = (data?.assignments || []).filter(a => a.clientId === user.id && a.status === 'pending')
  const sent = (data?.assignments || []).filter(a => a.trainerId === user.id).slice().reverse()
  const isTrainer = data?.role === 'trainer' || data?.role === 'admin'

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Trainer access')}</h1><div className="sub">{t('Your plans stay yours until you accept one')}</div></div>
    </div>

    <div className="card">
      <h2>{t('Your trainers')}</h2>
      <p className="muted small">{t('Allow a trainer to send you plans. You can remove access whenever you want. Each plan still needs your approval.')}</p>
      {(data?.trainers || []).map(trainer => <div className="row between" key={trainer.id} style={{ gap: 12, padding: '9px 0', borderBottom: '1px solid var(--sep)' }}>
        <div><b>{trainer.name}</b><div className="small muted">{trainer.role === 'admin' ? t('Admin') : t('Trainer')}</div></div>
        <Button size="sm" variant={connected.has(trainer.id) ? 'danger' : 'tinted'} disabled={busy}
          onClick={() => grant(trainer.id, !connected.has(trainer.id))}>{connected.has(trainer.id) ? t('Revoke access') : t('Allow')}</Button>
      </div>)}
      {data && !data.trainers.length && <div className="muted small">{t('No trainers available yet.')}</div>}
    </div>

    <div className="card">
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
    </div>

    {isTrainer && <div className="card">
      <h2>{t('Send a training plan')}</h2>
      <p className="muted small">{t('Only people who gave you access appear here. Build the routines in your Plan tab, then send a copy for them to approve.')}</p>
      <label className="small muted" htmlFor="coach-client">{t('Client')}</label>
      <select className="input" id="coach-client" value={clientId} onChange={e => setClientId(e.target.value)}>
        <option value="">{t('Choose a client')}</option>
        {(data.clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
  </div>
}
