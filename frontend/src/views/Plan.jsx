import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { buildPlanBundle } from '../lib/plan-share.js'
import { DAYN, uid, exCount } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayAssignSheet, loadStarterPlan, planToolsSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'

export default function Plan() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const clientId = params.get('client')
  const suffix = clientId ? '?client=' + encodeURIComponent(clientId) : ''
  const user = useStore(s => s.user)
  const [client, setClient] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useUI(s => s.toast)
  useEffect(() => {
    if (!clientId) return
    api('/api/coaching').then(data => setClient((data.clients || []).find(c => c.id === clientId) || null))
      .catch(e => setError(e.message || t('Could not load client.')))
  }, [clientId])
  const send = async () => {
    setBusy(true); setError('')
    try {
      await api('/api/coaching/send', { method: 'POST', body: JSON.stringify({ clientId, plan: buildPlanBundle(S, t('Training plan for {0}', client.name)) }) })
      toast(t('Plan sent for approval'))
      nav('/home')
    } catch (e) { setError(e.message || t('Could not send plan.')) }
    finally { setBusy(false) }
  }
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id + suffix)
  }

  return <>
    <div className="hdr">
      <div><h1>{user?.role === 'trainer' ? t('Training plans') : t('Plan')}</h1><div className="sub">{clientId ? t('For {0}', client?.name || t('Client')) : user?.role === 'trainer' ? t('Build reusable routines for your clients') : t('Your weekly routine')}</div></div>
      <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
    </div>
    {clientId && <div className="card coach-card">
      <h2>{t('Training plan for {0}', client?.name || t('Client'))}</h2>
      <p className="small muted">{t('Build routines below, assign the week, then send this plan for the client to approve.')}</p>
      {client && !client.canSendPlans && <p className="small" style={{ color: 'var(--orange)' }}>{t('This client has not allowed training plans yet.')}</p>}
      {error && <p className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
      <Button variant="primary" disabled={!client?.canSendPlans || !S.routines.length || busy} onClick={send}>{busy ? t('Sending…') : t('Send for approval')}</Button>
    </div>}
    <div className="cols"><div>
      <h4 className="sec">{t('Week schedule')}</h4>
      <div className="list" style={{ display: 'flex', flexDirection: 'column' }}>
        {[1, 2, 3, 4, 5, 6, 0].map(d => {
          const r = S.routines.find(x => x.id === S.week[d])
          return <div key={d} className="item" onClick={() => dayAssignSheet(d)}>
            <div className="grow"><div className="tt">{t(DAYN[d])}</div></div>
            {r ? <span className="tag acc"><Icon name={glyphOf(r.emoji)} />{r.name}</span> : <span className="tag">{t('Rest')}</span>}
            <Icon name="chevronRight" className="chev" /></div>
        })}
      </div>
    </div><div>
      <div className="row between" style={{ marginTop: 22, marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
        <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>{t('New')}</Button>
      </div>
      {S.routines.length ? <div className="list">{S.routines.map(r => <div key={r.id} className="item" onClick={() => nav('/plan/r/' + r.id)}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        <Icon name="chevronRight" className="chev" /></div>)}</div> : <>
        <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
        <Button icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (Push / Pull / Legs)')}</Button>
      </>}
    </div></div>
  </>
}
