import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// autoformcreator 서버(/api/*)로 가는 모든 fetch에 x-app-secret 헤더 자동 첨부
const API_SECRET = import.meta.env.VITE_API_SECRET
const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''
const _origFetch = window.fetch.bind(window)
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url
  if (API_SECRET && url) {
    const isOurApi = url.startsWith('/api/') || (SERVER_URL && url.startsWith(`${SERVER_URL}/api/`))
    if (isOurApi) {
      init.headers = { ...(init.headers || {}), 'x-app-secret': API_SECRET }
    }
  }
  return _origFetch(input, init)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
