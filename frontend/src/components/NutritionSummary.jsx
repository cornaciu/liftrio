import { t } from '../lib/i18n.js'
import { fmtNum } from '../lib/format.js'
import { DEFAULT_TARGETS, totalsFor } from '../lib/nutrition.js'
import { workoutCaloriesForDate } from '../lib/workout-energy.js'
import Icon from './Icon.jsx'

const MACROS = [
  ['protein', 'Protein', 'var(--blue)'],
  ['carbs', 'Carbs', 'var(--orange)'],
  ['fat', 'Fat', 'var(--pink)']
]

export default function NutritionSummary({ nutrition, date, state, compact = false }) {
  const totals = totalsFor(nutrition?.entries, date)
  const targets = { ...DEFAULT_TARGETS, ...nutrition?.targets }
  const workoutKcal = workoutCaloriesForDate(state, date)
  const available = Number(targets.kcal) + workoutKcal
  const remaining = available - totals.kcal
  const progress = targets.kcal && available ? Math.min(100, totals.kcal / available * 100) : 0

  return <div className={'nutrition-summary' + (compact ? ' compact' : '')}>
    <div className="nutrition-energy">
      <div className="nutrition-ring" style={{ '--progress': `${progress}%` }}>
        <div><strong>{fmtNum(totals.kcal)}</strong><span>kcal</span></div>
      </div>
      <div className="nutrition-energy-text">
        <span className="nutrition-kicker"><Icon name="flame" /> {targets.kcal ? t(remaining >= 0 ? 'Remaining today' : 'Over target') : t('Calories today')}</span>
        <strong>{targets.kcal ? fmtNum(Math.abs(remaining)) : fmtNum(totals.kcal)} <small>kcal</small></strong>
        <span className="small muted">{targets.kcal ? `${t('Daily target')}: ${fmtNum(targets.kcal)} kcal` : t('Set your daily targets')}</span>
      </div>
    </div>
    {workoutKcal > 0 && <div className="nutrition-workout-credit"><Icon name="dumbbell" /><span>{t('Workout calories')}</span><strong>+~{fmtNum(workoutKcal)} kcal</strong></div>}
    <div className="nutrition-macro-list">{MACROS.map(([key, label, color]) => <div className="nutrition-macro" key={key} style={{ '--macro-color': color }}>
      <div className="row between"><span className="nutrition-macro-label">{t(label)}</span><span><strong>{fmtNum(totals[key])}</strong>{targets[key] > 0 && <span className="muted"> / {fmtNum(targets[key])}</span>} g</span></div>
      <div className="nutrition-track"><i style={{ width: `${Math.min(100, targets[key] ? totals[key] / targets[key] * 100 : 0)}%` }} /></div>
    </div>)}</div>
  </div>
}
