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
