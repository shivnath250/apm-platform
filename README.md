# APM Platform — Asset Performance Monitoring (Adani Power demo)

A web-based Asset Performance Monitoring (APM) platform that mirrors a real
thermal-power fleet: centralized monitoring of 12 plants, drill-down from
**Company -> Plant -> Unit -> System -> Equipment -> Sensor**, weighted
equipment health scores, and contextual sensor charts. Built as a
portfolio/interview project around rotating-equipment condition monitoring
(FD/ID fans, mills, boiler feed pumps, turbines, generators).

## Architecture (two layers)

**1. Data + brain — Python (`/ml`)**
`build_db.py` generates a relational **SQLite database** (`public/apm.db`) from
`domain.py`: the 12-plant fleet, every sensor, 60 days of 6-hourly readings,
and seeded faults. Re-run it any time to refresh the data.

**2. Website — React + Vite (`/src`)**
A static site that loads `apm.db` in the browser via **sql.js (WebAssembly)**
and runs **real SQL queries** to drive every view. No server needed — deploys
free to GitHub Pages. Click any equipment and it queries that asset's sensors
and draws a contextual line chart for each one.

## What works now

- **Hierarchy tree** (left): every plant -> unit -> system -> equipment, each
  with a rolled-up health % and red/amber/green status.
- **Portfolio overview**: cards for all 12 plants with health and alert counts.
- **Equipment detail**: click any equipment -> a line chart per related sensor,
  with its limit line, current value, and per-sensor health.
- **Admin · Health Weights**: sliders to set each sensor's weight in the health
  score; everything recomputes live. "Copy SQL" emits UPDATE statements so you
  can persist the new weights back into apm.db.

## Run it

Prerequisites: **Python 3.10+** and **Node 18+**.

    # 1) build the SQLite database + train the ML models
    pip install -r requirements.txt
    python ml/build_db.py            # writes public/apm.db (fleet + sensor data)
    python ml/train_models.py        # trains models, writes results into apm.db

    # 2) run the website
    npm install
    npm run dev                      # open the printed localhost URL

Build for hosting: `npm run build` (output in `dist/`).

## Folder structure

    apm-platform/
    |- ml/
    |  |- domain.py        # edit this: plants, equipment, sensors, weights, faults
    |  |- schema.sql       # the SQL schema (readable)
    |  |- build_db.py      # builds public/apm.db
    |- public/
    |  |- apm.db           # the SQLite database the app queries (generated)
    |- src/
    |  |- App.jsx          # loads DB, builds tree, manages weights + health
    |  |- db.js            # sql.js loader + query helper
    |  |- health.js        # health-score math
    |  |- styles.css       # control-room theme
    |  |- components/      # Sidebar, Portfolio, EquipmentDetail, WeightsPanel
    |- index.html
    |- vite.config.js
    |- requirements.txt
    |- README.md

`node_modules/` and `dist/` are not included — run `npm install` to recreate.

## Deploy to GitHub Pages (quick version)

    npm run build
    npm i -D gh-pages
    npx gh-pages -d dist
    # then enable Pages on the gh-pages branch in repo settings

## Roadmap

- [x] Phase 1 — Scaffold + synthetic data
- [x] Phase 2 — SQL data layer (SQLite + schema)
- [x] Phase 3 — React site: hierarchy + portfolio + equipment charts
- [x] Health weights — admin-editable, live recompute
- [ ] Phase 4 — Alerts page: +/-3 sigma control limits (editable), sensor context
- [x] Phase 5 — ML Model Lab (Linear/Logistic/Neural Net, fixed vs smart bounds)
- [ ] Phase 6 — Risk-savings calculator + live feed
- [ ] Phase 7 — AI assistant + polish
