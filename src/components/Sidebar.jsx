import { useState } from 'react'
import { statusOf, avg } from '../health.js'

function Pill({ h }) {
  return <span className={`pill ${statusOf(h)}`}>{h.toFixed(0)}</span>
}
function rollup(eids, healthByEquip) {
  return avg(eids.map((id) => healthByEquip[id] ?? 100))
}

export default function Sidebar({ tree, healthByEquip, selected, onSelectEquip, onSelectPlant }) {
  const [open, setOpen] = useState(() => ({}))
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const clickPlant = (p) => { toggle(p.id); onSelectPlant(p.id) }

  return (
    <div className="sidebar">
      <div className="tree-section-label">Fleet · {tree.length} plants</div>
      {tree.map((p) => {
        const pOpen = open[p.id]
        return (
          <div key={p.id}>
            <div className="row" onClick={() => clickPlant(p)}>
              <span className={`chev ${pOpen ? 'open' : ''}`}>▶</span>
              <span className="name">{p.name}</span>
              <span className="meta">{p.cap}MW</span>
              <Pill h={rollup(p.eids, healthByEquip)} />
            </div>
            {pOpen && p.units.map((u) => {
              const uOpen = open[u.id]
              return (
                <div key={u.id} style={{ marginLeft: 14 }}>
                  <div className="row" onClick={() => toggle(u.id)}>
                    <span className={`chev ${uOpen ? 'open' : ''}`}>▶</span>
                    <span className="name">{u.name}</span>
                    <Pill h={rollup(u.eids, healthByEquip)} />
                  </div>
                  {uOpen && u.systems.map((s) => {
                    const sOpen = open[s.id]
                    return (
                      <div key={s.id} style={{ marginLeft: 14 }}>
                        <div className="row" onClick={() => toggle(s.id)}>
                          <span className={`chev ${sOpen ? 'open' : ''}`}>▶</span>
                          <span className="name">{s.name}</span>
                          <Pill h={rollup(s.eids, healthByEquip)} />
                        </div>
                        {sOpen && s.equipment.map((e) => {
                          const h = healthByEquip[e.id] ?? 100
                          return (
                            <div key={e.id} className={`row leaf ${selected === e.id ? 'selected' : ''}`}
                              style={{ marginLeft: 26 }} onClick={() => onSelectEquip(e.id)}>
                              <span className={`dot ${statusOf(h)}`} />
                              <span className="name">{e.name}</span>
                              <Pill h={h} />
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
