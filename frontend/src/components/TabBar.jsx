import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  if (!user && !isGuest) return null
  const cur = loc.pathname.split('/')[1] || 'home'
  const on = k => cur === k || (cur === 'history' && k === 'stats') || (cur === 'settings' && k === 'home' && user?.role !== 'trainer') || (cur === 'coaching' && k === 'coaching')

  const trainerIndex = cur === 'coaching' ? 1 : cur === 'plan' ? 2 : cur === 'library' ? 3 : cur === 'settings' ? 4 : 0
  const clientIndex = cur === 'plan' ? 1 : cur === 'workout' ? 2 : cur === 'stats' || cur === 'history' ? 3 : cur === 'library' ? 4 : 0

  const startWorkout = () => {
    if (!S.active) {
      const r = effectiveRoutine(S, todayISO())
      if (r && r.ex.length) { onStart(r.id); return }
    }
    nav('/workout')
  }
  const Tab = ({ k, icon, to, label }) => (
    <button className={on(k) ? 'on' : ''} aria-current={on(k) ? 'page' : undefined} onClick={() => nav(to)}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  )

  if (user?.role === 'trainer') return <nav id="tabbar" className="liftrio-nav trainer-nav" style={{ '--nav-index': trainerIndex }} aria-label={t('Navigation')}>
    <Tab k="home" icon="house" to="/home" label={t('Home')} />
    <Tab k="coaching" icon="personCircle" to="/coaching" label={t('Clients')} />
    <button className={'start' + (cur === 'plan' ? ' on' : '')} aria-current={cur === 'plan' ? 'page' : undefined} onClick={() => nav('/plan')}>
      <span className="cir"><Icon name="clipboard" /></span><span>{t('Plan')}</span>
    </button>
    <Tab k="library" icon="list" to="/library" label={t('Exercises')} />
    <Tab k="settings" icon="gear" to="/settings" label={t('Settings')} />
  </nav>

  return (
    <nav id="tabbar" className="liftrio-nav" style={{ '--nav-index': clientIndex }} aria-label={t('Navigation')}>
      <Tab k="home" icon="house" to="/home" label={t('Home')} />
      <Tab k="plan" icon="calendar" to="/plan" label={t('Plan')} />
      <button className={'start' + (cur === 'workout' ? ' on' : '') + (S.active ? ' rec' : '')} aria-current={cur === 'workout' ? 'page' : undefined} onClick={startWorkout}>
        <span className="cir"><Icon name={S.active ? 'play' : 'dumbbell'} /></span>
        <span>{S.active ? t('Resume') : t('Start')}</span>
      </button>
      <Tab k="stats" icon="chart" to="/stats" label={t('Stats')} />
      <Tab k="library" icon="list" to="/library" label={t('Exercises')} />
    </nav>
  )
}
