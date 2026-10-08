import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Component } from 'react'

// One bad record must not leave a white screen on the shop floor: show a plain message and a Reload button.
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('screen crashed:', error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', background: '#0f172a', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Screen could not open / Screen nahi khul payi</div>
        <div style={{ fontSize: 14, color: '#cbd5e1', maxWidth: 300 }}>Your saved orders are safe. Tap Reload. / Aapke order safe hain. Reload dabayein.</div>
        <button onClick={() => window.location.reload()} style={{ background: '#fff', color: '#0f172a', borderRadius: 12, padding: '12px 28px', fontWeight: 700, fontSize: 15 }}>Reload</button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)
