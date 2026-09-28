import { useUI } from '../store/useUI.js'
import Icon from './Icon.jsx'

export default function Toast() {
  const msg = useUI(s => s.toastMsg)
  const welcome = /^(Welcome|Bine ai)/i.test(msg || '')
  return <div id="toast" className={msg ? 'show' : ''} role="status" aria-live="polite">
    <span className="toast-symbol"><Icon name={welcome ? 'sparkles' : 'bell'} /></span>
    <span className="toast-copy"><small>Liftrio</small>{msg}</span>
  </div>
}
