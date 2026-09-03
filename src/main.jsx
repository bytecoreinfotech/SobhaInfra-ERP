import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global Zero-Delay Tooltip Handler: eliminates browser OS delayed tooltips across the entire site
if (typeof document !== 'undefined') {
  document.addEventListener('mouseover', (e) => {
    const el = e.target?.closest?.('[title]');
    if (el && el.getAttribute('title')) {
      const val = el.getAttribute('title').trim();
      if (val) {
        el.setAttribute('data-tooltip', val);
        el.removeAttribute('title');
      }
    }
  }, { passive: true });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

