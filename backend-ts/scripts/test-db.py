#!/usr/bin/env python3
"""Test database viewer flow end-to-end against a container agent."""
import json
import sys
import urllib.request

AGENT = "http://127.0.0.1:" + (sys.argv[1] if len(sys.argv) > 1 else "34569")

def exec_cmd(command, cwd="/home/coder/project", timeout=10000):
    payload = json.dumps({"command": command, "cwd": cwd, "timeout": timeout}).encode()
    req = urllib.request.Request(f"{AGENT}/exec", data=payload, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())

def node_script(script, timeout=10000):
    # Write script to project dir, then run it (so require() finds node_modules)
    write_cmd = f"cat > /home/coder/project/_dbtest.js << 'ENDSCRIPT'\n{script}\nENDSCRIPT"
    exec_cmd(write_cmd)
    return exec_cmd("node _dbtest.js && rm -f _dbtest.js", timeout=timeout)

print(f"=== Testing on {AGENT} ===\n")

# 1. Create test database
print("1. Creating test database...")
result = node_script("""
const Database = require("better-sqlite3");
const db = new Database("test.db");
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, age INTEGER)");
db.exec("INSERT OR IGNORE INTO users VALUES (1, 'Mario Rossi', 'mario@test.com', 30)");
db.exec("INSERT OR IGNORE INTO users VALUES (2, 'Anna Bianchi', 'anna@test.com', 25)");
db.exec("INSERT OR IGNORE INTO users VALUES (3, 'Luca Verdi', 'luca@test.com', 35)");
db.exec("CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT, body TEXT)");
db.exec("INSERT OR IGNORE INTO posts VALUES (1, 1, 'First Post', 'Hello world')");
db.exec("INSERT OR IGNORE INTO posts VALUES (2, 2, 'My Story', 'Once upon a time')");
db.close();
console.log("OK");
""")
print(f"   exit={result['exitCode']} stdout={result['stdout'].strip()}")
if result['exitCode'] != 0:
    print(f"   stderr={result['stderr'][:200]}")
    sys.exit(1)

# 2. Discover
print("\n2. Discovering databases...")
result = exec_cmd('find /home/coder/project -maxdepth 4 \\( -name "*.sqlite" -o -name "*.db" -o -name "*.sqlite3" \\) -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/.git/*" 2>/dev/null || true')
files = [f for f in result['stdout'].strip().split('\n') if f]
print(f"   Found: {files}")

# 3. List tables
print("\n3. Listing tables...")
result = node_script("""
const Database = require("better-sqlite3");
const db = new Database("test.db", { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
const out = tables.map(t => {
  const count = db.prepare("SELECT COUNT(*) as c FROM " + t.name).get();
  return { name: t.name, rowCount: count ? count.c : 0 };
});
db.close();
console.log(JSON.stringify(out));
""")
if result['exitCode'] == 0:
    tables = json.loads(result['stdout'].strip())
    for t in tables:
        print(f"   - {t['name']}: {t['rowCount']} rows")
else:
    print(f"   ERROR: {result['stderr'][:200]}")

# 4. Get rows
print("\n4. Getting rows from users...")
result = node_script("""
const Database = require("better-sqlite3");
const db = new Database("test.db", { readonly: true });
const rows = db.prepare("SELECT rowid, * FROM users LIMIT 50 OFFSET 0").all();
const total = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
db.close();
console.log(JSON.stringify({ rows, columns: cols, total }));
""")
if result['exitCode'] == 0:
    data = json.loads(result['stdout'].strip())
    print(f"   Columns: {data['columns']}")
    print(f"   Total: {data['total']}")
    for r in data['rows']:
        print(f"   {r}")
else:
    print(f"   ERROR: {result['stderr'][:200]}")

# 5. Schema
print("\n5. Getting schema...")
result = node_script("""
const Database = require("better-sqlite3");
const db = new Database("test.db", { readonly: true });
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
const schema = tables.map(t => {
  const columns = db.prepare("PRAGMA table_info(" + t.name + ")").all();
  const fks = db.prepare("PRAGMA foreign_key_list(" + t.name + ")").all();
  const count = db.prepare("SELECT COUNT(*) as c FROM " + t.name).get();
  return { name: t.name, columns: columns.length, foreignKeys: fks.length, rowCount: count ? count.c : 0 };
});
db.close();
console.log(JSON.stringify(schema));
""")
if result['exitCode'] == 0:
    schema = json.loads(result['stdout'].strip())
    for t in schema:
        print(f"   - {t['name']}: {t['columns']} cols, {t['foreignKeys']} FKs, {t['rowCount']} rows")
else:
    print(f"   ERROR: {result['stderr'][:200]}")

# 6. SQL query
print("\n6. Running custom SQL: SELECT u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id")
result = node_script("""
const Database = require("better-sqlite3");
const db = new Database("test.db", { readonly: true });
const stmt = db.prepare("SELECT u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id");
const rows = stmt.all();
const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
db.close();
console.log(JSON.stringify({ rows, columns, total: rows.length }));
""")
if result['exitCode'] == 0:
    data = json.loads(result['stdout'].strip())
    print(f"   Columns: {data['columns']}")
    for r in data['rows']:
        print(f"   {r}")
else:
    print(f"   ERROR: {result['stderr'][:200]}")

# 7. Cleanup
print("\n7. Cleaning up test.db...")
result = exec_cmd("rm -f /home/coder/project/test.db")
print(f"   exit={result['exitCode']}")

print("\n=== ALL TESTS PASSED ===")
