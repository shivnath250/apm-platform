import { useEffect, useMemo, useState } from 'react'
import { openDb, query } from './db.js'
import { equipmentHealth, statusOf, avg } from './health.js'
import Sidebar from './components/Sidebar.jsx'
import AlertsDashboard from './components/AlertsDashboard.jsx'
import PlantPage from './components/PlantPage.jsx'
import EquipmentDetail from './components/EquipmentDetail.jsx'
import ModelLab from './components/ModelLab.jsx'
import WeightsPanel from './components/WeightsPanel.jsx'

const plantOf = (eid) => eid.split('-')[0]

export default function App() {
  const [db, setDb] = useState(null)
  const [tree, setTree] = useState([])
  const [latest, setLatest] = useState({})          // eid -> [{skey,label,unit,value,baseline,healthy_max}]
  const [weightsByPlant, setWeightsByPlant] = useState({})   // {pid:{skey:w}}
  const [defaults, setDefaults] = useState({ byPlant: {}, labels: {} })
  const [nav, setNav] = useState({ view: 'home', filter: 'all' })
  const [showWeights, setShowWeights] = useState(false)
  const [err, setErr] = useState(null)

  const goHome = (filter = 'all') => setNav({ view: 'home', filter })
  const goPlant = (plantId) => setNav({ view: 'plant', plantId })
  const goEquip = (eid) => setNav({ view: 'equipment', eid })
  const goModelLab = () => setNav({ view: 'modellab' })
  const setFilter = (filter) => setNav((n) => ({ ...n, filter }))

  useEffect(() => {
    openDb()
      .then((database) => {
        setDb(database)

        const rows = query(database, `
          SELECT p.id pid, p.name pname, p.state, p.capacity_mw,
                 u.id uid, u.name uname, sy.id sid, sy.name sname,
                 e.id eid, e.name ename, e.type etype, e.showcase
          FROM plant p
          JOIN unit u   ON u.plant_id = p.id
          JOIN system sy ON sy.unit_id = u.id
          JOIN equipment e ON e.system_id = sy.id
          ORDER BY p.id, u.id, sy.id, e.id`)
        setTree(buildTree(rows))

        const snap = query(database, `
          SELECT s.equipment_id eid, s.skey, s.label, s.unit,
                 s.baseline, s.healthy_max hmax, r.value
          FROM sensor s
          JOIN reading r ON r.sensor_id = s.id
          WHERE r.ts = (SELECT MAX(ts) FROM reading)`)
        const byEquip = {}
        for (const r of snap) {
          ;(byEquip[r.eid] ||= []).push({
            skey: r.skey, label: r.label, unit: r.unit,
            value: r.value, baseline: r.baseline, healthy_max: r.hmax,
          })
        }
        setLatest(byEquip)

        const w = query(database, `SELECT plant_id, skey, label, weight FROM weight`)
        const byPlant = {}
        const labels = {}
        for (const x of w) {
          ;(byPlant[x.plant_id] ||= {})[x.skey] = x.weight
          labels[x.skey] = x.label
        }
        setWeightsByPlant(byPlant)
        setDefaults({ byPlant: JSON.parse(JSON.stringify(byPlant)), labels })
      })
      .catch((e) => setErr(String(e)))
  }, [])

  // equipment health using each equipment's OWN plant weights
  const healthByEquip = useMemo(() => {
    const m = {}
    for (const [eid, sensors] of Object.entries(latest)) {
      const w = weightsByPlant[plantOf(eid)] || {}
      m[eid] = equipmentHealth(sensors, w)
    }
    return m
  }, [latest, weightsByPlant])

  const fleetStats = useMemo(() => {
    const vals = Object.values(healthByEquip)
    return {
      total: vals.length,
      alarms: vals.filter((h) => statusOf(h) === 'alarm').length,
      warns: vals.filter((h) => statusOf(h) === 'warning').length,
      health: avg(vals),
    }
  }, [healthByEquip])

  if (err) return <div className="loader">Failed to load database<br />{err}</div>
  if (!db) return <div className="loader"><div className="spinner" />Loading plant database…</div>

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand brand-btn" onClick={() => goHome('all')} title="Home">
          <span className="mark">APM</span>
          <h1>Asset Performance Monitoring</h1>
          <span className="sub">Adani Power · fleet</span>
        </div>
        <div className="spacer" />
        <div className="fleet-stat">
          Fleet health <b className={statusOf(fleetStats.health) + '-t'}>{fleetStats.health.toFixed(0)}%</b>
        </div>
        <button className="stat-btn alarm" onClick={() => goHome('alarm')}>
          <span className="dot alarm" /> <b>{fleetStats.alarms}</b> alarms
        </button>
        <button className="stat-btn warning" onClick={() => goHome('warning')}>
          <span className="dot warning" /> <b>{fleetStats.warns}</b> warnings
        </button>
        <button className={`btn ${nav.view === 'modellab' ? 'btn-on' : ''}`} onClick={goModelLab}>🧪 Model Lab</button>
        <button className="btn" onClick={() => setShowWeights(true)}>⚙ Admin · Health Weights</button>
      </div>

      <div className="body">
        <Sidebar tree={tree} healthByEquip={healthByEquip} selected={nav.eid}
          onSelectEquip={goEquip} onSelectPlant={goPlant} />
        <div className="main">
          {nav.view === 'equipment' && (
            <EquipmentDetail db={db} eid={nav.eid}
              weights={weightsByPlant[plantOf(nav.eid)] || {}} tree={tree}
              onBack={() => goHome('all')} onBackPlant={goPlant} />
          )}
          {nav.view === 'plant' && (
            <PlantPage plant={tree.find((p) => p.id === nav.plantId)}
              healthByEquip={healthByEquip} onSelectEquip={goEquip}
              onBack={() => goHome('all')} />
          )}
          {nav.view === 'modellab' && <ModelLab db={db} />}
          {nav.view === 'home' && (
            <AlertsDashboard tree={tree} latest={latest} weightsByPlant={weightsByPlant}
              healthByEquip={healthByEquip} filter={nav.filter}
              onFilter={setFilter} onSelectEquip={goEquip} onSelectPlant={goPlant} />
          )}
        </div>
      </div>

      {showWeights && (
        <WeightsPanel
          plants={tree.map((p) => ({ id: p.id, name: p.name }))}
          weightsByPlant={weightsByPlant}
          defaults={defaults}
          onChange={setWeightsByPlant}
          onClose={() => setShowWeights(false)} />
      )}
    </div>
  )
}

function buildTree(rows) {
  const plants = new Map()
  for (const r of rows) {
    let p = plants.get(r.pid)
    if (!p) { p = { id: r.pid, name: r.pname, state: r.state, cap: r.capacity_mw, eids: [], units: new Map() }; plants.set(r.pid, p) }
    let u = p.units.get(r.uid)
    if (!u) { u = { id: r.uid, name: r.uname, eids: [], systems: new Map() }; p.units.set(r.uid, u) }
    let s = u.systems.get(r.sid)
    if (!s) { s = { id: r.sid, name: r.sname, eids: [], equipment: [] }; u.systems.set(r.sid, s) }
    s.equipment.push({ id: r.eid, name: r.ename, type: r.etype, showcase: r.showcase })
    p.eids.push(r.eid); u.eids.push(r.eid); s.eids.push(r.eid)
  }
  const toArr = (m) => [...m.values()]
  return toArr(plants).map((p) => ({
    ...p,
    units: toArr(p.units).map((u) => ({ ...u, systems: toArr(u.systems) })),
  }))
}
