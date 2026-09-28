import { useUI } from '../store/useUI.js'
import Icon from './Icon.jsx'

export default function Toast() {
  const msg = useUI(s => s.toastMsg)
  const welcome = /^(Welcome|Bine ai)/i.test(msg || '')
  return <div id="toast" className={(msg ? 'show' : '') + (welcome ? ' welcome-toast' : '')} role="status" aria-live="polite">
    {welcome && <span className="toast-symbol"><Icon name="sparkles" /></span>}
    <span className="toast-copy">{welcome && <small>Liftrio</small>}{msg}</span>
  </div>
}
