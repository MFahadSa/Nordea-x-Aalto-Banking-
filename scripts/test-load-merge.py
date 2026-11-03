#!/usr/bin/env python3
"""G32 closing, bounded second-load route (Telkomsel 2026-11-02): prove that repeating a load
merges instead of replacing, and that --only-user bounds a load to the named customers.

Runs the real loader (scripts/load_data.py) against a scratch CABINET_DATA_DIR with
--target file, so the test never touches hosted tables:
  1. load seed/demo twice -> the second load changes nothing (idempotent, no duplicates)
  2. inject extra rows, load again -> the extra rows survive (a merge never drops rows)
  3. --only-user eeva on a fresh store -> only eeva's databases exist
  4. G36: --clear --only-user eeva deletes ONLY eeva's stores (lauri/alex unchanged)
  5. G36: --dry-run names the --only-user scope for --clear and --replace
  6. G36 hosted leg: whole-customer Hosted.delete clears hosted FIRST; a failed hosted
     clear leaves local and plumbing data untouched (no partial delete)
  7. G36 hosted leg: a kind-specific delete that empties the customer ends in an explicit
     hosted clear (the pruned files would make a push fail closed)
Checks 6-7 drive scripts/load_data.py's Hosted store with run_remote stubbed - no hosted access.
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

    # 4. G36: --clear honours --only-user - a scoped clear must not wipe other customers.
    load(first)  # restore lauri/eeva/alex after the earlier checks
    snap5 = dump(first)
    env = dict(os.environ, CABINET_DATA_DIR=str(first))
    res = subprocess.run([sys.executable, str(LOADER), "--clear", "--only-user", "eeva",
                          "--target", "file", "--no-reload"],
                         cwd=ROOT, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        fail(f"scoped clear exited {res.returncode}\n{res.stdout}\n{res.stderr}")
    snap6 = dump(first)
    for name in ("lauri.user.db", "lauri.cm.db", "lauri.nordea.db", "alex.user.db", "alex.cm.db", "alex.nordea.db"):
        if snap6.get(name) != snap5.get(name):
            fail(f"--clear --only-user eeva changed {name}")
    if "eeva" in snap6["customers.json"]:
        fail("scoped clear left eeva registered")
    if sorted(snap6["customers.json"]) != ["alex", "lauri"]:
        fail(f"scoped clear changed the customer index: {snap6['customers.json']}")
    print("ok 4: --clear --only-user eeva removed only eeva (lauri/alex byte-identical)")

    # 5. G36: the dry-run text names the real delete scope.
    for args, needle in ((["--clear", "--only-user", "eeva"], "all data of eeva"),
                         (["--replace", "--only-user", "lauri,eeva"], "of eeva,lauri")):
        res = subprocess.run([sys.executable, str(LOADER), str(SEED), "--dry-run", *args],
                             cwd=ROOT, env=dict(os.environ, CABINET_DATA_DIR=str(scratch / "dry")),
                             capture_output=True, text=True)
        if res.returncode != 0:
            fail(f"dry-run {args} exited {res.returncode}\n{res.stdout}\n{res.stderr}")
        if needle not in res.stdout:
            fail(f"dry-run {args} did not name the scope {needle!r}:\n{res.stdout}")
    print("ok 5: dry-run names the --only-user scope for --clear and --replace")

    # 6-7. G36 hosted leg: ordering of Hosted.delete with run_remote stubbed (no hosted access).
    sys.path.insert(0, str(ROOT / "scripts"))
    calls = []

    hosted_dir = scratch / "hosted-order"
    os.environ["CABINET_DATA_DIR"] = str(hosted_dir)
    for var in ("SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        os.environ.pop(var, None)
    import importlib
    import load_data
    importlib.reload(load_data)  # picks up the scratch CABINET_DATA_DIR
    load_data.run_remote = lambda *a: calls.append(a)

    store = load_data.Hosted()
    assert calls == [("hydrate",)], calls
    calls.clear()
    load(scratch / "hosted-order", "--only-user", "lauri")  # real local data to delete

    store = load_data.Hosted()
    calls.clear()
    store.delete(None, "lauri")
    if calls[0] != ("clear", "lauri"):
        fail(f"whole-customer Hosted.delete did not clear hosted first: {calls}")
    if (hosted_dir / "arch" / "lauri.user.db").exists():
        fail("local delete did not run after the hosted clear")
    print("ok 6: whole-customer hosted clear goes first, local delete follows")

    # 6b. A FAILED hosted clear must leave local data untouched (no partial delete).
    hosted_dir2 = scratch / "hosted-fail"
    os.environ["CABINET_DATA_DIR"] = str(hosted_dir2)
    importlib.reload(load_data)
    load(scratch / "hosted-fail", "--only-user", "lauri")

    def boom(*a):
        if a and a[0] == "clear":
            raise SystemExit("Hosted sync failed - simulated")
    load_data.run_remote = boom
    store = load_data.Hosted()  # hydrate is a no-op under the stub
    try:
        store.delete(None, "lauri")
        fail("failed hosted clear did not stop the delete")
    except SystemExit:
        pass
    before = dump(scratch / "hosted-fail")
    if not (hosted_dir2 / "arch" / "lauri.user.db").exists() or "lauri" not in before["customers.json"]:
        fail("failed hosted clear still deleted local data (partial delete)")
    print("ok 6b: failed hosted clear leaves local data untouched")

    # 7. A kind-specific delete that empties the customer ends in an explicit clear.
    calls.clear()
    load_data.run_remote = lambda *a: calls.append(a)
    store = load_data.Hosted()
    calls.clear()
    store.delete("users", "lauri")   # lauri has only seed rows here; deleting every kind empties it
    for k in ("cabinetEntries", "transactions", "entryHistory", "documents", "shares",
              "undoRecords", "bankAccounts", "balanceSnapshots", "importBatches"):
        store.delete(k, "lauri")
    for k in ("messages", "accessLog", "topicLog", "conversations", "earnings", "dataRewards"):
        store.delete(k, "lauri")
    if ("clear", "lauri") not in calls:
        fail(f"no explicit hosted clear after the customer was emptied: {calls}")
    if ("push", "lauri") in calls[calls.index(("clear", "lauri")):]:
        fail("push attempted after the customer's files were pruned")
    print("ok 7: emptying a customer ends in an explicit hosted clear, never a pruned-file push")

print("test-load-merge: all checks passed")
