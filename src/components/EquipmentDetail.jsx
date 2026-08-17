import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Legend, AreaChart, Area,
} from 'recharts'
import { query } from '../db.js'
import { healthSeries, statusOf, RUN_STATE_LABEL, distanceToTrip, velocityPerDay, etaToTrip } from '../health.js'

const VELOCITY_TAIL = 12 // ~3 days of 6-hourly history

const PALETTE = ['#22e6d6', '#ff3d9a', '#ffb020', '#7aa2f7', '#bb9af7', '#9ece6a', '#ff9e64', '#2ac3de', '#e0af68', '#f7768e']
const MAXPTS = 320

function findPath(tree, eid) {
  for (const p of tree) for (const u of p.units) for (const s of u.systems) for (const e of s.equipment)
    if (e.id === eid) return { plant: p, unit: u, system: s, equip: e }
  return null
}
const fmt = (epoch) => { const d = new Date(epoch * 1000); const z = (n) => String(n).padStart(2, '0'); return `${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}h` }
const tipStyle = { background: '#141b26', border: '1px solid #2c384a', borderRadius: 8, fontSize: 12, boxShadow: '0 8px 24px -10px rgba(0,0,0,0.7)' }

export default function EquipmentDetail({ db, eid, weights, tree, onBack, onBackPlant, liveTickId, liveSensors, liveTs, liveOn, runState }) {
  const [sensors, setSensors] = useState([])
  const [hidden, setHidden] = useState({})
  const [paramsOpen, setParamsOpen] = useState(true)
  const [singlesOpen, setSinglesOpen] = useState(false)
  const path = useMemo(() => findPath(tree, eid), [tree, eid])
  const lastTick = useRef(0)

  // load history from the database when the equipment changes
  useEffect(() => {
    const rows = query(db, `
      SELECT s.skey, s.label, s.unit, s.baseline, s.healthy_max hmax, s.trip_limit tlim, r.ts, r.value
      FROM sensor s JOIN reading r ON r.sensor_id = s.id
      WHERE s.equipment_id = ? ORDER BY s.id, r.ts`, [eid])
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.skey)) map.set(r.skey, { skey: r.skey, label: r.label, unit: r.unit, baseline: r.baseline, healthy_max: r.hmax, trip_limit: r.tlim, series: [] })
      map.get(r.skey).series.push({ t: fmt(r.ts), ts: r.ts, v: r.value })
    }
    const arr = [...map.values()].map((s) => ({ ...s, now: s.series.at(-1)?.v }))
    setSensors(arr)
    setHidden({})
    lastTick.current = liveTickId || 0
  }, [db, eid])

  // append a live point when a new tick arrives
  useEffect(() => {
    if (!liveOn || !liveSensors || !liveTickId || liveTickId === lastTick.current) return
    lastTick.current = liveTickId
    const byKey = {}
    for (const s of liveSensors) byKey[s.skey] = s.value
    const label = fmt(liveTs)
    setSensors((prev) => prev.map((s) => {
      const v = byKey[s.skey]
      if (v == null) return s
      const series = [...s.series, { t: label, ts: liveTs, v }]
      if (series.length > MAXPTS) series.shift()
      return { ...s, series, now: v }
    }))
  }, [liveTickId])

  const hSeries = useMemo(() => (sensors.length ? healthSeries(sensors, weights) : []), [sensors, weights])
  const health = hSeries.at(-1)?.health ?? 100
  const status = statusOf(health)
  const masked = runState === 'starting' || runState === 'stopped'

  const combined = useMemo(() => {
    if (!sensors.length) return []
    const n = sensors[0].series.length
    const data = []
    for (let i = 0; i < n; i++) {
      const row = { t: sensors[0].series[i].t }
      for (const s of sensors) row[s.skey] = (s.series[i]?.v / s.baseline) * 100
      data.push(row)
    }
    return data
  }, [sensors])

  if (!path) return null

  return (
    <div>
      <div className="breadcrumb">
        <span className="crumb-link" onClick={onBack}>Adani Power</span> {'\u203A'}{' '}
        <span className="crumb-link" onClick={() => onBackPlant(path.plant.id)}>{path.plant.name}</span> {'\u203A'}{' '}
        {path.unit.name} {'\u203A'} {path.system.name} {'\u203A'} <b>{path.equip.name}</b>
      </div>
      <div className="detail-head">
        <h2>{path.equip.name}{liveOn && <span className="live-tag">● LIVE</span>}</h2>
        {runState && <span className={`run-badge ${runState}`}>{RUN_STATE_LABEL[runState]}</span>}
        <div className="gauge">
          <span className={`num ${masked ? '' : status + '-t'}`} style={masked ? { color: 'var(--faint)' } : undefined}>
            {health.toFixed(0)}<span style={{ fontSize: 16 }}>%</span>
          </span>
          <span className="lbl">{status}</span>
        </div>
      </div>
      {masked && (
        <div className="masked-note">
          Alarms suppressed while {RUN_STATE_LABEL[runState].toLowerCase()} — sensors are scored against
          running limits, which don't apply during start-up/shutdown.
        </div>
      )}

      <div className="section-title">Health score {'\u00B7'} trend</div>
      <div className="chart-card wide">
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={hSeries} margin={{ top: 8, right: 14, left: -14, bottom: 0 }}>
            <defs><linearGradient id="hgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22e6d6" stopOpacity={0.35} /><stop offset="100%" stopColor="#22e6d6" stopOpacity={0} />
            </linearGradient></defs>
            <CartesianGrid stroke="#1c2534" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: '#5d6b7d', fontSize: 9 }} minTickGap={60} />
            <YAxis domain={[0, 100]} tick={{ fill: '#5d6b7d', fontSize: 9 }} width={36} />
            <Tooltip contentStyle={tipStyle} labelStyle={{ color: '#8b98a9' }} formatter={(v) => [`${v.toFixed(1)}%`, 'Health']} />
            <ReferenceLine y={80} stroke="#f0b429" strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={60} stroke="#ff5a5c" strokeDasharray="4 4" strokeOpacity={0.6} />
            <Area type="monotone" dataKey="health" stroke="#22e6d6" strokeWidth={2} fill="url(#hgrad)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="legend-note">Amber = warning (80%), red = alarm (60%). {liveOn ? 'Streaming live.' : 'Recomputes live when you change weights.'}</div>
      </div>

      <div className="section-title expander" onClick={() => setParamsOpen((o) => !o)}>
        <span className={`chev ${paramsOpen ? 'open' : ''}`}>{'\u25B6'}</span>
        Parameters {'\u00B7'} all sensors in one chart ({sensors.length})
      </div>
      {paramsOpen && (
        <div className="chart-card wide">
          <div className="legend-note" style={{ marginTop: 0, marginBottom: 8 }}>Each sensor as % of its normal (baseline). 100% = normal. Click a name in the legend to hide / show it.</div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={combined} margin={{ top: 8, right: 14, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="#1c2534" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: '#5d6b7d', fontSize: 9 }} minTickGap={60} />
              <YAxis tick={{ fill: '#5d6b7d', fontSize: 9 }} width={42} tickFormatter={(v) => `${v}%`} domain={['auto', 'auto']} />
              <Tooltip contentStyle={tipStyle} labelStyle={{ color: '#8b98a9' }} formatter={(v, name) => [`${v.toFixed(1)}%`, name]} />
              <ReferenceLine y={100} stroke="#5d6b7d" strokeDasharray="2 4" strokeOpacity={0.6} />
              <Legend onClick={(o) => setHidden((h) => ({ ...h, [o.dataKey]: !h[o.dataKey] }))} wrapperStyle={{ fontSize: 11, cursor: 'pointer', paddingTop: 6 }} />
              {sensors.map((s, i) => (
                <Line key={s.skey} dataKey={s.skey} name={s.label} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false} hide={!!hidden[s.skey]} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="section-title expander" onClick={() => setSinglesOpen((o) => !o)}>
        <span className={`chev ${singlesOpen ? 'open' : ''}`}>{'\u25B6'}</span>
        Individual sensor charts (raw units)
      </div>
      {singlesOpen && (
        <div className="chart-grid">
          <div className="legend-note" style={{ marginTop: 0, marginBottom: -2, gridColumn: '1 / -1' }}>
            Dashed line = alert limit (ours, tunable). Solid line = protection trip limit (never ours to move).
          </div>
          {sensors.map((s) => {
            const showAlert = s.healthy_max < 9990
            const showTrip = s.trip_limit != null && s.trip_limit < 9990
            const tail = s.series.slice(-VELOCITY_TAIL)
            const perDay = showTrip ? velocityPerDay(tail) : null
            const dist = showTrip ? distanceToTrip(s.now, s.trip_limit) : null
            const eta = showTrip ? etaToTrip(s.now, s.trip_limit, perDay) : null
            return (
              <div key={s.skey} className="chart-card">
                <div className="head"><div className="title">{s.label}</div>
                  <div className="now">{s.now?.toFixed(2)} <span style={{ color: 'var(--muted)' }}>{s.unit}</span></div></div>
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={s.series} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#1c2534" vertical={false} />
                    <XAxis dataKey="t" tick={{ fill: '#5d6b7d', fontSize: 8 }} minTickGap={50} />
                    <YAxis tick={{ fill: '#5d6b7d', fontSize: 8 }} width={40} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={tipStyle} labelStyle={{ color: '#8b98a9' }} />
                    {showAlert && <ReferenceLine y={s.healthy_max} stroke="#ff5a5c" strokeDasharray="4 4" strokeOpacity={0.7} />}
                    {showTrip && <ReferenceLine y={s.trip_limit} stroke="#b91c1c" strokeWidth={2} strokeOpacity={0.9} />}
                    <Line type="monotone" dataKey="v" stroke="#22e6d6" strokeWidth={1.4} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
                {dist != null && (
                  <div className="trip-stat">
                    <b>{dist.toFixed(1)}{s.unit}</b> to trip
                    {perDay != null && Math.abs(perDay) >= 0.01 && <> {'·'} {perDay >= 0 ? '+' : ''}{perDay.toFixed(2)}{s.unit}/day</>}
                    {eta != null && <> {'·'} ETA ~{eta.toFixed(0)}d</>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
