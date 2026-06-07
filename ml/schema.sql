-- schema.sql  --  relational model for the APM platform
-- Company is implicit (single tenant). Hierarchy:
--   plant -> unit -> system -> equipment -> sensor -> reading
-- Health weights live in their own table so an admin can edit them.

PRAGMA foreign_keys = ON;

CREATE TABLE plant (
    id          TEXT PRIMARY KEY,   -- e.g. 'MUN'
    name        TEXT NOT NULL,      -- e.g. 'Mundra'
    state       TEXT,
    capacity_mw INTEGER
);

CREATE TABLE unit (
    id       TEXT PRIMARY KEY,      -- e.g. 'MUN-U1'
    plant_id TEXT NOT NULL REFERENCES plant(id),
    name     TEXT NOT NULL          -- e.g. 'Unit 1'
);

CREATE TABLE system (
    id      TEXT PRIMARY KEY,       -- e.g. 'MUN-U1-BLR'
    unit_id TEXT NOT NULL REFERENCES unit(id),
    code    TEXT NOT NULL,          -- 'BLR'
    name    TEXT NOT NULL           -- 'Boiler'
);

CREATE TABLE equipment (
    id        TEXT PRIMARY KEY,     -- e.g. 'MUN-U1-BLR-FD_FAN-1'
    system_id TEXT NOT NULL REFERENCES system(id),
    type      TEXT NOT NULL,        -- 'FD_FAN'
    name      TEXT NOT NULL,        -- 'FD Fan 1'
    showcase  INTEGER DEFAULT 0
);

CREATE TABLE sensor (
    id           INTEGER PRIMARY KEY,
    equipment_id TEXT NOT NULL REFERENCES equipment(id),
    skey         TEXT NOT NULL,     -- 'nde_vib_x' (links to weight table)
    label        TEXT NOT NULL,     -- 'NDE Vibration X'
    unit         TEXT,              -- 'mm/s'
    baseline     REAL,              -- normal value (health = 100 here)
    healthy_max  REAL               -- soft limit (health = 0 here)
);

-- time-series readings (compact: integer fks + epoch seconds)
CREATE TABLE reading (
    sensor_id INTEGER NOT NULL REFERENCES sensor(id),
    ts        INTEGER NOT NULL,     -- epoch seconds (UTC)
    value     REAL    NOT NULL
);
CREATE INDEX idx_reading ON reading(sensor_id, ts);

-- admin-editable health weights, PER PLANT (one row per plant + sensor key)
CREATE TABLE weight (
    plant_id TEXT NOT NULL REFERENCES plant(id),
    skey     TEXT NOT NULL,
    label    TEXT,
    weight   REAL NOT NULL,        -- 0 = context only (not scored)
    PRIMARY KEY (plant_id, skey)
);
