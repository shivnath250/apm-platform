// health.js -- the equipment health model.

export function sensorHealth(value, baseline, healthyMax) {
  if (healthyMax <= baseline) return 100
  const dev = Math.max(0, (value - baseline) / (healthyMax - baseline))
  return Math.max(0, Math.min(100, 100 * (1 - dev)))
}

export function equipmentHealth(sensors, weights) {
  let num = 0, den = 0
  for (const s of sensors) {
    const w = weights[s.skey] ?? 0
    if (w <= 0) continue
    num += w * sensorHealth(s.value, s.baseline, s.healthy_max)
    den += w
  }
  return den ? num / den : 100
}

export function statusOf(h) {
  if (h >= 80) return 'healthy'
  if (h >= 60) return 'warning'
  return 'alarm'
}

export function worstSensor(sensors, weights) {
  let worst = null
  for (const s of sensors) {
    const w = weights[s.skey] ?? 0
    if (w <= 0) continue
    const h = sensorHealth(s.value, s.baseline, s.healthy_max)
    if (!worst || h < worst.health) worst = { ...s, health: h }
  }
  return worst
}

export function avg(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 100
}

// health at every timestamp (for the trend chart)
export function healthSeries(sensorsWithSeries, weights) {
  const n = sensorsWithSeries[0]?.series.length || 0
  const out = []
  for (let i = 0; i < n; i++) {
    const snap = sensorsWithSeries.map((s) => ({
      skey: s.skey, value: s.series[i].v, baseline: s.baseline, healthy_max: s.healthy_max,
    }))
    out.push({ t: sensorsWithSeries[0].series[i].t, health: equipmentHealth(snap, weights) })
  }
  return out
}

// ---------------------------------------------------------------------------
// Operating-state + distance/velocity-to-trip
// ---------------------------------------------------------------------------

// classify Stopped/Starting/Running/Coasting from a short recent tail of a
// driver sensor's raw values (oldest -> newest). Needs at least 1 point;
// with 2+ it can tell Starting from Coasting by direction.
export function runStateOf(tailValues, baseline) {
  if (!tailValues || !tailValues.length || !baseline) return 'running'
  const v = tailValues[tailValues.length - 1]
  const frac = v / baseline
  if (frac < 0.15) return 'stopped'
  if (frac < 0.85) {
    const prev = tailValues.length > 1 ? tailValues[tailValues.length - 2] : v
    return v >= prev ? 'starting' : 'coasting'
  }
  return 'running'
}

export const RUN_STATE_LABEL = { stopped: 'Stopped', starting: 'Starting', running: 'Running', coasting: 'Coasting' }

// raw-unit headroom to the protection trip limit (null if the sensor has no real trip limit)
export function distanceToTrip(value, tripLimit) {
  if (tripLimit == null || tripLimit > 9990) return null
  return tripLimit - value
}

// simple least-squares slope (per day) over a tail of {ts, v} points (ts = epoch seconds)
export function velocityPerDay(points) {
  if (!points || points.length < 2) return null
  const n = points.length
  const tMean = points.reduce((a, p) => a + p.ts, 0) / n
  const vMean = points.reduce((a, p) => a + p.v, 0) / n
  let num = 0, den = 0
  for (const p of points) {
    const dt = p.ts - tMean
    num += dt * (p.v - vMean)
    den += dt * dt
  }
  if (den === 0) return null
  return (num / den) * 86400
}

// rough days-to-trip at the current rate; null if not trending toward trip
export function etaToTrip(value, tripLimit, perDay) {
  if (tripLimit == null || tripLimit > 9990 || !perDay || perDay <= 0) return null
  const dist = tripLimit - value
  if (dist <= 0) return 0
  return dist / perDay
}
