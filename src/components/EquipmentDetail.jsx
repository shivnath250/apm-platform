import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Legend, AreaChart, Area,
} from 'recharts'
import { query } from '../db.js'
import { healthSeries, statusOf } from '../health.js'

const PALETTE = ['#21d4c4', '#d6a52a', '#f85149', '#7aa2f7', '#bb9af7',
                 '#9ece6a', '#ff9e64', '#2ac3de', '#e0af68', '#f7768e']

function findPath(tree, eid) {
  for (const p of tree)
    for (const u of p.units)
      for (const s of u.systems)
        for (const e of s.equipment)
          if (e.id === eid) return { plant: p, unit: u, system: s, equip: e }
  return null
}
const fmt = (epoch) => {
  const d = new Date(epoch * 1000)
  const z = (n) => String(n).padStart(2, '0')
  return `${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}h`
}
const tipStyle = { background: '#161b22', border: '1px solid #263040', borderRadius: 6, fontSize: 12 }

export default function EquipmentDetail({ db, eid, weights, tree, onBack, onBackPlant }) {
  const [sensors, setSensors] = useState([])
  const [hidden, setHidden] = useState({})
  const [paramsOpen, setParamsOpen] = useState(true)
  const [singlesOpen, setSinglesOpen] = useState(false)
  const path = useMemo(() => findPath(tree, eid), [tree, eid])

  useEffect(() => {
    const rows = query(db, `
      SELECT s.skey, s.label, s.unit, s.baseline, s.healthy_max hmax, r.ts, r.value
      FROM sensor s JOIN reading r ON r.sensor_id = s.id
      WHERE s.equipment_id = ? ORDER BY s.id, r.ts`, [eid])
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.skey))
        map.set(r.skey, { skey: r.skey, label: r.label, unit: r.unit,
                          baseline: r.baseline, healthy_max: r.hmax, series: [] })
      map.get(r.skey).series.push({ t: fmt(r.ts), v: r.value })
    }
    const arr = [...map.values()].map((s) => ({ ...s, now: s.series.at(-1)?.v }))
    setSensors(arr)
    setHidden({})
  }, [db, eid])

  const hSeries = useMemo(
    () => (sensors.length ? healthSeries(sensors, weights) : []),
    [sensors, weights]
  )
  const health = hSeries.at(-1)?.health ?? 100
  const status = statusOf(health)

  const combined = useMemo(() => {
    if (!sensors.length) return []
    const n = sensors[0].series.length
    const data = []
    for (let i = 0; i < n; i++) {
      const row = { t: sensors[0].series[i].t }
      for (const s of sensors) row[s.skey] = (s.series[i].v / s.baseline) * 100
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
        <h2>{path.equip.name}</h2>
        <div className="gauge">
          <span className={`num ${status}-t`}>{health.toFixed(0)}<span style={{ fontSize: 16 }}>%</span></span>
          <span className="lbl">{status}</span>
        </div>
      </div>

      <div className="section-title">Health score {'\u00B7'} 60-day trend</div>
      <div className="chart-card wide">
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={hSeries} margin={{ top: 8, right: 14, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id="hgrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#21d4c4" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#21d4c4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1f2733" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: '#5b6675', fontSize: 9 }} minTickGap={60} />
            <YAxis domain={[0, 100]} tick={{ fill: '#5b6675', fontSize: 9 }} width={36} />
            <Tooltip contentStyle={tipStyle} labelStyle={{ color: '#8b98a9' }}
              formatter={(v) => [`${v.toFixed(1)}%`, 'Health']} />
            <ReferenceLine y={80} stroke="#d6a52a" strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={60} stroke="#f85149" strokeDasharray="4 4" strokeOpacity={0.6} />
            <Area type="monotone" dataKey="health" stroke="#21d4c4" strokeWidth={2}
              fill="url(#hgrad)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="legend-note">
          Amber line = warning (80%), red line = alarm (60%). Recomputes live when you change weights.
        </div>
      </div>

      <div className="section-title expander" onClick={() => setParamsOpen((o) => !o)}>
        <span className={`chev ${paramsOpen ? 'open' : ''}`}>{'\u25B6'}</span>
        Parameters {'\u00B7'} all sensors in one chart ({sensors.length})
      </div>
      {paramsOpen && (
        <div className="chart-card wide">
          <div className="legend-note" style={{ marginTop: 0, marginBottom: 8 }}>
            Each sensor shown as % of its normal (baseline) value. 100% = normal.
            Click a name in the legend to hide / show it.
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={combined} margin={{ top: 8, right: 14, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="#1f2733" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: '#5b6675', fontSize: 9 }} minTickGap={60} />
              <YAxis tick={{ fill: '#5b6675', fontSize: 9 }} width={42}
                tickFormatter={(v) => `${v}%`} domain={['auto', 'auto']} />
              <Tooltip contentStyle={tipStyle} labelStyle={{ color: '#8b98a9' }}
                formatter={(v, name) => [`${v.toFixed(1)}%`, name]} />
              <ReferenceLine y={100} stroke="#5b6675" strokeDasharray="2 4" strokeOpacity={0.6} />
              <Legend
                onClick={(o) => setHidden((h) => ({ ...h, [o.dataKey]: !h[o.dataKey] }))}
                wrapperStyle={{ fontSize: 11, cursor: 'pointer', paddingTop: 6 }} />
              {sensors.map((s, i) => (
                <Line key={s.skey} dataKey={s.skey} name={s.label}
                  stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false}
                  hide={!!hidden[s.skey]} isAnimationActive={false} />
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
          {sensors.map((s) => {
            const showLimit = s.healthy_max < 9990
            return (
              <div key={s.skey} className="chart-card">
                <div className="head">
                  <div className="title">{s.label}</div>
                  <div className="now">{s.now?.toFixed(2)} <span style={{ color: 'var(--muted)' }}>{s.unit}</span></div>
                </div>
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={s.series} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#1f2733" vertical={false} />
                    <XAxis dataKey="t" tick={{ fill: '#5b6675', fontSize: 8 }} minTickGap={50} />
                    <YAxis tick={{ fill: '#5b6675', fontSize: 8 }} width={40} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={tipStyle} labelStyle={{ color: '#8b98a9' }} />
                    {showLimit && <ReferenceLine y={s.healthy_max} stroke="#f85149" strokeDasharray="4 4" strokeOpacity={0.7} />}
                    <Line type="monotone" dataKey="v" stroke="#21d4c4" strokeWidth={1.4} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
