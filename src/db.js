// db.js — loads the SQLite database into the browser with sql.js (WebAssembly)
// and exposes a tiny query helper. The whole app reads data through real SQL.
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let _db = null

// Open public/apm.db once and keep it in memory.
export async function openDb() {
  if (_db) return _db
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const buf = await fetch(`${import.meta.env.BASE_URL}apm.db`).then((r) => r.arrayBuffer())
  _db = new SQL.Database(new Uint8Array(buf))
  return _db
}

// Run a SQL query and return an array of plain row objects.
export function query(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}
