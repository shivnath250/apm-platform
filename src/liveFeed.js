// liveFeed.js -- a simulated live sensor feed that runs in the browser.
// It continues the story from the last historical reading: every "tick" it
// produces the next value for each sensor (a gentle wobble around its current
// operating point, plus any fault drift). This mimics an always-on backend
// data feed without needing a server.

function randn() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function noiseFor(s) {
  const span = s.healthy_max < 9990 ? (s.healthy_max - s.baseline) : Math.abs(s.baseline) * 0.5
  return Math.max(1e-6, 0.02 * span)
}

// build the mutable live state from the initial snapshot
export function initLive(latest) {
  const equip = {}
  for (const [eid, sensors] of Object.entries(latest)) {
    equip[eid] = sensors.map((s) => ({
      skey: s.skey, label: s.label, unit: s.unit,
      baseline: s.baseline, healthy_max: s.healthy_max,
      value: s.value, center: s.value, drift: 0, noise: noiseFor(s),
    }))
  }
  return equip
}

// advance one step (mutates equip in place)
export function stepLive(equip) {
  for (const eid in equip) {
    for (const s of equip[eid]) {
      if (s.drift) s.center += s.drift
      s.value = s.value + 0.5 * (s.center - s.value) + s.noise * randn()
    }
  }
}

// read current values into the App's "latest" shape
export function snapshot(equip) {
  const out = {}
  for (const eid in equip) {
    out[eid] = equip[eid].map((s) => ({
      skey: s.skey, label: s.label, unit: s.unit,
      value: s.value, baseline: s.baseline, healthy_max: s.healthy_max,
    }))
  }
  return out
}

// ramp an equipment's top scored sensors toward failure over ~nTicks
export function startScenario(equip, eid, weights, nTicks = 22) {
  const list = equip[eid]
  if (!list) return
  const scored = list.filter((s) => (weights[s.skey] ?? 0) > 0)
  scored.sort((a, b) => (weights[b.skey] ?? 0) - (weights[a.skey] ?? 0))
  for (const s of scored.slice(0, 2)) {
    s.drift = ((s.healthy_max - s.center) * 1.5) / nTicks
  }
}

export function clearDrift(equip, eid) {
  if (equip[eid]) for (const s of equip[eid]) s.drift = 0
}
