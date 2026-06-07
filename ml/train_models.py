"""
train_models.py  --  the ML brain of the APM platform
======================================================
Run AFTER build_db.py:   python ml/train_models.py

Two real machine-learning tasks (scikit-learn), both trained on the sensor
data already in public/apm.db, with results written back INTO the database so
the website can show them.

Task 1 - Expected-value prediction  (this is the "smart bounds" idea)
    Predict a sensor's healthy value from operating conditions (plant load).
    Linear Regression vs Neural Network, scored by MAE (lower = better).
    The model's prediction +/- 3*residual-sigma gives a "smart" band that
    moves with load, versus a flat fixed +/-3 sigma band.

Task 2 - Fault classification
    Is the equipment in a degrading/fault state? Logistic Regression vs a
    Neural Network classifier, scored by accuracy (higher = better).

Tables written:  model_result, bounds_example, bounds_meta
"""

import sqlite3
import numpy as np

from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.neural_network import MLPRegressor, MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import mean_absolute_error, accuracy_score
from sklearn.model_selection import train_test_split

import domain as D

DB = "public/apm.db"
EXAMPLE_EQUIP = "MUN-U1-BLR-FD_FAN-1"   # the star fault for the bounds demo
EXAMPLE_SENSOR = "mtr_nde_brg_temp"


def fetch(con, sql, params=()):
    cur = con.execute(sql, params)
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def sensor_frame(con, eid):
    """Return {skey: {ts:[], val:[], baseline, healthy_max, label, unit}} for one equipment."""
    rows = fetch(con, """
        SELECT s.skey, s.label, s.unit, s.baseline, s.healthy_max, r.ts, r.value
        FROM sensor s JOIN reading r ON r.sensor_id = s.id
        WHERE s.equipment_id = ? ORDER BY s.id, r.ts""", (eid,))
    out = {}
    for r in rows:
        d = out.setdefault(r["skey"], {"ts": [], "val": [], "baseline": r["baseline"],
                                       "healthy_max": r["healthy_max"],
                                       "label": r["label"], "unit": r["unit"]})
        d["ts"].append(r["ts"]); d["val"].append(r["value"])
    return out


# ---------------------------------------------------------------------------
# TASK 1 — expected-value prediction + fixed vs smart bounds
# ---------------------------------------------------------------------------
def task1_bounds(con):
    f = sensor_frame(con, EXAMPLE_EQUIP)
    load = np.array(f["load_pct"]["val"])
    ts = np.array(f["load_pct"]["ts"])
    target = f[EXAMPLE_SENSOR]
    y = np.array(target["val"])

    n = len(y)
    healthy_n = int(n * 0.33)              # first third is before the fault ramp
    Xh = load[:healthy_n].reshape(-1, 1)
    yh = y[:healthy_n]

    # fair predictor quality: split the HEALTHY data
    Xtr, Xte, ytr, yte = train_test_split(Xh, yh, test_size=0.3, random_state=42)
    lin = LinearRegression().fit(Xtr, ytr)
    nn = make_pipeline(StandardScaler(),
                       MLPRegressor(hidden_layer_sizes=(16, 8), max_iter=2000,
                                    random_state=42)).fit(Xtr, ytr)
    mae_lin = mean_absolute_error(yte, lin.predict(Xte))
    mae_nn = mean_absolute_error(yte, nn.predict(Xte))

    # predict across the whole timeline using the linear model (interpretable)
    pred = lin.predict(load.reshape(-1, 1))
    resid_sigma = float(np.std(yh - lin.predict(Xh)))

    # fixed +/-3 sigma band: flat, from the healthy window's own mean/sigma
    fmean, fsig = float(np.mean(yh)), float(np.std(yh))
    fixed_ucl = fmean + 3 * fsig
    fixed_lcl = fmean - 3 * fsig
    # smart band: prediction +/- 3*residual sigma -> tracks load
    smart_ucl = pred + 3 * resid_sigma
    smart_lcl = pred - 3 * resid_sigma

    # how early does each band catch the fault? (2 consecutive points above UCL)
    def detect_day(upper_arr):
        ucl = upper_arr if np.ndim(upper_arr) else np.full(n, upper_arr)
        for i in range(1, n):
            if y[i] > ucl[i] and y[i - 1] > ucl[i - 1]:
                return (ts[i] - ts[0]) / 86400.0
        return None

    fixed_day = detect_day(fixed_ucl)
    smart_day = detect_day(smart_ucl)

    # write the example series
    con.execute("DROP TABLE IF EXISTS bounds_example")
    con.execute("""CREATE TABLE bounds_example
        (ts INT, actual REAL, predicted REAL,
         fixed_ucl REAL, fixed_lcl REAL, smart_ucl REAL, smart_lcl REAL)""")
    con.executemany("INSERT INTO bounds_example VALUES (?,?,?,?,?,?,?)",
                    [(int(ts[i]), float(y[i]), float(pred[i]),
                      fixed_ucl, fixed_lcl, float(smart_ucl[i]), float(smart_lcl[i]))
                     for i in range(n)])

    con.execute("DROP TABLE IF EXISTS bounds_meta")
    con.execute("""CREATE TABLE bounds_meta
        (equipment TEXT, sensor TEXT, unit TEXT, mae_linear REAL, mae_nn REAL,
         fixed_detect_day REAL, smart_detect_day REAL, lead_days REAL)""")
    lead = (fixed_day - smart_day) if (fixed_day and smart_day) else None
    con.execute("INSERT INTO bounds_meta VALUES (?,?,?,?,?,?,?,?)",
                (f"Mundra · {target['label']}", target["label"], target["unit"],
                 mae_lin, mae_nn, fixed_day, smart_day, lead))

    return mae_lin, mae_nn


# ---------------------------------------------------------------------------
# TASK 2 — fault classification across the fleet
# ---------------------------------------------------------------------------
def build_classification_set(con):
    """Features per (equipment, time): [mean_dev, max_dev, frac_over_half].
    Label 1 = clearly faulty (faulted equipment, deep in its ramp)."""
    eids = [r["id"] for r in fetch(con, "SELECT id FROM equipment")]
    X, ylab = [], []
    rng = np.random.default_rng(0)
    for eid in eids:
        f = sensor_frame(con, eid)
        scored = {k: v for k, v in f.items() if v["healthy_max"] < 9990}
        if not scored:
            continue
        n = len(next(iter(scored.values()))["val"])
        devs = []  # per-timestamp list of deviation arrays
        for i in range(n):
            row = []
            for v in scored.values():
                span = v["healthy_max"] - v["baseline"]
                row.append(max(0.0, (v["val"][i] - v["baseline"]) / span) if span > 0 else 0)
            devs.append(np.array(row))
        feats = np.array([[d.mean(), d.max(), float((d > 0.5).mean())] for d in devs])

        faulted = eid in D.FAULTS
        if faulted:
            lo = int(n * 0.7)                     # deep-fault region -> positives
            for i in range(lo, n):
                X.append(feats[i]); ylab.append(1)
            for i in range(0, int(n * 0.2)):      # its own early healthy region
                X.append(feats[i]); ylab.append(0)
        else:
            for i in rng.choice(n, size=6, replace=False):  # sample healthy
                X.append(feats[i]); ylab.append(0)
    return np.array(X), np.array(ylab)


def task2_classify(con):
    X, y = build_classification_set(con)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)
    log = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(Xtr, ytr)
    nn = make_pipeline(StandardScaler(),
                       MLPClassifier(hidden_layer_sizes=(16, 8), max_iter=2000,
                                     random_state=42)).fit(Xtr, ytr)
    return (accuracy_score(yte, log.predict(Xte)),
            accuracy_score(yte, nn.predict(Xte)),
            len(y), int(y.sum()))


def main():
    con = sqlite3.connect(DB)

    mae_lin, mae_nn = task1_bounds(con)
    acc_log, acc_nn, n_samples, n_pos = task2_classify(con)

    con.execute("DROP TABLE IF EXISTS model_result")
    con.execute("""CREATE TABLE model_result
        (task TEXT, model TEXT, metric_name TEXT, metric_value REAL, is_best INT)""")
    rows = [
        ("Expected-value prediction (smart bounds)", "Linear Regression", "MAE (degC)", mae_lin, int(mae_lin <= mae_nn)),
        ("Expected-value prediction (smart bounds)", "Neural Network",    "MAE (degC)", mae_nn,  int(mae_nn < mae_lin)),
        ("Fault classification", "Logistic Regression", "Accuracy", acc_log, int(acc_log >= acc_nn)),
        ("Fault classification", "Neural Network",      "Accuracy", acc_nn,  int(acc_nn > acc_log)),
    ]
    con.executemany("INSERT INTO model_result VALUES (?,?,?,?,?)", rows)
    con.commit()

    print("Task 1 - prediction MAE:  Linear = %.3f degC | Neural Net = %.3f degC" % (mae_lin, mae_nn))
    print("Task 2 - classification:  Logistic = %.1f%% | Neural Net = %.1f%%  (%d samples, %d faulty)"
          % (acc_log * 100, acc_nn * 100, n_samples, n_pos))
    bm = fetch(con, "SELECT * FROM bounds_meta")[0]
    if bm["lead_days"]:
        print("Smart bounds flagged the fault %.1f days earlier than fixed +/-3 sigma." % bm["lead_days"])
    print("\nWrote tables: model_result, bounds_example, bounds_meta")
    con.close()


if __name__ == "__main__":
    main()
