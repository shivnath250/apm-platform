import { useState } from 'react'

const clock = (ts) => {
  const d = new Date(ts * 1000)
  const z = (n) => String(n).padStart(2, '0')
  return `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`
}

export default function EventTicker({ events, onSelectEquip }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`ticker ${open ? '' : 'collapsed'}`}>
      <div className="ticker-head" onClick={() => setOpen((o) => !o)}>
        <span className="live-pip" /> Live event log
        <span className="ticker-count">{events.length}</span>
        <span className="ticker-toggle">{open ? '▾' : '▴'}</span>
      </div>
      {open && (
        <div className="ticker-body">
          {events.length === 0 ? (
            <div className="ticker-empty">Monitoring… events will appear here as equipment changes state.</div>
          ) : (
            events.map((e, i) => (
              <div key={i} className={`ticker-row ${e.level}`} onClick={() => e.eid && onSelectEquip(e.eid)}>
                <span className="ticker-time">{clock(e.ts)}</span>
                <span className={`dot ${e.level}`} />
                <span className="ticker-text">{e.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
