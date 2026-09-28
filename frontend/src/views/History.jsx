import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, dateLocale } from '../lib/i18n.js'
import { WorkoutRow, workoutDetailSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const days = Object.entries(S.workouts.reduce((groups, workout) => {
    ;(groups[workout.d || ''] ||= []).push(workout)
    return groups
  }, {})).sort(([a], [b]) => b.localeCompare(a))
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 12 }}><h1>{t('Workout history')}</h1><div className="sub">{t('{0} workouts', S.workouts.length)}</div></div></div>
    {days.length ? <div className="workout-history-days">{days.map(([date, workouts]) => <section className="workout-history-day" key={date}>
      <h2>{date ? new Date(date + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : t('History')}</h2>
      <div className="list">{workouts.slice().reverse().map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
    </section>)}</div>
      : <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No workouts yet.')}</div>}
  </>
}
