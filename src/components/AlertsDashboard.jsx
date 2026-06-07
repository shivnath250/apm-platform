import { useMemo } from 'react'
import { statusOf, worstSensor } from '../health.js'
import EquipmentIcon from './EquipmentIcon.jsx'

// flatten the whole fleet into rows with path + health + driving sensor
function buildRows(tree, latest, weightsByPlant, healthByEquip) {
  const rows = []
  for (const p of tree)
    for (const u of p.units)
      for (const s of u.systems)
        for (const e of s.equipment) {
          const h = healthByEquip[e.id] ?? 100
          const st = statusOf(h)
          if (st === 'healthy') continue
          const w = weightsByPlant[p.id] || {}
          const worst = worstSensor(latest[e.id] || [], w)
          rows.push({
            eid: e.id, name: e.name, type: e.type,
            plant: p.name, plantId: p.id, unit: u.name, system: s.name,
            health: h, status: st, worst,
          })
        }
  return rows.sort((a, b) => a.health - b.health)
}

function Table({ rows, onSelectEquip, onSelectPlant }) {
  if (!rows.length)
    return <div className="empty-hint">Nothing here right now — all clear.</div>
  return (
    <div className="alert-table">
      {rows.map((r) => (
        <div key={r.eid} className={`alert-row ${r.status}`} onClick={() => onSelectEquip(r.eid)}>
          <span className={`alert-ico ${r.status}-t`}><EquipmentIcon type={r.type} size={30} /></span>
          <div className="alert-main">
            <div className="alert-name">{r.name}</div>
            <div className="alert-path">
              <span className="plink" onClick={(ev) => { ev.stopPropagation(); onSelectPlant(r.plantId) }}>
                {r.plant}</span> · {r.unit} · {r.system}
            </div>
          </div>
          <div className="alert-driver">
            {r.worst && (<>
              <span className="dlabel">{r.worst.label}</span>
              <span className="dval">{r.worst.value?.toFixed(1)} {r.worst.unit}</span>
            </>)}
          </div>
          <span className={`pill ${r.status}`}>{r.health.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function AlertsDashboard({ tree, latest, weightsByPlant, healthByEquip, filter, onFilter, onSelectEquip, onSelectPlant }) {
  const rows = useMemo(
    () => buildRows(tree, latest, weightsByPlant, healthByEquip),
    [tree, latest, weightsByPlant, healthByEquip]
  )
  const alarms = rows.filter((r) => r.status === 'alarm')
  const warnings = rows.filter((r) => r.status === 'warning')

  return (
    <div>
      <div className="breadcrumb"><b>Adani Power</b> · fleet alert center</div>
      <div className="detail-head">
        <h2>Alert Center</h2>
        <div className="empty-hint" style={{ margin: 0 }}>
          Every alarm and warning across all 12 plants. Click any row to open the
          equipment; click a plant name to open that plant.
        </div>
      </div>

      <div className="filter-bar">
        <button className={`seg ${filter === 'all' ? 'on' : ''}`} onClick={() => onFilter('all')}>
          Both · {rows.length}</button>
        <button className={`seg ${filter === 'alarm' ? 'on' : ''}`} onClick={() => onFilter('alarm')}>
          Alarms · {alarms.length}</button>
        <button className={`seg ${filter === 'warning' ? 'on' : ''}`} onClick={() => onFilter('warning')}>
          Warnings · {warnings.length}</button>
      </div>

      {(filter === 'all' || filter === 'alarm') && (
        <>
          <div className="section-title"><span className="dot alarm" /> Alarm dashboard · {alarms.length} critical</div>
          <Table rows={alarms} onSelectEquip={onSelectEquip} onSelectPlant={onSelectPlant} />
        </>
      )}
      {(filter === 'all' || filter === 'warning') && (
        <>
          <div className="section-title" style={{ marginTop: 26 }}>
            <span className="dot warning" /> Alert dashboard · {warnings.length} warnings</div>
          <Table rows={warnings} onSelectEquip={onSelectEquip} onSelectPlant={onSelectPlant} />
        </>
      )}
    </div>
  )
}
