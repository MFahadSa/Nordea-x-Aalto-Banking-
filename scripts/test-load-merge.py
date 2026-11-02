#!/usr/bin/env python3
"""G32 closing, bounded second-load route (Telkomsel 2026-11-02): prove that repeating a load
merges instead of replacing, and that --only-user bounds a load to the named customers.

Runs the real loader (scripts/load_data.py) against a scratch CABINET_DATA_DIR with
--target file, so the test never touches hosted tables:
  1. load seed/demo twice -> the second load changes nothing (idempotent, no duplicates)
  2. inject extra rows, load again -> the extra rows survive (a merge never drops rows)
  3. --only-user eeva on a fresh store -> only eeva's databases exist
Exits 1 on the first failed check. Run: node scripts/run_python.mjs scripts/test-load-merge.py
(or python3 scripts/test-load-merge.py)."""
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOADER = ROOT / "scripts" / "load_data.py"
SEED = ROOT / "seed" / "demo"


def load(data_dir: Path, *extra: str) -> None:
    env = dict(os.environ, CABINET_DATA_DIR=str(data_dir))
    res = subprocess.run([sys.executable, str(LOADER), str(SEED), "--target", "file", "--no-reload", *extra],
                         cwd=ROOT, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit(f"FAIL: loader exited {res.returncode}\n{res.stdout}\n{res.stderr}")


def dump(data_dir: Path) -> dict:
    """Logical content of every agent database: {file: {table: [rows]}}."""
    out = {}
    arch = data_dir / "arch"
    for db in sorted(arch.glob("*.db")):
        tables = {}
        with sqlite3.connect(db) as con:
            names = [r[0] for r in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
            for t in names:
                cols = len(con.execute(f"SELECT * FROM {t} LIMIT 0").description)
                order = ", ".join(f'"{i + 1}"' for i in range(1, cols + 1))
                tables[t] = [tuple(r) for r in con.execute(f"SELECT * FROM {t} ORDER BY {order}")]
        out[db.name] = tables
    index = arch / "customers.json"
    out["customers.json"] = json.loads(index.read_text()) if index.exists() else []
    return out


def fail(msg: str) -> None:
    sys.exit(f"FAIL: {msg}")


with tempfile.TemporaryDirectory(prefix="load-merge-") as tmp:
    scratch = Path(tmp)

    # 1. A repeated load is idempotent: loading the same seed twice changes nothing.
    first = scratch / "run1"
    load(first)
    snap1 = dump(first)
    load(first)
    snap2 = dump(first)
    if snap1 != snap2:
        diff = [k for k in snap1 if snap1[k] != snap2.get(k)]
        fail(f"second identical load changed the store (differing databases: {diff})")
    total = sum(len(rows) for tables in snap1.values() if isinstance(tables, dict) for rows in tables.values())
    print(f"ok 1: second identical load left all {total} rows unchanged (idempotent)")

    # 2. A repeated load merges: rows it does not know about survive (never silently dropped,
    #    the hosted-load failure mode G20 guards against).
    nordea_db = first / "arch" / "lauri.nordea.db"
    with sqlite3.connect(nordea_db) as con:
        con.execute("INSERT INTO transactions (id, date, category, amount, account, description, json) "
                    "VALUES (?,?,?,?,?,?,?)",
                    ("merge-sentinel-tx", "2026-11-02", "other", 1.0, "current", "merge sentinel",
                     '{"id": "merge-sentinel-tx", "userId": "lauri", "date": "2026-11-02", '
                     '"amount": 1.0, "category": "other", "account": "current"}'))
    user_db = first / "arch" / "lauri.user.db"
    with sqlite3.connect(user_db) as con:
        con.execute("INSERT INTO app_messages (id, created_at, json) VALUES (?,?,?)",
                    ("merge-sentinel-msg", "2026-11-02T00:00:00.000Z",
                     '{"id": "merge-sentinel-msg", "userId": "lauri", "createdAt": '
                     '"2026-11-02T00:00:00.000Z", "sender": "agent", "text": "sentinel"}'))
    load(first)
    snap3 = dump(first)
    for db, table, rid in (("lauri.nordea.db", "transactions", "merge-sentinel-tx"),
                           ("lauri.user.db", "app_messages", "merge-sentinel-msg")):
        if not any(r[0] == rid for r in snap3[db][table]):
            fail(f"repeated load dropped pre-existing row {table}.{rid}")
    for db in snap1:
        if db == "customers.json":
            continue
        for t in snap1[db]:
            before = {r[0] for r in snap1[db][t]}
            after = {r[0] for r in snap3[db][t]}
            if not before <= after:
                fail(f"repeated load lost rows from {db}:{t}: {sorted(before - after)}")
    print("ok 2: repeated load preserved 2 injected rows and every original row (merge)")

    # 3. --only-user bounds a load: only the named customer's databases are created.
    bounded = scratch / "bounded"
    load(bounded, "--only-user", "eeva")
    snap4 = dump(bounded)
    if snap4["customers.json"] != ["eeva"]:
        fail(f"--only-user eeva registered {snap4['customers.json']}, expected ['eeva']")
    others = [name for name in snap4 if name != "customers.json" and not name.startswith("eeva.")]
    if others:
        fail(f"--only-user eeva created other customers' databases: {others}")
    print("ok 3: --only-user eeva loaded only eeva's databases (bounded route)")

print("test-load-merge: all checks passed")
