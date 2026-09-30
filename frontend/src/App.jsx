import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { setLang, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { useWakeLock } from './lib/wakelock.js'
import { startFlow } from './sheets.jsx'
import { trackVisit, ANALYTICS_CHANGED } from './lib/analytics.js'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import RestTimer from './components/RestTimer.jsx'
import Login from './views/Login.jsx'
import Home from './views/Home.jsx'
import TrainerHome from './views/TrainerHome.jsx'
import TrainerNutritionPlan from './views/TrainerNutritionPlan.jsx'
import Plan from './views/Plan.jsx'
import RoutineEdit from './views/RoutineEdit.jsx'
import Workout from './views/Workout.jsx'
import Stats from './views/Stats.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import Settings from './views/Settings.jsx'
import Nutrition from './views/Nutrition.jsx'
import Admin from './views/Admin.jsx'
import Coaching from './views/Coaching.jsx'
import CoachingClient from './views/CoachingClient.jsx'

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

function applyPrefs(theme, accent) {
  const de = document.documentElement
  de.dataset.theme = theme === 'light' ? 'light' : 'dark'
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f2f2f7' : '#000000'
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, user, ready } = useStore()
  const isGuest = useStore(s => s.isGuest())
  const authed = user || isGuest
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => { applyPrefs(S.theme, S.accent) }, [S.theme, S.accent])
  useEffect(() => { setLang(S.lang || 'en') }, [S.lang])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  useEffect(() => {
    document.body.classList.toggle('login-screen', !authed && ready)
    return () => document.body.classList.remove('login-screen')
  }, [authed, ready])
  useEffect(() => {
    if (ready && !authed && loc.pathname !== '/home') navigate('/home', { replace: true })
  }, [ready, authed, loc.pathname, navigate])
  useEffect(() => {
    if (!ready || user) return
    const visit = () => trackVisit(isGuest ? 'guest' : 'landing')
    visit()
    const timer = setInterval(visit, 5 * 60 * 1000)
    const changed = event => {
      if (event.type !== 'storage' || event.key === 'liftrio_analytics_disabled') visit()
    }
    document.addEventListener('visibilitychange', visit)
    window.addEventListener(ANALYTICS_CHANGED, changed)
    window.addEventListener('storage', changed)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visit)
      window.removeEventListener(ANALYTICS_CHANGED, changed)
      window.removeEventListener('storage', changed)
    }
  }, [ready, user, isGuest])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(!!S.active && S.keepAwake !== false)

  if (!ready && !authed) return (
    <div id="app">
      <div style={{ paddingTop: '44vh', display: 'flex', justifyContent: 'center' }}>
        <img src="icon-180.png" alt="" width="48" height="48" style={{ borderRadius: 11 }} />
      </div>
    </div>
  )

  return (
    <>
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out */}
      <div id="app" className={'vfade' + (!authed ? ' login-shell' : '')} key={loc.pathname}>
        <ErrorBoundary>
          {!authed ? <Login /> : (
            <Routes>
              <Route path="/home" element={user?.role === 'trainer' ? <TrainerHome /> : <Home />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/coaching" element={user ? <Coaching /> : <Navigate to="/settings" replace />} />
              <Route path="/coaching/client/:clientId" element={user ? <CoachingClient /> : <Navigate to="/settings" replace />} />
              <Route path="/coaching/nutrition/:clientId" element={user?.role === 'trainer' || user?.role === 'admin' ? <TrainerNutritionPlan /> : <Navigate to="/home" replace />} />
              <Route path="/admin" element={user?.admin ? <Admin /> : <Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </div>
      <TabBar onStart={startFlow} />
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  return <HashRouter><Shell /></HashRouter>
}

