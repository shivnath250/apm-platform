import { useEffect, useMemo, useState } from 'react'

export default function WeightsPanel({
  plants, weightsByPlant, weightsByEquip = {}, equipIndex = [], defaults,
  onChange, onChangeEquip, onClose,
}) {
  const [scope, setScope] = useState('plant')          // 'plant' | 'equip'
  const [pid, setPid] = useState(plants[0]?.id)
  const [eid, setEid] = useState('')
  const [copied, setCopied] = useState(false)
  const labels = defaults.labels || {}

  // equipment in the chosen plant (for the per-equipment dropdown)
  const equipOptions = useMemo(() => equipIndex.filter((e) => e.plantId === pid), [equipIndex, pid])
  useEffect(() => {
    if (scope === 'equip' && !equipOptions.some((e) => e.eid === eid)) setEid(equipOptions[0]?.eid || '')
  }, [scope, equipOptions, eid])

  // ---------- per-plant editing ----------
  const plantW = weightsByPlant[pid] || {}
  const plantKeys = Object.keys(plantW).sort((a, b) => (labels[a] || a).localeCompare(labels[b] || b))
  const setPlant = (k, v) => onChange({ ...weightsByPlant, [pid]: { ...plantW, [k]: v } })
  const resetPlant = () => onChange({ ...weightsByPlant, [pid]: { ...(defaults.byPlant[pid] || {}) } })
  const copySql = () => {
    const sql = plantKeys.map((k) => `UPDATE weight SET weight = ${plantW[k]} WHERE plant_id = '${pid}' AND skey = '${k}';`).join('\n')
    navigator.clipboard?.writeText(sql)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  // ---------- per-equipment editing (overrides the plant weights) ----------
  const item = equipIndex.find((e) => e.eid === eid)
  const override = weightsByEquip[eid]
  const effective = (k) => override?.[k] ?? plantW[k] ?? 0
  const setEquip = (k, v) => {
    // first edit seeds the override from the plant weights so untouched sensors keep plant values
    const base = override || Object.fromEntries((item?.skeys || []).map((sk) => [sk, plantW[sk] ?? 0]))
    onChangeEquip({ ...weightsByEquip, [eid]: { ...base, [k]: v } })
  }
  const resetEquip = () => {
    const next = { ...weightsByEquip }; delete next[eid]; onChangeEquip(next)
  }
  const equipKeys = (item?.skeys || []).slice().sort((a, b) => (labels[a] || a).localeCompare(labels[b] || b))

  const plantName = plants.find((p) => p.id === pid)?.name

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="panel-slide">
        <h3>Health Weights · Admin</h3>
        <div className="hint">Each sensor's importance in the health score. Set them across a whole <b>plant</b>, or override an <b>individual equipment</b>. 0 = context only. Changes apply live.</div>

        <div className="scope-seg">
          <button className={scope === 'plant' ? 'on' : ''} onClick={() => setScope('plant')}>Per plant</button>
          <button className={scope === 'equip' ? 'on' : ''} onClick={() => setScope('equip')}>Per equipment</button>
        </div>

        <label className="plant-select-label">Plant</label>
        <select className="plant-select" value={pid} onChange={(e) => setPid(e.target.value)}>
          {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {scope === 'equip' && (
          <>
            <label className="plant-select-label">Equipment</label>
            <select className="plant-select" value={eid} onChange={(e) => setEid(e.target.value)}>
              {equipOptions.map((e) => <option key={e.eid} value={e.eid}>{e.label}</option>)}
            </select>
          </>
        )}

        {scope === 'plant' ? (
          <>
            <div className="editing-note">Editing weights for <b>{plantName}</b></div>
            {plantKeys.map((k) => (
              <div className="wrow" key={k}>
                <div className="wlab"><span>{labels[k] || k}</span><span className="wval">{Number(plantW[k]).toFixed(1)}</span></div>
                <input type="range" min="0" max="3" step="0.1" value={plantW[k]} onChange={(e) => setPlant(k, parseFloat(e.target.value))} />
              </div>
            ))}
            <div className="panel-actions">
              <button className="btn" onClick={resetPlant}>Reset this plant</button>
              <button className="btn" onClick={copySql}>{copied ? '✓ Copied SQL' : 'Copy SQL to persist'}</button>
              <button className="btn" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="editing-note">
              Editing <b>{item?.name}</b> {override ? <span className="override-tag">overridden</span> : <span className="faint">(using {plantName} defaults)</span>}
            </div>
            {equipKeys.map((k) => (
              <div className="wrow" key={k}>
                <div className="wlab"><span>{labels[k] || k}</span><span className="wval">{Number(effective(k)).toFixed(1)}</span></div>
                <input type="range" min="0" max="3" step="0.1" value={effective(k)} onChange={(e) => setEquip(k, parseFloat(e.target.value))} />
              </div>
            ))}
            <div className="hint" style={{ marginTop: 4 }}>Overrides apply live to this equipment's health score. (The demo database stores weights per plant, so these aren't emitted as SQL.)</div>
            <div className="panel-actions">
              <button className="btn" onClick={resetEquip} disabled={!override}>Reset to plant defaults</button>
              <button className="btn" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
