import { useState, useRef, useEffect } from 'react'

interface SourceDropdownProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

export function SourceDropdown({ value, onChange, options }: SourceDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = options.find((o) => o.value === value)
  const display = selected?.label || 'All agents'

  return (
    <div className="src-dropdown" ref={ref}>
      <button className="src-dropdown-trigger" onClick={() => setOpen(!open)}>
        <span>{display}</span>
        <svg className="src-dropdown-arrow" width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="1,2 4,5 7,2" />
        </svg>
      </button>

      {open && (
        <div className="src-dropdown-menu">
          {options.map((o) => (
            <button
              key={o.value}
              className={`src-dropdown-item${o.value === value ? ' active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
