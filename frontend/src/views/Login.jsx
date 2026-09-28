import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { webauthnOK, passkeyLogin, passkeyRegister, api, BIO } from '../lib/api.js'
import { hasData } from '../store/useStore.js'
import { t, LANGS } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { useState, useRef, useEffect } from 'react'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

function RegisterSheet({ close }) {
  const { setUser, pushState, pullState } = useStore()
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [role, setRole] = useState('member')
  const [inviteOnly, setInviteOnly] = useState(false)
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])
  useEffect(() => { api('/api/config').then(c => setInviteOnly(!!c.invite_only)).catch(() => {}) }, [])
  const go = async () => {
    const n = username.trim()
    if (!n) { useUI.getState().toast(t('Enter a username')); return }
    if (inviteOnly && !code.trim()) { useUI.getState().toast(t('An invite code is required')); return }
    try {
      const u = await passkeyRegister(n, code.trim(), role)
      setUser(u); close()
      if (hasData(useStore.getState().S)) { await pushState(); useUI.getState().toast(t('Profile created — data from this device moved into it')) }
      else { await pullState(); useUI.getState().toast(t('Welcome, {0}', u.name)) }
    } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message ? t(e.message) : t('Registration failed')) }
  }
  return <>
    <h3>{t('Create your profile')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Pick a unique username, then confirm with {0}. The passkey is saved on your device — no password needed.', BIO)}</div>
    <input ref={ref} className="input" aria-label={t('Username')} placeholder={t('Username')} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} value={username} onChange={e => setUsername(e.target.value)} />
    <label className="small muted" htmlFor="register-role" style={{ display: 'block', textAlign: 'left', marginTop: 12 }}>{t('Create account as')}</label>
    <select className="input" id="register-role" value={role} onChange={e => setRole(e.target.value)} style={{ marginTop: 6 }}>
      <option value="member">{t('User / client')}</option>
      <option value="trainer">{t('Trainer')}</option>
    </select>
    {inviteOnly && <>
      <div style={{ height: 10 }} />
      <input className="input" placeholder={t('Invite code')} maxLength={40} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
      <div className="dim small" style={{ marginTop: 6 }}>{t('This app is invite-only — enter the code you were given.')}</div>
    </>}
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={go}>{t('Create passkey')}</Button>
  </>
}

export default function Login() {
  const { setUser, pullState, setGuest, update } = useStore()
  const lang = useStore(s => s.S.lang || 'en')
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const languageRef = useRef(null)
  useEffect(() => {
    if (!languagesOpen) return
    const close = e => { if (!languageRef.current?.contains(e.target)) setLanguagesOpen(false) }
    const escape = e => { if (e.key === 'Escape') setLanguagesOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [languagesOpen])
  const signIn = async () => {
    try { const u = await passkeyLogin(); setUser(u); await pullState(); useUI.getState().toast(t('Welcome back, {0}', u.name)) }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(e.message || t('Sign-in failed')) }
  }
  return (
    <div className="login-page">
      <header className="login-top">
        <div className="login-brand"><img src="icon-180.png" alt="" width="38" height="38" /><span>Liftrio<span className="login-brand-mark">.</span></span></div>
        <div className="login-language" ref={languageRef}>
          <button type="button" className="login-language-trigger" aria-label={t('Language')} aria-haspopup="menu" aria-expanded={languagesOpen} onClick={() => setLanguagesOpen(v => !v)}>
            <Icon name="globe" /><span>{LANGS[lang] || 'English'}</span><Icon name="chevronDown" />
          </button>
          {languagesOpen && <div className="login-language-menu" role="menu" aria-label={t('Language')}>
            {Object.entries(LANGS).map(([code, name]) => <button type="button" role="menuitemradio" aria-checked={code === lang} key={code} onClick={() => { update(s => { s.lang = code }, false); setLanguagesOpen(false) }}>{name}{code === lang && <span aria-hidden="true">✓</span>}</button>)}
          </div>}
        </div>
      </header>
      <main className="login-main">
        <div className="login-story">
          <div className="login-eyebrow"><span className="login-live-dot" /> LIFTRIO / 01</div>
          <h1>{t('Train with purpose.')}<br /><em>{t('See the progress.')}</em></h1>
          <p className="login-intro">{t('Training, nutrition and progress in one place.')}</p>
          <div className="login-steps" aria-label={t('Training, nutrition and progress in one place.')}>
            <span><b>01</b>{t('Workouts')}</span><span><b>02</b>{t('Nutrition')}</span><span><b>03</b>{t('Progress')}</span>
          </div>
        </div>
        <div className="login-entry">
          <div className="login-entry-head"><span className="login-entry-line" /><span>LOGIN / REGISTER</span></div>
          <h2>{t('Ready when you are.')}</h2>
          <p>{DEMO ? t('Live demo — everything stays in this browser.') : t('Passkeys use {0} — no passwords.', BIO)}</p>
          <div className="login-actions">
            {DEMO ? <>
              <Button variant="primary" icon="sparkles" onClick={() => setGuest(true)}>{t('Start the demo')}</Button>
              <a className="login-repo" href={REPO} target="_blank" rel="noopener">{t('Self-host it in a minute →')}</a>
            </> : <>
              {webauthnOK() ? <>
                <Button variant="primary" icon="person" onClick={signIn}>{t('Sign in with passkey')}</Button>
                <Button className="login-create" onClick={() => useUI.getState().openSheet(close => <RegisterSheet close={close} />)}>{t('Create new profile')}</Button>
              </> : <div className="small muted">{t("This browser doesn't support passkeys — you can still use Liftrio locally on this device.")}</div>}
              <button className="login-guest" onClick={() => setGuest(true)}>{t('Continue without account')} <span aria-hidden="true">↗</span></button>
            </>}
          </div>
        </div>
      </main>
      <footer className="login-footer"><span>LIFTRIO®</span><span>{t('Your space to get stronger.')}</span></footer>
    </div>
  )
}
