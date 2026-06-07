import { useMemo, useState } from 'react'
import { statusOf, avg } from '../health.js'
import EquipmentIcon from './EquipmentIcon.jsx'

export default function PlantPage({ plant, healthByEquip, onSelectEquip, onBack }) {
  const [filter, setFilter] = useState('critical') // 'critical' | 'all'

  // flatten this plant's equipment with unit/system context
  const items = useMemo(() => {
    const out = []
    for (const u of plant.units)
      for (const s of u.systems)
        for (const e of s.equipment) {
          const h = healthByEquip[e.id] ?? 100
          out.push({ ...e, unit: u.name, system: s.name, health: h, status: statusOf(h) })
        }
    return out.sort((a, b) => a.health - b.health) // worst first
  }, [plant, healthByEquip])

  const critical = items.filter((e) => e.status !== 'healthy')
  const shown = filter === 'critical' ? critical : items
  const plantHealth = avg(items.map((e) => e.health))
  const alarms = critical.filter((e) => e.status === 'alarm').length

  return (
    <div>
      <div className="breadcrumb">
        <span className="crumb-link" onClick={onBack}>Adani Power</span> › <b>{plant.name}</b>
      </div>
      <div className="detail-head">
        <h2>{plant.name} <span style={{ color: 'var(--muted)', fontSize: 15, fontWeight: 400 }}>· {plant.state}</span></h2>
        <div className="gauge">
          <span className={`num ${statusOf(plantHealth)}-t`}>{plantHealth.toFixed(0)}<span style={{ fontSize: 16 }}>%</span></span>
          <span className="lbl">plant health</span>
        </div>
        <div className="empty-hint" style={{ margin: 0 }}>
          {plant.cap} MW · {items.length} assets ·{' '}
          <span className="alarm-t">{alarms} alarms</span>,{' '}
          <span className="warning-t">{critical.length - alarms} warnings</span>
        </div>
      </div>

      <div className="filter-bar">
        <button className={`seg ${filter === 'critical' ? 'on' : ''}`} onClick={() => setFilter('critical')}>
          Critical equipment · {critical.length}
        </button>
        <button className={`seg ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
          All equipment · {items.length}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="empty-hint">No critical equipment in this plant — everything is healthy.</div>
      ) : (
        <div className="equip-grid">
          {shown.map((e) => (
            <div
              key={e.id}
              className={`equip-card ${e.status}`}
              onClick={() => onSelectEquip(e.id)}
            >
              <div className={`equip-ico ${e.status}-t`}>
                <EquipmentIcon type={e.type} />
              </div>
              <div className="equip-meta">
                <div className="equip-name">{e.name}</div>
                <div className="equip-loc">{e.unit} · {e.system}</div>
              </div>
              <div className="equip-foot">
                <span className={`dot ${e.status}`} />
                <span className={`pill ${e.status}`}>{e.health.toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
