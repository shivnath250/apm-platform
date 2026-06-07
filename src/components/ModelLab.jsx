import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts'
import { query } from '../db.js'

const fmt = (epoch) => {
  const d = new Date(epoch * 1000)
  const z = (n) => String(n).padStart(2, '0')
  return `${z(d.getMonth() + 1)}-${z(d.getDate())}`
}
const tipStyle = { background: '#161b22', border: '1px solid #263040', borderRadius: 6, fontSize: 12 }

export default function ModelLab({ db }) {
  const [results, setResults] = useState([])
  const [bounds, setBounds] = useState([])
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    try {
      setResults(query(db, `SELECT task, model, metric_name, metric_value, is_best FROM model_result`))
      setBounds(query(db, `SELECT ts, actual, predicted, fixed_ucl, fixed_lcl, smart_ucl, smart_lcl FROM bounds_example ORDER BY ts`)
        .map((r) => ({ ...r, t: fmt(r.ts) })))
      const m = query(db, `SELECT * FROM bounds_meta`)
      setMeta(m[0] || null)
    } catch (e) {
      setMeta({ error: String(e) })
    }
  }, [db])

  if (meta && meta.error)
    return (
      <div>
        <div className="breadcrumb"><b>Adani Power</b> · ML Model Lab</div>
        <h2>Model Lab</h2>
        <div className="empty-hint">
          No ML results found in the database yet. Run <code>python ml/train_models.py</code>
          {' '}(after <code>python ml/build_db.py</code>) to train the models, then reload.
        </div>
      </div>
    )

  // group comparison rows by task
  const tasks = {}
  for (const r of results) (tasks[r.task] ||= []).push(r)

  return (
    <div>
      <div className="breadcrumb"><b>Adani Power</b> · ML Model Lab</div>
      <div className="detail-head">
        <h2>ML Model Lab</h2>
        <div className="empty-hint" style={{ margin: 0 }}>
          Models trained in Python (scikit-learn) on the fleet's sensor data.
          The winner of each task is chosen by its metric.
        </div>
      </div>

      <div className="section-title">Model comparison</div>
      {Object.entries(tasks).map(([task, rows]) => (
        <div key={task} className="ml-task">
          <div className="ml-task-name">{task}</div>
          <div className="ml-table">
            <div className="ml-th"><span>Model</span><span>{rows[0].metric_name}</span><span></span></div>
            {rows.map((r) => (
              <div key={r.model} className={`ml-tr ${r.is_best ? 'best' : ''}`}>
                <span>{r.model}</span>
                <span className="mono">{r.metric_name.startsWith('Acc')
                  ? (r.metric_value * 100).toFixed(1) + '%'
                  : r.metric_value.toFixed(3)}</span>
                <span>{r.is_best ? <span className="best-badge">BEST</span> : ''}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="section-title" style={{ marginTop: 26 }}>
        Fixed ±3σ bounds vs smart (model-driven) bounds
      </div>
      {meta && (
        <div className="ml-callout">
          Example: <b>{meta.equipment}</b>. The flat red band is a fixed ±3σ limit;
          the teal band is the model's prediction ±3σ, which moves with plant load.
          {meta.lead_days != null && (
            <> The smart band flagged this fault <b>{meta.lead_days.toFixed(1)} days earlier</b> than
            the fixed band.</>)}
        </div>
      )}
      <div className="chart-card wide">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={bounds} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#1f2733" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: '#5b6675', fontSize: 9 }} minTickGap={50} />
            <YAxis tick={{ fill: '#5b6675', fontSize: 9 }} width={42} domain={['auto', 'auto']}
              label={{ value: meta?.unit || '', angle: -90, position: 'insideLeft', fill: '#5b6675', fontSize: 10 }} />
            <Tooltip contentStyle={tipStyle} labelStyle={{ color: '#8b98a9' }}
              formatter={(v, n) => [Number(v).toFixed(2), n]} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
            <Line dataKey="fixed_ucl" name="Fixed +3σ" stroke="#f85149" strokeWidth={1.2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="fixed_lcl" name="Fixed -3σ" stroke="#f85149" strokeWidth={1.2} strokeDasharray="5 4" dot={false} legendType="none" isAnimationActive={false} />
            <Line dataKey="smart_ucl" name="Smart +3σ" stroke="#21d4c4" strokeWidth={1.2} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
            <Line dataKey="smart_lcl" name="Smart -3σ" stroke="#21d4c4" strokeWidth={1.2} strokeDasharray="2 3" dot={false} legendType="none" isAnimationActive={false} />
            <Line dataKey="predicted" name="Model prediction" stroke="#7aa2f7" strokeWidth={1.3} dot={false} isAnimationActive={false} />
            <Line dataKey="actual" name="Actual" stroke="#e6edf3" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="ml-note">
        <b>Why this matters (notes #2, #3 &amp; #8):</b> a fixed ±3σ limit is wide because
        its σ absorbs all the normal load-driven swing, so it only alarms once a fault is
        already severe. A model that predicts the <i>expected</i> value for the current load
        leaves only the true anomaly in the residual — so the same ±3σ rule, applied to the
        residual, gives a tighter band that adapts to operating conditions and catches faults
        earlier. That is the difference between "fixed bounds" and "AI smartly varying bounds."
      </div>
    </div>
  )
}
