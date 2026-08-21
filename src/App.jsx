import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { openDb, query } from './db.js'
import { equipmentHealth, statusOf, avg, worstSensor, runStateOf } from './health.js'
import { initLive, stepLive, snapshot, startScenario } from './liveFeed.js'
import Sidebar from './components/Sidebar.jsx'
import AlertsDashboard from './components/AlertsDashboard.jsx'
import PlantPage from './components/PlantPage.jsx'
import EquipmentDetail from './components/EquipmentDetail.jsx'
import ModelLab from './components/ModelLab.jsx'
import WeightsPanel from './components/WeightsPanel.jsx'
import EventTicker from './components/EventTicker.jsx'

const plantOf = (eid) => eid.split('-')[0]
const rank = { healthy: 0, warning: 1, alarm: 2 }
const runStateFor = (sensors, driverSkey) => {
  if (!sensors || !driverSkey) return 'running'
  const s = sensors.find((x) => x.skey === driverSkey)
  if (!s) return 'running'
  return runStateOf(s.hist || [s.value], s.baseline)
}
const clockStr = (ts) => {
  const d = new Date(ts * 1000); const z = (n) => String(n).padStart(2, '0')
  return `${z(d.getDate())} ${d.toLocaleString('en', { month: 'short' })} ${z(d.getHours())}:${z(d.getMinutes())}`
}

export default function App() {
  const [db, setDb] = useState(null)
  const [tree, setTree] = useState([])
  const [liveLatest, setLiveLatest] = useState({})
  const [weightsByPlant, setWeightsByPlant] = useState({})
  const [weightsByEquip, setWeightsByEquip] = useState({})   // per-equipment overrides (eid -> {skey: weight})
  const [defaults, setDefaults] = useState({ byPlant: {}, labels: {} })
  const [nav, setNav] = useState({ view: 'home', filter: 'all' })
  const [showWeights, setShowWeights] = useState(false)
  const [err, setErr] = useState(null)

  // live-feed state
  const [liveOn, setLiveOn] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [virtualTs, setVirtualTs] = useState(0)
  const [tickId, setTickId] = useState(0)
  const [events, setEvents] = useState([])
  const liveRef = useRef(null)
  const prevStatus = useRef({})
  const eidInfo = useRef({})
  const virtualTsRef = useRef(0)

  const goHome = (filter = 'all') => setNav({ view: 'home', filter })
  const goPlant = (plantId) => setNav({ view: 'plant', plantId })
  const goEquip = (eid) => setNav({ view: 'equipment', eid })
  const goModelLab = () => setNav({ view: 'modellab' })
  const setFilter = (filter) => setNav((n) => ({ ...n, filter }))

  useEffect(() => {
    openDb().then((database) => {
      setDb(database)
      const rows = query(database, `
        SELECT p.id pid, p.name pname, p.state, p.capacity_mw, u.id uid, u.name uname,
               sy.id sid, sy.name sname, e.id eid, e.name ename, e.type etype, e.showcase, e.driver_skey
        FROM plant p JOIN unit u ON u.plant_id = p.id JOIN system sy ON sy.unit_id = u.id
        JOIN equipment e ON e.system_id = sy.id ORDER BY p.id, u.id, sy.id, e.id`)
      const builtTree = buildTree(rows)
      setTree(builtTree)
      const info = {}
      for (const p of builtTree) for (const u of p.units) for (const s of u.systems) for (const e of s.equipment)
        info[e.id] = { name: e.name, plant: p.name, driverSkey: e.driver_skey }
      eidInfo.current = info

      const snap = query(database, `
        SELECT s.equipment_id eid, s.skey, s.label, s.unit, s.baseline, s.healthy_max hmax, s.trip_limit tlim, r.value
        FROM sensor s JOIN reading r ON r.sensor_id = s.id WHERE r.ts = (SELECT MAX(ts) FROM reading)`)
      const maxTs = query(database, `SELECT MAX(ts) m FROM reading`)[0].m
      const byEquip = {}
      for (const r of snap) (byEquip[r.eid] ||= []).push({ skey: r.skey, label: r.label, unit: r.unit, value: r.value, baseline: r.baseline, healthy_max: r.hmax, trip_limit: r.tlim })
      setLiveLatest(byEquip)
      liveRef.current = initLive(byEquip)
      setVirtualTs(maxTs + 1800)

      const w = query(database, `SELECT plant_id, skey, label, weight FROM weight`)
      const byPlant = {}, labels = {}
      for (const x of w) { (byPlant[x.plant_id] ||= {})[x.skey] = x.weight; labels[x.skey] = x.label }
      setWeightsByPlant(byPlant)
      setDefaults({ byPlant: JSON.parse(JSON.stringify(byPlant)), labels })
    }).catch((e) => setErr(String(e)))
  }, [])

  // resolve the effective weights for an equipment: per-equipment override wins,
  // otherwise fall back to the plant-level weights.
  const weightsFor = useCallback(
    (eid) => weightsByEquip[eid] || weightsByPlant[plantOf(eid)] || {},
    [weightsByEquip, weightsByPlant])

  const healthByEquip = useMemo(() => {
    const m = {}
    for (const [eid, sensors] of Object.entries(liveLatest)) m[eid] = equipmentHealth(sensors, weightsFor(eid))
    return m
  }, [liveLatest, weightsFor])

  const runStateByEquip = useMemo(() => {
    const m = {}
    for (const [eid, sensors] of Object.entries(liveLatest)) m[eid] = runStateFor(sensors, eidInfo.current[eid]?.driverSkey)
    return m
  }, [liveLatest])

  // flat index of every equipment + its scored sensor keys, for the per-equipment weights editor
  const equipIndex = useMemo(() => {
    const out = []
    for (const p of tree) for (const u of p.units) for (const s of u.systems) for (const e of s.equipment) {
      const skeys = (liveLatest[e.id] || []).map((x) => x.skey).filter((sk) => defaults.labels[sk])
      out.push({ eid: e.id, plantId: p.id, plantName: p.name, name: e.name, label: `${u.name} · ${s.name} · ${e.name}`, skeys })
    }
    return out
  }, [tree, liveLatest, defaults.labels])

  const fleetStats = useMemo(() => {
    const vals = Object.values(healthByEquip)
    // masked (starting/stopped) equipment doesn't count toward alarm/warning totals -- it's
    // not a real problem, just startup/shutdown transients
    const unmasked = Object.entries(healthByEquip).filter(([eid]) => {
      const rs = runStateByEquip[eid]
      return rs !== 'starting' && rs !== 'stopped'
    }).map(([, h]) => h)
    return {
      total: vals.length,
      alarms: unmasked.filter((h) => statusOf(h) === 'alarm').length,
      warns: unmasked.filter((h) => statusOf(h) === 'warning').length,
      health: avg(vals),
    }
  }, [healthByEquip, runStateByEquip])

  // the live loop
  useEffect(() => {
    if (!liveOn || !liveRef.current || !db) return
    const interval = Math.max(140, 2000 / speed)
    const id = setInterval(() => {
      stepLive(liveRef.current)
      const snap = snapshot(liveRef.current)
      const newEvents = []
      const nextTs = virtualTsRef.current + 1800
      for (const eid in snap) {
        const w = weightsFor(eid)
        const st = statusOf(equipmentHealth(snap[eid], w))
        const prev = prevStatus.current[eid]
        const rs = runStateFor(snap[eid], eidInfo.current[eid]?.driverSkey)
        const masked = rs === 'starting' || rs === 'stopped'
        if (prev && prev !== st && rank[st] > rank[prev] && !masked) {
          const ws = worstSensor(snap[eid], w)
          newEvents.push({ ts: nextTs, eid, level: st, text: `${eidInfo.current[eid]?.name || eid} (${eidInfo.current[eid]?.plant}) entered ${st.toUpperCase()}${ws ? ` · ${ws.label} ${ws.value.toFixed(1)}` : ''}` })
        }
        prevStatus.current[eid] = st
      }
      setLiveLatest(snap)
      virtualTsRef.current = nextTs
      setVirtualTs(nextTs)
      setTickId((x) => x + 1)
      if (newEvents.length) setEvents((ev) => [...newEvents.reverse(), ...ev].slice(0, 60))
    }, interval)
    return () => clearInterval(id)
  }, [liveOn, speed, db, weightsFor])

  // keep a ref of virtualTs so the interval closure sees the latest
  useEffect(() => { virtualTsRef.current = virtualTs }, [virtualTs])

  // seed prevStatus once data is ready
  useEffect(() => {
    if (Object.keys(prevStatus.current).length || !Object.keys(healthByEquip).length) return
    for (const eid in healthByEquip) prevStatus.current[eid] = statusOf(healthByEquip[eid])
  }, [healthByEquip])

  const runScenario = () => {
    if (!liveRef.current) return
    let best = null, bestH = -1
    for (const eid in healthByEquip) if (healthByEquip[eid] > bestH) { bestH = healthByEquip[eid]; best = eid }
    if (!best) return
    startScenario(liveRef.current, best, weightsFor(best), 22)
    setLiveOn(true); setSpeed(5); goEquip(best)
    setEvents((ev) => [{ ts: virtualTsRef.current, eid: best, level: 'warning', text: `⚡ Fault scenario injected on ${eidInfo.current[best]?.name} (${eidInfo.current[best]?.plant}) — watch it degrade` }, ...ev].slice(0, 60))
  }

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

        <div className={`live-cluster ${liveOn ? 'on' : ''}`}>
          <button className="live-btn" onClick={() => setLiveOn((o) => !o)} title="Play / pause the live feed">
            <span className={`live-pip ${liveOn ? '' : 'paused'}`} />{liveOn ? 'LIVE' : 'PAUSED'}
          </button>
          <div className="live-clock">{virtualTs ? clockStr(virtualTs) : '—'}</div>
          <div className="speed-seg">
            {[1, 5, 20].map((s) => (
              <button key={s} className={`sp ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>{s}×</button>
            ))}
          </div>
          <button className="scenario-btn" onClick={runScenario} title="Inject a fault and watch it develop">⚡ Run failure scenario</button>
        </div>

        <div className="fleet-stat">
          <b className={statusOf(fleetStats.health) + '-t'}>{fleetStats.health.toFixed(0)}%</b>
        </div>
        <button className="stat-btn alarm" onClick={() => goHome('alarm')}><span className="dot alarm" /> <b>{fleetStats.alarms}</b> <span className="stat-lbl">Alarms</span></button>
        <button className="stat-btn warning" onClick={() => goHome('warning')}><span className="dot warning" /> <b>{fleetStats.warns}</b> <span className="stat-lbl">Warnings</span></button>
        <button className={`btn ${nav.view === 'modellab' ? 'btn-on' : ''}`} onClick={goModelLab}>🧪 Model Lab</button>
        <button className="btn" onClick={() => setShowWeights(true)}>⚙ Weights</button>
        <a className="btn portal-link" href="https://shivnath250.github.io/ppms/" target="_top"
          title="Open the Performance & Issue Management portal">↗ PPMS Portal</a>
      </div>

      <div className="body">
        <Sidebar tree={tree} healthByEquip={healthByEquip} selected={nav.eid} onSelectEquip={goEquip} onSelectPlant={goPlant} />
        <div className="main">
          {nav.view === 'equipment' && (
            <EquipmentDetail db={db} eid={nav.eid} weights={weightsFor(nav.eid)} tree={tree}
              onBack={() => goHome('all')} onBackPlant={goPlant}
              liveTickId={tickId} liveSensors={liveLatest[nav.eid]} liveTs={virtualTs} liveOn={liveOn}
              driverSkey={eidInfo.current[nav.eid]?.driverSkey} runState={runStateByEquip[nav.eid]} />
          )}
          {nav.view === 'plant' && (
            <PlantPage plant={tree.find((p) => p.id === nav.plantId)} healthByEquip={healthByEquip} onSelectEquip={goEquip} onBack={() => goHome('all')} />
          )}
          {nav.view === 'modellab' && <ModelLab db={db} />}
          {nav.view === 'home' && (
            <AlertsDashboard tree={tree} latest={liveLatest} weightsByPlant={weightsByPlant} weightsByEquip={weightsByEquip}
              healthByEquip={healthByEquip} runStateByEquip={runStateByEquip}
              filter={nav.filter} onFilter={setFilter} onSelectEquip={goEquip} onSelectPlant={goPlant} />
          )}
        </div>
      </div>

      <EventTicker events={events} onSelectEquip={goEquip} />

      {showWeights && (
        <WeightsPanel plants={tree.map((p) => ({ id: p.id, name: p.name }))} weightsByPlant={weightsByPlant}
          weightsByEquip={weightsByEquip} equipIndex={equipIndex} defaults={defaults}
          onChange={setWeightsByPlant} onChangeEquip={setWeightsByEquip} onClose={() => setShowWeights(false)} />
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
    s.equipment.push({ id: r.eid, name: r.ename, type: r.etype, showcase: r.showcase, driver_skey: r.driver_skey })
    p.eids.push(r.eid); u.eids.push(r.eid); s.eids.push(r.eid)
  }
  const toArr = (m) => [...m.values()]
  return toArr(plants).map((p) => ({ ...p, units: toArr(p.units).map((u) => ({ ...u, systems: toArr(u.systems) })) }))
}
