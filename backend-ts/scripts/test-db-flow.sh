#!/bin/bash
# Test the database viewer flow end-to-end
# Usage: ./scripts/test-db-flow.sh [agent_port]
set -euo pipefail

PORT="${1:-34569}"
AGENT="http://127.0.0.1:$PORT"

echo "=== Testing DB flow on $AGENT ==="

# 1. Create a test database
echo "1. Creating test database..."
SETUP_SCRIPT=$(cat <<'NODESCRIPT'
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
NODESCRIPT
)

RESULT=$(curl -s --max-time 10 "$AGENT/exec" -X POST -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'command': 'node -e ' + json.dumps('''$SETUP_SCRIPT'''), 'cwd': '/home/coder/project', 'timeout': 10000}))")")
echo "  Result: $RESULT"

# 2. Discover databases
echo ""
echo "2. Discovering databases..."
RESULT=$(curl -s --max-time 10 "$AGENT/exec" -X POST -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'command': 'find /home/coder/project -maxdepth 4 \\( -name \"*.sqlite\" -o -name \"*.db\" -o -name \"*.sqlite3\" \\) -not -path \"*/node_modules/*\" -not -path \"*/.next/*\" 2>/dev/null || true', 'cwd': '/home/coder/project', 'timeout': 10000}))")")
echo "  Result: $RESULT"

# 3. List tables
echo ""
echo "3. Listing tables..."
TABLES_SCRIPT='const Database = require("better-sqlite3");const db = new Database("test.db",{readonly:true});const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='"'"'table'"'"' AND name NOT LIKE '"'"'sqlite_%'"'"'").all();const result = tables.map(t => {const count = db.prepare("SELECT COUNT(*) as c FROM " + t.name).get();return {name:t.name,rowCount:count?count.c:0}});db.close();console.log(JSON.stringify(result))'
RESULT=$(curl -s --max-time 10 "$AGENT/exec" -X POST -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'command': 'node -e ' + json.dumps('''$TABLES_SCRIPT'''), 'cwd': '/home/coder/project', 'timeout': 10000}))")")
echo "  Result: $RESULT"

# 4. Get rows from users table
echo ""
echo "4. Getting rows from users table..."
ROWS_SCRIPT='const Database = require("better-sqlite3");const db = new Database("test.db",{readonly:true});const rows = db.prepare("SELECT rowid, * FROM users LIMIT 50 OFFSET 0").all();const total = db.prepare("SELECT COUNT(*) as c FROM users").get().c;const cols = rows.length > 0 ? Object.keys(rows[0]) : [];db.close();console.log(JSON.stringify({rows,columns:cols,total}))'
RESULT=$(curl -s --max-time 10 "$AGENT/exec" -X POST -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'command': 'node -e ' + json.dumps('''$ROWS_SCRIPT'''), 'cwd': '/home/coder/project', 'timeout': 10000}))")")
echo "  Result: $RESULT"

# 5. Get schema
echo ""
echo "5. Getting schema..."
SCHEMA_SCRIPT='const Database = require("better-sqlite3");const db = new Database("test.db",{readonly:true});const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='"'"'table'"'"' AND name NOT LIKE '"'"'sqlite_%'"'"'").all();const schema = tables.map(t => {const columns = db.prepare("PRAGMA table_info(" + t.name + ")").all();const fks = db.prepare("PRAGMA foreign_key_list(" + t.name + ")").all();const count = db.prepare("SELECT COUNT(*) as c FROM " + t.name).get();return {name:t.name,sql:t.sql,columns,foreignKeys:fks,rowCount:count?count.c:0}});db.close();console.log(JSON.stringify(schema))'
RESULT=$(curl -s --max-time 10 "$AGENT/exec" -X POST -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'command': 'node -e ' + json.dumps('''$SCHEMA_SCRIPT'''), 'cwd': '/home/coder/project', 'timeout': 10000}))")")
echo "  Result: $RESULT"

# 6. Execute custom SQL
echo ""
echo "6. Executing custom SQL query..."
SQL_SCRIPT='const Database = require("better-sqlite3");const db = new Database("test.db",{readonly:true});try{const stmt = db.prepare("SELECT u.name, p.title FROM users u JOIN posts p ON u.id = p.user_id");const rows = stmt.all();const columns = rows.length > 0 ? Object.keys(rows[0]) : [];console.log(JSON.stringify({rows,columns,total:rows.length}))}catch(e){console.log(JSON.stringify({error:e.message}))}db.close()'
RESULT=$(curl -s --max-time 10 "$AGENT/exec" -X POST -H "Content-Type: application/json" \
  -d "$(python3 -c "import json; print(json.dumps({'command': 'node -e ' + json.dumps('''$SQL_SCRIPT'''), 'cwd': '/home/coder/project', 'timeout': 10000}))")")
echo "  Result: $RESULT"

echo ""
echo "=== All tests done ==="
