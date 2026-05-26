import { useState, useRef, useEffect, useCallback } from 'react'
import dayjs, { type Dayjs } from 'dayjs'

export interface DateRange {
  from: string   // YYYY-MM-DD
  to: string     // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  presets?: { label: string; days: number }[]
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function DateRangePicker({ value, onChange, presets }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => dayjs(value.from))
  const [picking, setPicking] = useState<'start' | 'end'>('start')
  const [pendingStart, setPendingStart] = useState<Dayjs | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setPicking('start')
        setPendingStart(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const from = dayjs(value.from)
  const to = dayjs(value.to)
  const displayText = from.isSame(to, 'day')
    ? from.format('MMM D, YYYY')
    : `${from.format('MMM D')} - ${to.format('MMM D, YYYY')}`

  const startOfMonth = viewMonth.startOf('month')
  const daysInMonth = viewMonth.daysInMonth()
  const startDayOfWeek = startOfMonth.day() // 0=Sun

  const cells: (Dayjs | null)[] = []
  for (let i = 0; i < startDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(startOfMonth.add(d - 1, 'day'))

  const isSelected = (d: Dayjs): boolean => {
    const ds = d.format('YYYY-MM-DD')
    return ds >= value.from && ds <= value.to
  }
  const isStart = (d: Dayjs): boolean => d.format('YYYY-MM-DD') === value.from
  const isEnd = (d: Dayjs): boolean => d.format('YYYY-MM-DD') === value.to

  const handleDateClick = (d: Dayjs) => {
    const ds = d.format('YYYY-MM-DD')
    if (picking === 'start') {
      setPendingStart(d)
      setPicking('end')
      onChange({ from: ds, to: ds })
    } else {
      if (pendingStart && d.isBefore(pendingStart, 'day')) {
        onChange({ from: ds, to: pendingStart.format('YYYY-MM-DD') })
      } else {
        onChange({ from: value.from, to: ds })
      }
      setPicking('start')
      setPendingStart(null)
      setOpen(false)
    }
  }

  const handlePreset = (days: number) => {
    const to = dayjs().format('YYYY-MM-DD')
    const from = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD')
    onChange({ from, to })
    setViewMonth(dayjs(from))
    setOpen(false)
    setPicking('start')
    setPendingStart(null)
  }

  return (
    <div className="drp-root" ref={ref}>
      <button className="drp-trigger" onClick={() => setOpen(!open)}>
        <svg className="drp-trigger-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
          <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" />
          <line x1="5" y1="1" x2="5" y2="4" />
          <line x1="9" y1="1" x2="9" y2="4" />
        </svg>
        <span>{displayText}</span>
        <svg className="drp-trigger-arrow" width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="1,2 4,5 7,2" />
        </svg>
      </button>

      {open && (
        <div className="drp-popup">
          {presets && presets.length > 0 && (
            <div className="drp-presets">
              {presets.map((p) => (
                <button key={p.label} className="drp-preset-btn" onClick={() => handlePreset(p.days)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="drp-calendar">
            <div className="drp-cal-header">
              <button className="drp-nav" onClick={() => setViewMonth(viewMonth.subtract(1, 'month'))}>‹</button>
              <span className="drp-month-label">{viewMonth.format('MMMM YYYY')}</span>
              <button className="drp-nav" onClick={() => setViewMonth(viewMonth.add(1, 'month'))}>›</button>
            </div>

            <div className="drp-weekdays">
              {WEEKDAYS.map((w) => <span key={w} className="drp-weekday">{w}</span>)}
            </div>

            <div className="drp-grid">
              {cells.map((d, i) => (
                <div key={i} className="drp-cell">
                  {d && (
                    <button
                      className={`drp-day${isSelected(d) ? ' selected' : ''}${isStart(d) ? ' start' : ''}${isEnd(d) ? ' end' : ''}${d.isSame(dayjs(), 'day') ? ' today' : ''}`}
                      onClick={() => handleDateClick(d)}
                    >
                      {d.date()}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="drp-footer">
            <span className="drp-hint">
              {picking === 'start' ? 'Select start date' : 'Select end date'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
