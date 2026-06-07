import { useState } from 'react'

export default function WeightsPanel({ plants, weightsByPlant, defaults, onChange, onClose }) {
  const [pid, setPid] = useState(plants[0]?.id)
  const [copied, setCopied] = useState(false)
  const labels = defaults.labels || {}
  const current = weightsByPlant[pid] || {}
  const keys = Object.keys(current).sort((a, b) => (labels[a] || a).localeCompare(labels[b] || b))

  const set = (k, v) =>
    onChange({ ...weightsByPlant, [pid]: { ...current, [k]: v } })

  const reset = () =>
    onChange({ ...weightsByPlant, [pid]: { ...(defaults.byPlant[pid] || {}) } })

  const copySql = () => {
    const sql = keys
      .map((k) => `UPDATE weight SET weight = ${current[k]} WHERE plant_id = '${pid}' AND skey = '${k}';`)
      .join('\n')
    navigator.clipboard?.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const plantName = plants.find((p) => p.id === pid)?.name

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="panel-slide">
        <h3>Health Weights · Admin</h3>
        <div className="hint">
          Each sensor's importance in the health score, set <b>per plant</b>.
          0 = context only (charted but not scored). Changes apply to the chosen
          plant instantly across all its equipment.
        </div>

        <label className="plant-select-label">Plant</label>
        <select className="plant-select" value={pid} onChange={(e) => setPid(e.target.value)}>
          {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <div className="editing-note">Editing weights for <b>{plantName}</b></div>

        {keys.map((k) => (
          <div className="wrow" key={k}>
            <div className="wlab">
              <span>{labels[k] || k}</span>
              <span className="wval">{Number(current[k]).toFixed(1)}</span>
            </div>
            <input type="range" min="0" max="3" step="0.1"
              value={current[k]} onChange={(e) => set(k, parseFloat(e.target.value))} />
          </div>
        ))}

        <div className="panel-actions">
          <button className="btn" onClick={reset}>Reset this plant</button>
          <button className="btn" onClick={copySql}>{copied ? '✓ Copied SQL' : 'Copy SQL to persist'}</button>
          <button className="btn" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</button>
        </div>
      </div>
    </>
  )
}
