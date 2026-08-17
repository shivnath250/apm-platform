"""
build_db.py  --  builds data/apm.db (SQLite) from ml/domain.py
==============================================================
Run from project root:   python ml/build_db.py

This is now the PRIMARY data builder. It creates a relational SQLite database
the React app queries directly (in the browser, via sql.js). Every equipment
gets a 6-hourly / 60-day time series so any equipment you click has charts.

Edit ml/domain.py to change the fleet, then re-run this script.
"""

import os
import sqlite3
import numpy as np
import pandas as pd

import domain as D

DB_PATH = "public/apm.db"
SCHEMA = os.path.join(os.path.dirname(__file__), "schema.sql")

# time grid for EVERY equipment (kept coarse so the whole fleet fits in a
# small DB that loads fast in the browser)
FREQ = "6h"
DAYS = 60
FREQ_HOURS = pd.Timedelta(FREQ) / pd.Timedelta(hours=1)

# how much a sensor sags toward "idle" when its equipment isn't running,
# as a fraction of baseline (0 = drops to zero, 1 = ignores run-state)
IDLE_FLOOR_FRAC = 0.35

# cycle profiles: (n_cycles range, stop-duration range in days, startup hours, coast hours)
CYCLE_PROFILES = {
    "aux": {"n_cycles": (1, 4), "stop_days": (0.5, 4.0), "startup_hours": 24, "coast_hours": 12},
    "tg":  {"n_cycles": (0, 2), "stop_days": (1.0, 3.0), "startup_hours": 48, "coast_hours": 24},
}


def make_index():
    end = pd.Timestamp(D.END_DATE)
    start = end - pd.Timedelta(days=DAYS)
    return pd.date_range(start=start, end=end, freq=FREQ)


def make_load(index, seed):
    rng = np.random.default_rng(seed)
    n = len(index)
    hours = index.hour.to_numpy()
    daily = 6.0 * np.sin(2 * np.pi * hours / 24.0 - 1.0)
    slow = 4.0 * np.sin(2 * np.pi * np.arange(n) / (4 * 11))   # ~11-day waves
    base = 84.0 + rng.normal(0, 2)
    return np.clip(base + daily + slow + rng.normal(0, 1.8, n), 50, 100)


def fault_ramp(index, days, magnitude):
    end = index[-1]
    start = end - pd.Timedelta(days=days)
    frac = (index - start) / pd.Timedelta(days=days)
    return np.clip(frac.to_numpy(dtype=float), 0.0, 1.0) * magnitude


def make_run_envelope(n, rng, profile):
    """0->1 'run fraction' curve: Stopped=0, ramps up (Starting), holds at 1
    (Running), ramps down (Coasting), repeated a random number of times."""
    run = np.ones(n)
    margin = max(1, int(round(72 / FREQ_HOURS)))          # keep 3 days clear of edges
    lo, hi = margin, n - margin
    n_cycles = int(rng.integers(profile["n_cycles"][0], profile["n_cycles"][1]))
    if n_cycles <= 0 or hi <= lo:
        return run

    count = min(n_cycles, max(1, (hi - lo) // margin))
    starts = sorted(rng.choice(np.arange(lo, hi), size=count, replace=False))
    startup_pts = max(1, int(round(profile["startup_hours"] / FREQ_HOURS)))
    coast_pts = max(1, int(round(profile["coast_hours"] / FREQ_HOURS)))
    last_end = -10**9

    for pos in starts:
        if pos - coast_pts < last_end:
            continue                                       # skip if it'd overlap the previous cycle
        stop_days = rng.uniform(*profile["stop_days"])
        stop_pts = max(1, int(round(stop_days * 24 / FREQ_HOURS)))

        c0 = max(0, pos - coast_pts)                       # Coasting: 1 -> 0
        for i in range(c0, pos):
            run[i] = 1 - (i - c0 + 1) / (pos - c0 + 1)

        stop_end = min(n, pos + stop_pts)                  # Stopped: 0
        run[pos:stop_end] = 0

        s_end = min(n, stop_end + startup_pts)             # Starting: 0 -> 1
        for i in range(stop_end, s_end):
            run[i] = (i - stop_end + 1) / (s_end - stop_end)

        last_end = s_end

    return run


def sensor_series(sensor, load, index, fault, chronic, rng, run_frac):
    base = sensor["baseline"] + sensor["slope"] * (load - D.REF_LOAD)
    series = base + rng.normal(0, sensor["noise"], len(load))
    # seeded ramp fault (drives predictive maintenance)
    if fault and fault.get("type") == "degrade":
        mag = fault["sensors"].get(sensor["key"])
        if mag is not None:
            series = series + fault_ramp(index, fault["days"], mag)
    # chronic offset (fleet realism: a steady "not great" equipment)
    if chronic and sensor["weight"] > 0 and sensor["key"] == chronic["skey"]:
        series = series + chronic["offset"]
    # sag toward an idle floor while the equipment isn't running
    if sensor.get("shape_with_run", True):
        idle_floor = sensor["baseline"] * IDLE_FLOOR_FRAC
        series = idle_floor + (series - idle_floor) * run_frac
    return series


def main():
    os.makedirs("public", exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    with open(SCHEMA) as f:
        cur.executescript(f.read())

    index = make_index()
    ts_epoch = [int(t.value // 10**9) for t in index]
    print(f"Time grid: {len(index)} points "
          f"({index[0].date()} -> {index[-1].date()}, every {FREQ})")

    # default weights, collected from the templates (per sensor key).
    # Seeded AFTER plants are inserted (FK), once per plant.
    weights = {}
    for tmpl in D.EQUIPMENT_TEMPLATES.values():
        for s in tmpl["sensors"]:
            weights[s["key"]] = (s["label"], s["weight"])

    sensor_id = 0
    reading_rows = []
    n_equip = 0
    plant_seed = 1000

    for plant in D.PLANTS:
        cur.execute("INSERT INTO plant VALUES(?,?,?,?)",
                    (plant["id"], plant["name"], plant["state"], plant["capacity_mw"]))
        for u in range(1, plant["units"] + 1):
            uid = f"{plant['id']}-U{u}"
            cur.execute("INSERT INTO unit VALUES(?,?,?)", (uid, plant["id"], f"Unit {u}"))
            load = make_load(index, seed=plant_seed); plant_seed += 1

            # one shared run-envelope for the turbine+generator on this unit's shaft
            rng_tg = np.random.default_rng(abs(hash(uid + "-tg")) % (2**32))
            tg_env = make_run_envelope(len(index), rng_tg, CYCLE_PROFILES["tg"])

            for sysdef in D.SYSTEMS:
                sid = f"{uid}-{sysdef['id']}"
                cur.execute("INSERT INTO system VALUES(?,?,?,?)",
                            (sid, uid, sysdef["id"], sysdef["name"]))
                for etype, count in sysdef["equipment"]:
                    tmpl = D.EQUIPMENT_TEMPLATES[etype]
                    for n in range(1, count + 1):
                        inst = f"{uid}-{sysdef['id']}-{etype}-{n}"
                        is_show = inst in D.SHOWCASE
                        fault = D.FAULTS.get(inst)
                        rng = np.random.default_rng(abs(hash(inst)) % (2**32))
                        n_equip += 1

                        # ~38% of non-faulted equipment carry a chronic offset
                        chronic = None
                        if not fault and (abs(hash(inst)) % 100) < 38:
                            scored = [s for s in tmpl["sensors"] if s["weight"] > 0]
                            s = scored[abs(hash(inst)) % len(scored)]
                            chronic = {"skey": s["key"],
                                       "offset": rng.uniform(0.45, 0.85) *
                                                 (s["healthy_max"] - s["baseline"])}

                        cur.execute("INSERT INTO equipment VALUES(?,?,?,?,?,?)",
                                    (inst, sid, etype, f"{tmpl['label']} {n}",
                                     1 if is_show else 0, tmpl["driver_key"]))

                        # run-state envelope: shared per unit for turbine/generator,
                        # independent per instance for auxiliary rotating equipment
                        if tmpl["cycle"] == "tg":
                            run_frac = tg_env
                        else:
                            rng_cycle = np.random.default_rng(abs(hash(inst + "-cycle")) % (2**32))
                            run_frac = make_run_envelope(len(index), rng_cycle, CYCLE_PROFILES["aux"])

                        for s in tmpl["sensors"]:
                            sensor_id += 1
                            cur.execute(
                                "INSERT INTO sensor VALUES(?,?,?,?,?,?,?,?)",
                                (sensor_id, inst, s["key"], s["label"], s["unit"],
                                 s["baseline"], s["healthy_max"], s["trip_limit"]))
                            series = sensor_series(s, load, index, fault, chronic, rng, run_frac)
                            for tsv, val in zip(ts_epoch, series):
                                reading_rows.append((sensor_id, tsv, round(float(val), 3)))

                        # store plant load too (context feature for the ML stage) --
                        # plant-level, so it does NOT sag with this equipment's run-state
                        sensor_id += 1
                        cur.execute(
                            "INSERT INTO sensor VALUES(?,?,?,?,?,?,?,?)",
                            (sensor_id, inst, "load_pct", "Plant Load", "%",
                             D.REF_LOAD, 9999.0, 9999.0))
                        for tsv, val in zip(ts_epoch, load):
                            reading_rows.append((sensor_id, tsv, round(float(val), 2)))

    cur.executemany("INSERT INTO reading VALUES(?,?,?)", reading_rows)

    # now that every plant exists, seed its editable weights
    weight_rows = []
    for plant in D.PLANTS:
        for k, (lbl, w) in weights.items():
            weight_rows.append((plant["id"], k, lbl, w))
    cur.executemany(
        "INSERT OR IGNORE INTO weight(plant_id,skey,label,weight) VALUES(?,?,?,?)",
        weight_rows)

    con.commit()
    con.close()

    size_mb = os.path.getsize(DB_PATH) / 1e6
    print(f"\n  Plants:     {len(D.PLANTS)}")
    print(f"  Equipment:  {n_equip}")
    print(f"  Sensors:    {sensor_id}")
    print(f"  Readings:   {len(reading_rows):,}")
    print(f"\nWrote {DB_PATH}  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
