import { useMemo, useState } from 'react'

const clock = (ts) => {
  const d = new Date(ts * 1000)
  const z = (n) => String(n).padStart(2, '0')
  return `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`
}

const LEVEL_RANK = { alarm: 0, warning: 1, info: 2 }
const HOUR = 3600

export default function EventTicker({ events, onSelectEquip, scenarioEid }) {
  const [open, setOpen] = useState(true)

  // latest event time = "now" for the recency window
  const latestTs = events.length ? Math.max(...events.map((e) => e.ts)) : 0

  // priority order so critical + the injected scenario never get buried under warnings:
  //   1) the equipment under an active failure scenario
  //   2) alarms before warnings (most-critical on top)
  //   3) events within the last hour before older ones
  //   4) newest first
  const ordered = useMemo(() => {
    return [...events].sort((a, b) => {
      const as = a.eid && a.eid === scenarioEid ? 0 : 1
      const bs = b.eid && b.eid === scenarioEid ? 0 : 1
      if (as !== bs) return as - bs
      const al = LEVEL_RANK[a.level] ?? 3
      const bl = LEVEL_RANK[b.level] ?? 3
      if (al !== bl) return al - bl
      const ar = latestTs - a.ts <= HOUR ? 0 : 1
      const br = latestTs - b.ts <= HOUR ? 0 : 1
      if (ar !== br) return ar - br
      return b.ts - a.ts
    })
  }, [events, scenarioEid, latestTs])

  const alarmCount = events.filter((e) => e.level === 'alarm').length

  return (
    <div className={`ticker ${open ? '' : 'collapsed'}`}>
      <div className="ticker-head" onClick={() => setOpen((o) => !o)}>
        <span className="live-pip" /> Live event log
        <span className="ticker-count">{events.length}</span>
        {alarmCount > 0 && <span className="ticker-count alarm">{alarmCount} critical</span>}
        <span className="ticker-toggle">{open ? '▾' : '▴'}</span>
      </div>
      {open && (
        <div className="ticker-body">
          {events.length === 0 ? (
            <div className="ticker-empty">Monitoring… events will appear here as equipment changes state.</div>
          ) : (
            ordered.map((e, i) => {
              const isScenario = e.eid && e.eid === scenarioEid
              const recent = latestTs - e.ts <= HOUR
              return (
                <div key={`${e.ts}-${e.eid || ''}-${i}`}
                  className={`ticker-row ${e.level}${isScenario ? ' scenario' : ''}${recent ? ' recent' : ''}`}
                  onClick={() => e.eid && onSelectEquip(e.eid)}>
                  <span className="ticker-time">{clock(e.ts)}</span>
                  <span className={`dot ${e.level}`} />
                  <span className="ticker-text">{isScenario && !e.scenario && <span className="scenario-flag">⚡ </span>}{e.text}</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
