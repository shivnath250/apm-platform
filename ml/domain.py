"""
domain.py  --  THE SINGLE SOURCE OF TRUTH FOR THE PLANT FLEET
=============================================================
Asset hierarchy:  Company -> Plant -> Unit -> System -> Equipment -> Sensor

You (a human) edit THIS file to change the fleet. Everything else
(data generation, ML, the website) is driven from what you define here.

How to use:
  - Add/remove a plant      -> edit PLANTS
  - Change which equipment   -> edit SYSTEMS
  - Change sensor behaviour   -> edit EQUIPMENT_TEMPLATES
  - Add a fault to demo       -> edit FAULTS
  - Pick which equipment get full charts -> edit SHOWCASE
"""

COMPANY = "Adani Power"

# Reference load (% MW) that sensor "baseline" values correspond to.
REF_LOAD = 85.0

# ---------------------------------------------------------------------------
# 1) PLANT FLEET  (representative of Adani Power's real portfolio)
#    capacity_mw is approximate / illustrative for the demo.
# ---------------------------------------------------------------------------
PLANTS = [
    {"id": "MUN", "name": "Mundra",    "state": "Gujarat",        "capacity_mw": 4620, "units": 2},
    {"id": "TIR", "name": "Tiroda",    "state": "Maharashtra",    "capacity_mw": 3300, "units": 2},
    {"id": "KAW", "name": "Kawai",     "state": "Rajasthan",      "capacity_mw": 1320, "units": 2},
    {"id": "UDU", "name": "Udupi",     "state": "Karnataka",      "capacity_mw": 1200, "units": 2},
    {"id": "RAI", "name": "Raipur",    "state": "Chhattisgarh",   "capacity_mw": 1370, "units": 2},
    {"id": "RGH", "name": "Raigarh",   "state": "Chhattisgarh",   "capacity_mw": 600,  "units": 1},
    {"id": "MAH", "name": "Mahan",     "state": "Madhya Pradesh", "capacity_mw": 1200, "units": 2},
    {"id": "GOD", "name": "Godda",     "state": "Jharkhand",      "capacity_mw": 1600, "units": 2},
    {"id": "SIN", "name": "Singrauli", "state": "Madhya Pradesh", "capacity_mw": 1200, "units": 2},
    {"id": "KOR", "name": "Korba",     "state": "Chhattisgarh",   "capacity_mw": 600,  "units": 1},
    {"id": "DAH", "name": "Dahanu",    "state": "Maharashtra",    "capacity_mw": 500,  "units": 2},
    {"id": "PEN", "name": "Pench",     "state": "Madhya Pradesh", "capacity_mw": 1320, "units": 2},
]

# ---------------------------------------------------------------------------
# 2) SENSOR TEMPLATES per equipment TYPE
#    Each sensor:
#      key          short id used in CSV column + JSON
#      label        human name shown on the website
#      unit         engineering unit
#      baseline     normal value at REF_LOAD
#      slope        how much it moves per +1% load  (this is what lets the
#                   ML model learn "smart bounds" that adapt to load)
#      noise        random std-dev of normal scatter
#      healthy_max  soft limit; above this the sensor is degrading
#      weight       importance in the equipment health score (0 = context only)
# ---------------------------------------------------------------------------
_FAN_SENSORS = [
    {"key": "mtr_nde_brg_temp", "label": "Motor NDE Bearing Temp", "unit": "degC", "baseline": 65, "slope": 0.25, "noise": 1.2, "healthy_max": 85,  "weight": 1.2},
    {"key": "mtr_de_brg_temp",  "label": "Motor DE Bearing Temp",  "unit": "degC", "baseline": 62, "slope": 0.22, "noise": 1.2, "healthy_max": 85,  "weight": 1.2},
    {"key": "nde_vib_x",        "label": "NDE Vibration X",        "unit": "mm/s", "baseline": 2.2, "slope": 0.015, "noise": 0.25, "healthy_max": 4.5, "weight": 1.5},
    {"key": "nde_vib_y",        "label": "NDE Vibration Y",        "unit": "mm/s", "baseline": 2.0, "slope": 0.014, "noise": 0.25, "healthy_max": 4.5, "weight": 1.5},
    {"key": "motor_current",    "label": "Motor Current",          "unit": "A",    "baseline": 180, "slope": 1.6,  "noise": 4.0, "healthy_max": 215, "weight": 1.0},
    {"key": "winding_temp",     "label": "Winding Temp",           "unit": "degC", "baseline": 78, "slope": 0.30, "noise": 1.5, "healthy_max": 105, "weight": 1.0},
]

_PUMP_SENSORS = [
    {"key": "de_brg_temp",   "label": "DE Bearing Temp",  "unit": "degC", "baseline": 60, "slope": 0.20, "noise": 1.0, "healthy_max": 82,  "weight": 1.2},
    {"key": "nde_brg_temp",  "label": "NDE Bearing Temp", "unit": "degC", "baseline": 58, "slope": 0.20, "noise": 1.0, "healthy_max": 82,  "weight": 1.2},
    {"key": "vib_x",         "label": "Vibration X",      "unit": "mm/s", "baseline": 1.8, "slope": 0.012, "noise": 0.20, "healthy_max": 4.0, "weight": 1.5},
    {"key": "motor_current", "label": "Motor Current",    "unit": "A",    "baseline": 220, "slope": 1.8,  "noise": 5.0, "healthy_max": 260, "weight": 1.0},
    {"key": "disch_press",   "label": "Discharge Press",  "unit": "bar",  "baseline": 180, "slope": 0.40, "noise": 2.0, "healthy_max": 999, "weight": 0.0},
    {"key": "flow",          "label": "Flow",             "unit": "t/h",  "baseline": 1200, "slope": 6.0, "noise": 20.0, "healthy_max": 9999, "weight": 0.0},
]

_MILL_SENSORS = [
    {"key": "motor_current", "label": "Motor Current", "unit": "A",    "baseline": 90, "slope": 0.8,  "noise": 3.0, "healthy_max": 120, "weight": 1.0},
    {"key": "gearbox_temp",  "label": "Gearbox Temp",  "unit": "degC", "baseline": 70, "slope": 0.25, "noise": 1.5, "healthy_max": 95,  "weight": 1.3},
    {"key": "vib",           "label": "Vibration",     "unit": "mm/s", "baseline": 3.0, "slope": 0.02, "noise": 0.30, "healthy_max": 6.0, "weight": 1.5},
    {"key": "outlet_temp",   "label": "Outlet Temp",   "unit": "degC", "baseline": 80, "slope": 0.30, "noise": 2.0, "healthy_max": 110, "weight": 0.8},
]

_TURBINE_SENSORS = [
    {"key": "brg1_temp",   "label": "Bearing 1 Temp", "unit": "degC", "baseline": 95, "slope": 0.15, "noise": 1.0, "healthy_max": 115, "weight": 1.3},
    {"key": "brg2_temp",   "label": "Bearing 2 Temp", "unit": "degC", "baseline": 96, "slope": 0.15, "noise": 1.0, "healthy_max": 115, "weight": 1.3},
    {"key": "axial_shift", "label": "Axial Shift",    "unit": "mm",   "baseline": 0.20, "slope": 0.001, "noise": 0.02, "healthy_max": 0.60, "weight": 1.4},
    {"key": "vib",         "label": "Shaft Vibration","unit": "um",   "baseline": 30, "slope": 0.05, "noise": 3.0, "healthy_max": 75,  "weight": 1.5},
    {"key": "speed",       "label": "Speed",          "unit": "rpm",  "baseline": 3000, "slope": 0.0, "noise": 2.0, "healthy_max": 9999, "weight": 0.0},
]

_GEN_SENSORS = [
    {"key": "stator_temp",  "label": "Stator Temp",  "unit": "degC", "baseline": 90, "slope": 0.30, "noise": 1.5, "healthy_max": 120, "weight": 1.2},
    {"key": "winding_temp", "label": "Winding Temp", "unit": "degC", "baseline": 92, "slope": 0.30, "noise": 1.5, "healthy_max": 120, "weight": 1.2},
    {"key": "vib",          "label": "Vibration",    "unit": "um",   "baseline": 28, "slope": 0.05, "noise": 3.0, "healthy_max": 70,  "weight": 1.5},
    {"key": "h2_pressure",  "label": "H2 Pressure",  "unit": "bar",  "baseline": 3.5, "slope": 0.0, "noise": 0.05, "healthy_max": 9999, "weight": 0.0},
]

EQUIPMENT_TEMPLATES = {
    "FD_FAN":    {"label": "FD Fan",            "sensors": _FAN_SENSORS},
    "ID_FAN":    {"label": "ID Fan",            "sensors": _FAN_SENSORS},
    "PA_FAN":    {"label": "PA Fan",            "sensors": _FAN_SENSORS},
    "MILL":      {"label": "Coal Mill",         "sensors": _MILL_SENSORS},
    "BFP":       {"label": "Boiler Feed Pump",  "sensors": _PUMP_SENSORS},
    "CW_PUMP":   {"label": "CW Pump",           "sensors": _PUMP_SENSORS},
    "CEP":       {"label": "Condensate Pump",   "sensors": _PUMP_SENSORS},
    "TURBINE":   {"label": "Steam Turbine",     "sensors": _TURBINE_SENSORS},
    "GENERATOR": {"label": "Generator",         "sensors": _GEN_SENSORS},
}

# ---------------------------------------------------------------------------
# 3) SYSTEMS inside every unit  ->  which equipment and how many of each
# ---------------------------------------------------------------------------
SYSTEMS = [
    {"id": "BLR", "name": "Boiler", "equipment": [
        ("FD_FAN", 2), ("ID_FAN", 2), ("PA_FAN", 1), ("MILL", 2),
    ]},
    {"id": "TG", "name": "Turbine-Generator", "equipment": [
        ("TURBINE", 1), ("GENERATOR", 1), ("BFP", 2),
    ]},
    {"id": "CW", "name": "Cooling Water", "equipment": [
        ("CW_PUMP", 1), ("CEP", 1),
    ]},
]

# ---------------------------------------------------------------------------
# 4) SHOWCASE equipment  ->  get FULL hourly time-series CSVs (rich charts +
#    ML). Everything else gets a realistic current snapshot only, which keeps
#    the repo small and openable in VS Code.
#    Instance id format:  {PLANT}-U{unit}-{SYSTEM}-{TYPE}-{n}
# ---------------------------------------------------------------------------
SHOWCASE = [
    "MUN-U1-BLR-FD_FAN-1", "MUN-U1-BLR-ID_FAN-1", "MUN-U1-BLR-MILL-1",
    "MUN-U1-TG-BFP-1",     "MUN-U1-TG-TURBINE-1",
    "UDU-U1-BLR-FD_FAN-1", "UDU-U1-TG-BFP-1",     "UDU-U1-TG-GENERATOR-1",
    "UDU-U1-BLR-ID_FAN-1",
    "TIR-U1-BLR-FD_FAN-1", "TIR-U1-BLR-ID_FAN-1", "TIR-U1-TG-BFP-1",
]

# ---------------------------------------------------------------------------
# 5) FAULT SCENARIOS  ->  these drive the alerts & predictive-maintenance demo.
#    "degrade": named sensors ramp up over the last `days` days by `magnitude`.
#    Only applied to SHOWCASE equipment (they have full time series).
# ---------------------------------------------------------------------------
FAULTS = {
    # ---- Mundra ----
    "MUN-U1-BLR-FD_FAN-1": {"type": "degrade", "days": 40,   # star example
        "sensors": {"nde_vib_x": 4.2, "nde_vib_y": 3.5, "mtr_nde_brg_temp": 18}},
    "MUN-U1-BLR-MILL-1": {"type": "degrade", "days": 30,
        "sensors": {"gearbox_temp": 22, "vib": 2.5}},
    "MUN-U2-TG-BFP-1": {"type": "degrade", "days": 22,
        "sensors": {"de_brg_temp": 20, "vib_x": 2.6}},
    # ---- Tiroda ----
    "TIR-U1-BLR-FD_FAN-1": {"type": "degrade", "days": 25,
        "sensors": {"mtr_de_brg_temp": 16, "nde_vib_x": 2.4}},
    "TIR-U1-BLR-ID_FAN-2": {"type": "degrade", "days": 35,
        "sensors": {"nde_vib_y": 3.0, "winding_temp": 24}},
    # ---- Kawai ----
    "KAW-U1-TG-TURBINE-1": {"type": "degrade", "days": 45,
        "sensors": {"vib": 45, "brg1_temp": 18, "axial_shift": 0.35}},
    # ---- Udupi (your old plant) ----
    "UDU-U1-TG-BFP-1": {"type": "degrade", "days": 18,
        "sensors": {"motor_current": 55, "vib_x": 3.0, "de_brg_temp": 16}},
    "UDU-U2-BLR-MILL-2": {"type": "degrade", "days": 28,
        "sensors": {"gearbox_temp": 26, "vib": 3.2}},
    # ---- Raipur ----
    "RAI-U1-BLR-PA_FAN-1": {"type": "degrade", "days": 30,
        "sensors": {"mtr_nde_brg_temp": 22, "nde_vib_x": 2.8}},
    # ---- Raigarh ----
    "RGH-U1-TG-GENERATOR-1": {"type": "degrade", "days": 33,
        "sensors": {"stator_temp": 30, "vib": 38}},
    # ---- Mahan ----
    "MAH-U1-CW-CW_PUMP-1": {"type": "degrade", "days": 20,
        "sensors": {"de_brg_temp": 22, "vib_x": 2.7, "motor_current": 45}},
    # ---- Godda ----
    "GOD-U1-BLR-FD_FAN-2": {"type": "degrade", "days": 26,
        "sensors": {"nde_vib_x": 3.0, "nde_vib_y": 2.6, "mtr_de_brg_temp": 15}},
    # ---- Singrauli ----
    "SIN-U1-TG-BFP-2": {"type": "degrade", "days": 24,
        "sensors": {"motor_current": 50, "nde_brg_temp": 19}},
    # ---- Korba ----
    "KOR-U1-BLR-MILL-1": {"type": "degrade", "days": 31,
        "sensors": {"gearbox_temp": 24, "motor_current": 28}},
    # ---- Dahanu ----
    "DAH-U1-BLR-ID_FAN-1": {"type": "degrade", "days": 29,
        "sensors": {"mtr_nde_brg_temp": 20, "nde_vib_y": 2.5}},
    # ---- Pench ----
    "PEN-U1-TG-TURBINE-1": {"type": "degrade", "days": 38,
        "sensors": {"vib": 40, "brg2_temp": 16}},
}

# ---------------------------------------------------------------------------
# Data window for showcase time series
# ---------------------------------------------------------------------------
HISTORY_DAYS = 90          # 90 days of hourly data (~2160 rows per equipment)
END_DATE = "2026-06-01"    # fixed end date -> reproducible data
