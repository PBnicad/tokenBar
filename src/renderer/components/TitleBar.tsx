import { useState, useEffect } from 'react'
import { api } from '../api'

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    api.window.isMaximized().then(setMaximized)
    const unsub = api.window.onMaximizedChange(setMaximized)
    return unsub
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <span className="titlebar-title">tokenBar</span>
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={() => api.window.minimize()}
          title="Minimize"
          aria-label="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          className="titlebar-btn"
          onClick={() => api.window.maximize()}
          title={maximized ? 'Restore' : 'Maximize'}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="2" y="0" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="0" y="2" width="8" height="8" fill="var(--bg-root)" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
        <button
          className="titlebar-btn titlebar-close"
          onClick={() => api.window.close()}
          title="Close to tray"
          aria-label="Close to tray"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
