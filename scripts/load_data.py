#!/usr/bin/env python3
"""
Load data into the Abel app's stores, separately from the app.

The app ships with no data. Whatever this script loads is what the app shows; with nothing loaded the
app says "No data yet". Every record becomes one row: (kind, id, user_id, data jsonb).

Files it reads (the record kind comes from --kind, or else from the file or sheet name):
  .csv / .tsv         one record per row. Headers like accounts.current.balance become nested fields,
                      cells holding JSON ({...} or [...]) are parsed, numbers and true/false are converted.
  .json               a list of records, a full snapshot {"users": {...}, "transactions": [...], ...}
                      (the shape the old data/cabinet-db.json used), or raw rows [{"kind", "id", "data"}, ...].
  .jsonl / .ndjson    one record per line.
  .xlsx               one record per row; each sheet named after a kind is loaded as that kind
                      (needs: pip install openpyxl).
  a folder            every file above in it, e.g. seed/demo/.

Kinds: users, cabinetEntries, transactions, messages, accessLog, topicLog, undoRecords, conversations,
earnings, shares, documents, entryHistory, dataRewards (snake_case like cabinet_entries works too).

Examples:
  python scripts/load_data.py seed/demo                       # the fictional demo customers
  python scripts/load_data.py my.csv --kind transactions --user-id lauri
  python scripts/load_data.py seed/demo --only-user lauri      # bounded load: one demo customer only
  python scripts/load_data.py seed/demo --clear               # delete everything first, then load
  ... --clear --only-user lauri                              # delete only lauri first, not everyone
  python scripts/load_data.py --clear                         # just delete everything
  python scripts/load_data.py seed/demo --dry-run             # show what would be loaded

The default hosted target needs the three per-agent role URLs - USER_DB_URL, CM_DB_URL and
NORDEA_DB_URL (run supabase/three-agents.sql once in Supabase -> SQL Editor, one plain password
per role) - and pushes customer records to agent_user_records / agent_cm_records /
agent_nordea_records, each through its own agent's role, via scripts/load_remote.ts. The load
first hydrates the local databases from the hosted tables, so existing hosted records merge with
the load instead of being replaced by it.
App plumbing (chat transcripts, logs, rewards) goes to the abel_records table when
SUPABASE_URL and SUPABASE_SECRET_KEY are also set (run supabase/setup.sql once for that),
and into the agent databases' app_* namespaces otherwise (pushed hosted with the customer).
All variables are read from the environment, .env or .env.local.
Use --target file to skip Supabase entirely: everything stays in the local agent databases
(data/arch/*.db); a fresh load never creates data/cabinet-db.json.
Afterwards it asks the running app to read the data again (POST /api/admin/reload), so no restart is needed.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE = "abel_records"
# Honour CABINET_DATA_DIR like the server does, so a scratch/test data dir can be loaded (G9).
DATA_DIR = Path(os.environ["CABINET_DATA_DIR"]).resolve() if os.environ.get("CABINET_DATA_DIR") else ROOT / "data"

KINDS = [
    "users", "cabinetEntries", "transactions", "messages", "accessLog", "topicLog", "undoRecords",
    "conversations", "earnings", "shares", "documents", "entryHistory", "dataRewards",
    "balanceSnapshots", "importBatches", "bankAccounts",
]
# Customer data lives in the three agent databases (G1); the old store keeps only app plumbing.
CUSTOMER_KINDS = {"users", "cabinetEntries", "transactions", "undoRecords", "shares", "documents",
                  "entryHistory", "balanceSnapshots", "importBatches", "bankAccounts"}
PLUMBING_KINDS = ["messages", "accessLog", "topicLog", "conversations", "earnings", "dataRewards"]
# "cabinet_entries", "CabinetEntries", "cabinet-entries" -> "cabinetEntries"
_KIND_BY_KEY = {re.sub(r"[^a-z]", "", k.lower()): k for k in KINDS}

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

# Fields the app expects. Filled in only when the loaded record leaves them out, so a small CSV still works.
DEFAULTS: dict[str, dict] = {
    "users": {
        "age": 0,
        "roleDescription": "",
        "viewMode": "full",
        "layoutPrefs": {"widgetsOrder": ["quickActions", "goals", "accounts", "insights", "cabinet"], "hiddenWidgets": []},
        "accounts": {"current": {"iban": "", "balance": 0}, "savings": {"iban": "", "balance": 0, "monthlyDeposit": 0}},
        "points": 0,
    },
    "cabinetEntries": {
        "type": "fact", "detail": "", "source": "customer", "status": "active", "private": False,
        "readableBy": {"abel": True, "offers": False}, "provenance": {"channel": "app"}, "reviewed": True,
        "createdAt": NOW, "updatedAt": NOW,
    },
    "transactions": {"category": "other", "account": "current"},
    "messages": {"agentId": "abel", "channel": "app", "sender": "agent", "createdAt": NOW},
}


def norm_kind(name: str) -> str | None:
    return _KIND_BY_KEY.get(re.sub(r"[^a-z]", "", name.lower()))


def key_of(kind: str, rec: dict) -> str | None:
    v = rec.get("undoToken" if kind == "undoRecords" else "id")
    return None if v in (None, "") else str(v)


# ---------------------------------------------------------------- reading files

def camel(name: str) -> str:
    """user_id -> userId, created_at -> createdAt. Names without '_' stay as they are."""
    head, *rest = name.split("_")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


_NUM = re.compile(r"^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$")


def cell(v):
    """A text cell as the value it means: number, true/false, JSON, or the text itself. Empty -> None."""
    if v is None:
        return None
    if not isinstance(v, str):
        return v  # Excel already gives numbers, booleans and dates
    s = v.strip()
    if s == "":
        return None
    low = s.lower()
    if low in ("true", "false"):
        return low == "true"
    if low == "null":
        return None
    if _NUM.match(s):
        return float(s) if any(c in s for c in ".eE") else int(s)
    if s[0] in "{[":
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            pass
    return s


def from_table(headers: list, rows, keep_names: bool) -> list[dict]:
    """Flat rows -> records. A header like accounts.current.balance makes a nested field."""
    out = []
    names = [str(h).strip() if h is not None else "" for h in headers]
    for row in rows:
        rec: dict = {}
        for name, raw in zip(names, row):
            if not name:
                continue
            v = cell(raw)
            if v is None:
                continue
            if hasattr(v, "isoformat"):  # Excel dates
                v = v.isoformat()
            parts = [p if keep_names else camel(p) for p in name.split(".")]
            node = rec
            for p in parts[:-1]:
                node = node.setdefault(p, {})
            node[parts[-1]] = v
        if rec:
            out.append(rec)
    return out


def read_csv(path: Path, keep_names: bool) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        sample = f.read(4096)
        f.seek(0)
        delim = "\t" if path.suffix.lower() == ".tsv" else ","
        if delim == "," and sample:
            try:
                delim = csv.Sniffer().sniff(sample.splitlines()[0], ",;\t").delimiter  # Excel in some locales saves with ;
            except csv.Error:
                pass
        reader = csv.reader(f, delimiter=delim)
        headers = next(reader, [])
        return from_table(headers, reader, keep_names)


def read_xlsx(path: Path, keep_names: bool) -> list[tuple[str | None, list[dict]]]:
    try:
        import openpyxl  # type: ignore
    except ImportError:
        sys.exit("Reading .xlsx needs openpyxl: pip install openpyxl")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheets = []
    for ws in wb.worksheets:
        rows = ws.iter_rows(values_only=True)
        headers = list(next(rows, []))
        sheets.append((norm_kind(ws.title), from_table(headers, rows, keep_names)))
    return sheets


def read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig") as f:
        return [json.loads(line) for line in f if line.strip()]


def read_file(path: Path, kind: str | None, keep_names: bool) -> list[tuple[str, list[dict]]]:
    """Returns (kind, records) groups. Raw rows come back as kind '*' with full row dicts."""
    ext = path.suffix.lower()
    guess = kind or norm_kind(path.stem)

    def need_kind(what: str) -> str:
        if not guess:
            sys.exit(f"{path.name}: can't tell what kind of records {what}. Name the file after a kind "
                     f"(e.g. transactions.csv) or pass --kind. Kinds: {', '.join(KINDS)}")
        return guess

    if ext in (".csv", ".tsv"):
        return [(need_kind("these are"), read_csv(path, keep_names))]
    if ext in (".jsonl", ".ndjson"):
        return [(need_kind("these are"), read_jsonl(path))]
    if ext == ".xlsx":
        groups = []
        for sheet_kind, recs in read_xlsx(path, keep_names):
            groups.append((kind or sheet_kind or need_kind("this sheet holds"), recs))
        return groups
    if ext == ".json":
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        if isinstance(data, list):
            if data and all(isinstance(r, dict) and "kind" in r and "data" in r for r in data):
                return [("*", data)]
            return [(need_kind("these are"), data)]
        if isinstance(data, dict):
            snapshot = {norm_kind(k): v for k, v in data.items() if norm_kind(k)}
            if snapshot and not kind:
                groups = []
                for k, v in snapshot.items():
                    recs = list(v.values()) if isinstance(v, dict) else v  # users are a map in snapshots
                    groups.append((k, recs))
                return groups
            return [(need_kind("this is"), [data])]  # one record
    sys.exit(f"{path.name}: unsupported file type {ext or '(none)'}. Use .csv, .tsv, .json, .jsonl or .xlsx.")


# ---------------------------------------------------------------- records -> rows

def fill(rec: dict, defaults: dict) -> None:
    for k, v in defaults.items():
        if k not in rec:
            rec[k] = json.loads(json.dumps(v))
        elif isinstance(v, dict) and isinstance(rec[k], dict):
            fill(rec[k], v)


def to_rows(kind: str, records: list[dict], user_id: str | None, source: str) -> list[dict]:
    if kind not in KINDS:
        sys.exit(f"Unknown kind {kind!r}. Kinds: {', '.join(KINDS)}")
    rows = []
    for i, rec in enumerate(records):
        if not isinstance(rec, dict):
            sys.exit(f"{source}: record {i + 1} is not an object")
        rec = dict(rec)
        if "userId" not in rec and "user_id" in rec:
            rec["userId"] = rec.pop("user_id")
        if kind != "users" and "userId" not in rec:
            if not user_id:
                sys.exit(f"{source}: record {i + 1} has no userId. Add a userId column or pass --user-id.")
            rec["userId"] = user_id
        if kind == "users":
            if "id" not in rec:
                if not user_id:
                    sys.exit(f"{source}: user {i + 1} has no id. Add an id column or pass --user-id.")
                rec["id"] = user_id
            rec.setdefault("name", str(rec["id"]).capitalize())
            rec.setdefault("persona", rec["id"])
        if kind == "transactions":
            missing = [f for f in ("date", "amount") if f not in rec]
            if missing:
                sys.exit(f"{source}: transaction {i + 1} is missing {', '.join(missing)}")
        if kind == "cabinetEntries" and "title" not in rec:
            sys.exit(f"{source}: entry {i + 1} has no title")
        fill(rec, DEFAULTS.get(kind, {}))
        key = key_of(kind, rec)
        if not key:
            # The same record always gets the same id, so loading a file twice doesn't duplicate it.
            digest = hashlib.sha1(json.dumps(rec, sort_keys=True, default=str).encode()).hexdigest()[:12]
            key = f"{kind}-{digest}"
            rec["undoToken" if kind == "undoRecords" else "id"] = key
        uid = rec["id"] if kind == "users" else rec.get("userId")
        rows.append({"kind": kind, "id": key, "user_id": None if uid is None else str(uid), "data": rec})
    return rows


def raw_rows(rows: list[dict], source: str) -> list[dict]:
    out = []
    for r in rows:
        kind = norm_kind(str(r["kind"]))
        if not kind:
            sys.exit(f"{source}: unknown kind {r['kind']!r}")
        out.append({"kind": kind, "id": str(r.get("id") or key_of(kind, r["data"])), "user_id": r.get("user_id"), "data": r["data"]})
    return out


# ---------------------------------------------------------------- Supabase (PostgREST, no extra packages)

def load_env() -> None:
    """Like the app: .env, then .env.local on top. Variables already set in the shell win."""
    found: dict[str, str] = {}
    for name in (".env", ".env.local"):
        p = ROOT / name
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8-sig").splitlines():
            m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
            if not m or line.lstrip().startswith("#"):
                continue
            v = m.group(2)
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1]
            else:
                v = re.sub(r"\s+#.*$", "", v)
            found[m.group(1)] = v
    for k, v in found.items():
        os.environ.setdefault(k, v)


class Supabase:
    def __init__(self) -> None:
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        if not self.url or not self.key:
            sys.exit("SUPABASE_URL and SUPABASE_SECRET_KEY are not set (environment, .env or .env.local). "
                     "Or use --target file to keep everything in the local agent databases.")

    def _call(self, method: str, query: str, body=None, prefer: str = "return=minimal"):
        headers = {"apikey": self.key, "Content-Type": "application/json", "Prefer": prefer}
        if self.key.startswith("eyJ"):  # older JWT keys also go in Authorization; new sb_secret_ keys only in apikey
            headers["Authorization"] = f"Bearer {self.key}"
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(f"{self.url}/rest/v1/{TABLE}?{query}", data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.read()
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:400]
            if "PGRST205" in msg or "does not exist" in msg:
                sys.exit(f'The table "{TABLE}" is missing. Run supabase/setup.sql once in Supabase -> SQL Editor.')
            sys.exit(f"Supabase said {e.code}: {msg}")
        except urllib.error.URLError as e:
            sys.exit(f"Could not reach Supabase at {self.url}: {e.reason}")

    def upsert(self, rows: list[dict]) -> None:
        for i in range(0, len(rows), 500):
            batch = [{**r, "updated_at": NOW} for r in rows[i:i + 500]]
            self._call("POST", "on_conflict=kind,id", batch, "resolution=merge-duplicates,return=minimal")

    def delete(self, kind: str | None = None, user_id: str | None = None) -> None:
        q = {"kind": f"eq.{kind}" if kind else "neq."}  # PostgREST needs some filter; every row has a kind
        if user_id:
            q["user_id"] = f"eq.{user_id}"
        self._call("DELETE", urllib.parse.urlencode(q))


# ---------------------------------------------------------------- local file (no Supabase)

ARCH_DIR = DATA_DIR / "arch"

_SCHEMAS = {
    "user": """CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL, doc TEXT);
      CREATE TABLE IF NOT EXISTS personal_facts (id TEXT PRIMARY KEY, source TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL, via_airlock_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_conversations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_messages (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_topic_log (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);""",
    "cm": """CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, goal_ids TEXT NOT NULL,
        proposed_by TEXT NOT NULL, via_message_id TEXT, evidence TEXT, status TEXT NOT NULL,
        dispute_reason TEXT, created_at TEXT NOT NULL, observed TEXT, risk TEXT, auto_accepted INTEGER, doc TEXT);
      CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS undo (token TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_access_log (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_migration_ledger (kind TEXT PRIMARY KEY, source_hash TEXT NOT NULL, rows INTEGER NOT NULL, done_at TEXT NOT NULL);""",
    "nordea": """CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, date TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL,
        account TEXT NOT NULL, description TEXT, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE TABLE IF NOT EXISTS balance_snapshots (id TEXT PRIMARY KEY, account_key TEXT NOT NULL, at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS import_batches (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_earnings (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_data_rewards (id TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_rewards (user_id TEXT PRIMARY KEY, json TEXT NOT NULL);""",
}


# D12: the same customer-id rule as src/server/customerId.ts (lowercase letters, digits, _ and -).
# A non-canonical id is refused before anything is written; it is never rewritten to another id.
_CANONICAL_UID = re.compile(r"[a-z0-9_-]+")


def _check_uid(uid) -> str:
    if not isinstance(uid, str) or not _CANONICAL_UID.fullmatch(uid):
        sys.exit(f"Unsupported customer id {uid!r}: use lowercase letters, digits, '_' or '-' only. Nothing was written.")
    return uid


def _canonical_only(uids: list[str]) -> list[str]:
    """Ids from the stored index that are not canonical are left exactly as they are (never touched, never renamed)."""
    keep = [u for u in uids if isinstance(u, str) and _CANONICAL_UID.fullmatch(u)]
    for u in uids:
        if u not in keep:
            print(f"Skipping unsupported customer id {u!r} in the stored index: left unchanged.")
    return keep


def _db_file(uid: str, which: str) -> Path:
    return ARCH_DIR / f"{_check_uid(uid)}.{which}.db"


# G21: the same column migrations the app applies (userStore.ts / cmStore.ts) - a database file
# left by an older version must load without crashing. (table, column, ddl)
_MIGRATIONS = {
    "user": [("goals", "doc", "doc TEXT")],
    "cm": [("entries", "observed", "observed TEXT"), ("entries", "risk", "risk TEXT"),
           ("entries", "auto_accepted", "auto_accepted INTEGER"), ("entries", "doc", "doc TEXT")],
    "nordea": [],
}


def _open_db(uid: str, which: str) -> sqlite3.Connection:
    ARCH_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(_db_file(uid, which))
    con.executescript(_SCHEMAS[which])
    for table, col, ddl in _MIGRATIONS[which]:
        cols = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
        if col not in cols:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")
    return con


def _kv_set(con: sqlite3.Connection, k: str, v) -> None:
    con.execute("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
                (k, json.dumps(v, ensure_ascii=False)))


def _index_read() -> list[str]:
    f = ARCH_DIR / "customers.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []


def _index_write(uids: list[str]) -> None:
    ARCH_DIR.mkdir(parents=True, exist_ok=True)
    (ARCH_DIR / "customers.json").write_text(json.dumps(sorted(set(uids)), indent=2), encoding="utf-8")


def _register(uid: str) -> None:
    _index_write(_index_read() + [uid])


# Plumbing kind -> (agent database, app table, timestamp field of the record).
PLUMBING_TARGET = {
    "messages": ("user", "app_messages", "created_at", "createdAt"),
    "conversations": ("user", "app_conversations", "created_at", "createdAt"),
    "topicLog": ("user", "app_topic_log", "at", "timestamp"),
    "accessLog": ("cm", "app_access_log", "at", "timestamp"),
    "earnings": ("nordea", "app_earnings", "at", "createdAt"),
    "dataRewards": ("nordea", "app_data_rewards", "at", "at"),
}


class LocalFile:
    """G5: customer records go straight into the three agent databases (one SQLite file per
    customer per database, the same files the app and the arch screens use). G33: app plumbing
    (chat transcripts, logs, conversations, earnings, rewards) goes into the SAME databases'
    app_* namespaces - chat/topicLog in user.db, accessLog in cm.db, earnings/dataRewards/rewards
    in nordea.db, exactly where migrate:legacy and the runtime put them. A fresh load never
    creates data/cabinet-db.json."""

    def __init__(self) -> None:
        pass

    def _upsert_plumbing(self, row: dict) -> None:
        kind, rid, data = row["kind"], row["id"], row["data"]
        uid = str(row.get("user_id") or data.get("userId") or "")
        if not uid:
            sys.exit(f"{kind}.{rid}: no userId - refusing to guess the owner")
        _register(uid)
        which, table, ts_col, ts_field = PLUMBING_TARGET[kind]
        with _open_db(uid, which) as con:
            con.execute(f"INSERT INTO {table} (id, {ts_col}, json) VALUES (?,?,?) "
                        f"ON CONFLICT(id) DO UPDATE SET json=excluded.json",
                        (rid, data.get(ts_field) or NOW, json.dumps(data, ensure_ascii=False)))

    # ---- customer records -> the owning agent's database
    def _upsert_customer(self, row: dict) -> None:
        kind, rid, data = row["kind"], row["id"], row["data"]
        uid = str(row.get("user_id") or rid)
        _register(uid)
        if kind == "users":
            profile = {k: v for k, v in data.items() if k not in ("id", "points", "pointsSpent", "redeemed", "accounts")}
            with _open_db(uid, "user") as con:
                _kv_set(con, "profile", profile)
            if data.get("accounts"):
                with _open_db(uid, "nordea") as con:
                    _kv_set(con, "balances", data["accounts"])
            rewards = {"points": data.get("points", 0),
                       **({"pointsSpent": data["pointsSpent"]} if "pointsSpent" in data else {}),
                       **({"redeemed": data["redeemed"]} if "redeemed" in data else {})}
            with _open_db(uid, "nordea") as con:
                con.execute("INSERT INTO app_rewards (user_id, json) VALUES (?,?) "
                            "ON CONFLICT(user_id) DO UPDATE SET json=excluded.json",
                            (uid, json.dumps(rewards, ensure_ascii=False)))
            return
        if kind == "cabinetEntries":
            if data.get("type") == "goal":
                with _open_db(uid, "user") as con:
                    con.execute("INSERT INTO goals (id, title, detail, created_at, doc) VALUES (?,?,?,?,?) "
                                "ON CONFLICT(id) DO UPDATE SET title=excluded.title, detail=excluded.detail, doc=excluded.doc",
                                (rid, data.get("title", ""), data.get("detail", ""), data.get("createdAt", NOW),
                                 json.dumps(data, ensure_ascii=False)))
            else:
                ev = data.get("evidence")
                evidence = json.dumps({"transactionIds": ev.get("transactionIds"),
                                       "transactionIdsHash": ev.get("inputsHash")}, ensure_ascii=False) if ev else None
                with _open_db(uid, "cm") as con:
                    con.execute("INSERT INTO entries (id, title, detail, goal_ids, proposed_by, via_message_id, evidence, "
                                "status, dispute_reason, created_at, observed, risk, auto_accepted, doc) "
                                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                                "ON CONFLICT(id) DO UPDATE SET title=excluded.title, detail=excluded.detail, "
                                "status=excluded.status, doc=excluded.doc",
                                (rid, data.get("title", ""), data.get("detail", ""), "[]",
                                 "nordea" if data.get("source") == "nordea" else "user", None, evidence,
                                 data.get("status", "active"), None, data.get("createdAt", NOW), None, None, None,
                                 json.dumps(data, ensure_ascii=False)))
            return
        if kind == "transactions":
            with _open_db(uid, "nordea") as con:
                con.execute("INSERT INTO transactions (id, date, category, amount, account, description, json) "
                            "VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date, "
                            "category=excluded.category, amount=excluded.amount, account=excluded.account, "
                            "description=excluded.description, json=excluded.json",
                            (rid, data.get("date", ""), data.get("category", "other"), data.get("amount", 0),
                             data.get("account", "current"), data.get("description"), json.dumps(data, ensure_ascii=False)))
            return
        if kind == "entryHistory":
            with _open_db(uid, "cm") as con:
                con.execute("INSERT INTO history (id, entry_id, at, json) VALUES (?,?,?,?) "
                            "ON CONFLICT(id) DO UPDATE SET json=excluded.json",
                            (rid, data.get("entryId", ""), data.get("at", NOW), json.dumps(data, ensure_ascii=False)))
            return
        if kind == "shares":
            with _open_db(uid, "cm") as con:
                con.execute("INSERT INTO shares (id, json) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
                            (rid, json.dumps(data, ensure_ascii=False)))
            return
        if kind == "undoRecords":
            token = data.get("undoToken") or rid
            with _open_db(uid, "cm") as con:
                con.execute("INSERT INTO undo (token, at, json) VALUES (?,?,?) ON CONFLICT(token) DO UPDATE SET json=excluded.json",
                            (token, data.get("at", NOW), json.dumps(data, ensure_ascii=False)))
            return
        if kind == "documents":
            with _open_db(uid, "user") as con:
                con.execute("INSERT INTO documents (id, json) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
                            (rid, json.dumps(data, ensure_ascii=False)))
            return
        if kind == "bankAccounts":
            with _open_db(uid, "nordea") as con:
                con.execute("INSERT INTO accounts (id, json) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
                            (rid, json.dumps(data, ensure_ascii=False)))
            return
        if kind == "balanceSnapshots":
            with _open_db(uid, "nordea") as con:
                con.execute("INSERT INTO balance_snapshots (id, account_key, at, json) VALUES (?,?,?,?) "
                            "ON CONFLICT(id) DO UPDATE SET json=excluded.json",
                            (rid, data.get("accountKey", ""), data.get("at", NOW), json.dumps(data, ensure_ascii=False)))
            return
        if kind == "importBatches":
            with _open_db(uid, "nordea") as con:
                con.execute("INSERT INTO import_batches (id, at, json) VALUES (?,?,?) "
                            "ON CONFLICT(id) DO UPDATE SET json=excluded.json",
                            (rid, data.get("at", NOW), json.dumps(data, ensure_ascii=False)))
            return
        sys.exit(f"internal: {kind} is not a customer kind")

    def upsert(self, rows: list[dict]) -> None:
        for r in rows:  # validate every id first: a bad id must not leave a half-loaded dataset behind
            if r["kind"] in CUSTOMER_KINDS:
                _check_uid(str(r.get("user_id") or r["id"]))
        for r in rows:
            if r["kind"] in CUSTOMER_KINDS:
                self._upsert_customer(r)
                continue
            self._upsert_plumbing(r)

    # ---- deletes
    def _delete_customer(self, kind: str, user_id: str | None) -> None:
        uids = [_check_uid(user_id)] if user_id else _canonical_only(_index_read())
        for uid in uids:
            if kind == "users":
                for which, table in (("user", "kv"), ("nordea", "kv")):
                    f = _db_file(uid, which)
                    if f.exists():
                        with sqlite3.connect(f) as con:
                            con.execute("DELETE FROM kv WHERE k IN ('profile', 'balances')")
                f = _db_file(uid, "nordea")
                if f.exists():
                    with sqlite3.connect(f) as con:
                        con.execute("DELETE FROM app_rewards WHERE user_id = ?", (uid,))
                continue
            table_by_kind = {"cabinetEntries": None, "transactions": ("nordea", "transactions"),
                             "entryHistory": ("cm", "history"), "shares": ("cm", "shares"), "undoRecords": ("cm", "undo"),
                             "documents": ("user", "documents"), "bankAccounts": ("nordea", "accounts"),
                             "balanceSnapshots": ("nordea", "balance_snapshots"), "importBatches": ("nordea", "import_batches")}
            if kind == "cabinetEntries":
                for which, table, col in (("user", "goals", "doc"), ("cm", "entries", "doc")):
                    f = _db_file(uid, which)
                    if f.exists():
                        with sqlite3.connect(f) as con:
                            con.execute(f"DELETE FROM {table} WHERE json_extract({col}, '$.userId') = ?", (uid,))
                continue
            target = table_by_kind.get(kind)
            if target:
                which, table = target
                f = _db_file(uid, which)
                if f.exists():
                    with sqlite3.connect(f) as con:
                        con.execute(f"DELETE FROM {table} WHERE json_extract(json, '$.userId') = ?", (uid,))

    def _prune(self, uid: str) -> None:
        """Drop a customer from the index (and the empty files) once nothing of them is left."""
        empty = True
        for which in ("user", "cm", "nordea"):
            f = _db_file(uid, which)
            if not f.exists():
                continue
            with sqlite3.connect(f) as con:
                for table in ("kv", "goals", "personal_facts", "documents", "entries", "history", "shares",
                              "undo", "accounts", "transactions", "balance_snapshots", "import_batches",
                              "app_conversations", "app_messages", "app_topic_log", "app_access_log",
                              "app_earnings", "app_data_rewards", "app_rewards"):
                    try:
                        if con.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone():
                            empty = False
                    except sqlite3.OperationalError:
                        pass
        if empty:
            for which in ("user", "cm", "nordea"):
                _db_file(uid, which).unlink(missing_ok=True)
            _index_write([u for u in _index_read() if u != uid])

    def delete(self, kind: str | None = None, user_id: str | None = None) -> None:
        kinds = [kind] if kind else list(CUSTOMER_KINDS) + PLUMBING_KINDS
        for k in kinds:
            if k in CUSTOMER_KINDS:
                self._delete_customer(k, user_id)
            else:
                which, table = PLUMBING_TARGET[k][0], PLUMBING_TARGET[k][1]
                for uid in ([user_id] if user_id else _index_read()):
                    f = _db_file(uid, which)
                    if not f.exists():
                        continue
                    with sqlite3.connect(f) as con:
                        if user_id:
                            con.execute(f"DELETE FROM {table} WHERE json_extract(json, '$.userId') = ?", (uid,))
                        else:
                            con.execute(f"DELETE FROM {table}")
        if not kind and not user_id:  # --clear: wipe the three databases and the index too
            for f in ARCH_DIR.glob("*.db"):
                f.unlink()
            (ARCH_DIR / "customers.json").unlink(missing_ok=True)
        for uid in ([user_id] if user_id else list(_index_read())):
            if uid:
                self._prune(uid)
        self.save()

    def save(self) -> None:
        # G33: no JSON file - every write above already landed in the agent databases.
        return


# ---------------------------------------------------------------- hosted (G6/G20)

def run_remote(*args: str) -> None:
    """Push or clear the hosted agent tables via the Node helper (pg driver lives there)."""
    cmd = ["npx", "tsx", "scripts/load_remote.ts", *args]
    if os.name == "nt":  # npx is npx.cmd on Windows
        cmd = ["cmd", "/c", *cmd]
    try:
        subprocess.run(cmd, cwd=ROOT, check=True)
    except FileNotFoundError:
        sys.exit("npx was not found - install Node.js (the hosted push runs scripts/load_remote.ts).")
    except subprocess.CalledProcessError:
        # G24: never blanket-blame the role URLs - the helper already printed the exact
        # failing store and customer above (e.g. "push alex -> agent_cm_records failed: ...").
        sys.exit("Hosted sync failed - the lines above name the exact store and customer that "
                 "failed. Suspect the role URLs (USER_DB_URL, CM_DB_URL, NORDEA_DB_URL) only when "
                 "the failure says a table is missing or permission was denied. "
                 "--target file does a local-only load.")


class Hosted(LocalFile):
    """G20: the default hosted target. Customer records are written to the local agent
    databases (the same files as --target file) and then pushed to the hosted tables
    agent_user_records / agent_cm_records / agent_nordea_records - each through its OWN
    agent's role URL (USER_DB_URL, CM_DB_URL, NORDEA_DB_URL; see supabase/three-agents.sql).
    App plumbing goes to the abel_records table when SUPABASE_URL and SUPABASE_SECRET_KEY
    are set, and into the local agent databases' app_* namespaces otherwise (pushed hosted
    with the affected customers). No path writes data/cabinet-db.json."""

    def __init__(self) -> None:
        # G20 (merge, Bill 15:14): pull the hosted rows into the local agent databases FIRST,
        # so the load merges with them - a load must never drop hosted rows silently.
        run_remote("hydrate")
        super().__init__()
        has_sb = os.environ.get("SUPABASE_URL") and \
            (os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
        self.plumbing: Supabase | None = Supabase() if has_sb else None

    @staticmethod
    def _uids(rows: list[dict]) -> list[str]:
        return sorted({str(r.get("user_id") or r["id"]) for r in rows if r["kind"] in CUSTOMER_KINDS})

    def upsert(self, rows: list[dict]) -> None:
        cust = [r for r in rows if r["kind"] in CUSTOMER_KINDS]
        plumb = [r for r in rows if r["kind"] not in CUSTOMER_KINDS]
        for r in cust:  # D12: refuse a non-canonical id before ANY local or hosted write
            _check_uid(str(r.get("user_id") or r["id"]))
        if cust:
            super().upsert(cust)
            run_remote("push", *self._uids(cust))
        if plumb:
            if self.plumbing:
                self.plumbing.upsert(plumb)
            else:
                # G33: plumbing lives in the local agent databases' app_* namespaces; push the
                # affected customers so the hosted tables carry the same rows.
                super().upsert(plumb)
                uids = sorted({str(r.get("user_id") or r["data"].get("userId")) for r in plumb})
                run_remote("push", *uids)

    def delete(self, kind: str | None = None, user_id: str | None = None) -> None:
        if kind is None and user_id is None:  # --clear: local, plumbing and every hosted row
            super().delete()
            if self.plumbing:
                self.plumbing.delete()
            run_remote("clear", "--all")  # the loader's --clear IS the explicit confirmation
            return
        uids = [_check_uid(user_id)] if user_id else _canonical_only(_index_read())
        if kind is None:
            # G36 hosted leg: a whole-customer delete is an explicit clear, and it goes FIRST:
            # the local delete prunes the customer's files, so a push afterwards would be refused
            # by the G24 missing-file guard - leaving local data deleted but hosted rows kept.
            # A failed hosted clear here leaves local and plumbing data untouched.
            if uids:
                run_remote("clear", *uids)
            super().delete(None, user_id)
            if self.plumbing:
                for k in PLUMBING_KINDS:
                    self.plumbing.delete(k, user_id)
            return
        super().delete(kind, user_id)
        if self.plumbing and kind in PLUMBING_KINDS:
            self.plumbing.delete(kind, user_id)
        for u in uids:
            files_gone = not any(_db_file(u, w).exists() for w in ("user", "cm", "nordea"))
            if files_gone:
                # G36: the delete emptied the customer and the prune removed its files - a push
                # would be refused by the G24 missing-file guard, so the explicit clear is
                # authoritative. This also catches a plumbing-kind delete landing last.
                run_remote("clear", u)
            elif kind in CUSTOMER_KINDS:
                # The push serializes the reduced local files (drops the deleted rows hosted).
                run_remote("push", u)


def tell_app(app_url: str) -> None:
    req = urllib.request.Request(f"{app_url.rstrip('/')}/api/admin/reload", data=b"{}", method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            info = json.loads(res.read() or b"{}")
            print(f"The app at {app_url} read the data again ({info.get('users', '?')} customers).")
    except Exception:
        print(f"The app at {app_url} isn't running or didn't answer. It reads the data when it starts "
              f"(or press 'Check again' in the app).")


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description="Load CSV / JSON / JSONL / Excel data into the Abel app's Supabase table.",
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__.split("Examples:")[1])
    ap.add_argument("paths", nargs="*", help="files or folders to load")
    ap.add_argument("--kind", help="record kind for every file (default: from the file or sheet name)")
    ap.add_argument("--user-id", help="customer id for records without a userId column")
    ap.add_argument("--only-user", action="append", default=[], metavar="UID",
                    help="load only these customers (repeat or comma-separate); records of every "
                         "other customer are skipped, and hosted pushes stay bounded to them")
    ap.add_argument("--clear", action="store_true", help="delete ALL data first (alone: only delete)")
    ap.add_argument("--replace", action="store_true",
                    help="delete the existing records of the kinds being loaded first (only that customer's with --user-id)")
    ap.add_argument("--keep-names", action="store_true", help="keep column names as they are (no user_id -> userId)")
    ap.add_argument("--target", choices=["supabase", "file"], default="supabase",
                    help="supabase (default) = the hosted agent tables via the per-agent role URLs, or file = local data/arch/*.db only")
    ap.add_argument("--app-url", default="http://localhost:3000", help="running app to tell about the new data")
    ap.add_argument("--no-reload", action="store_true", help="don't tell the running app")
    ap.add_argument("--dry-run", action="store_true", help="read and check the files, show what would happen, change nothing")
    args = ap.parse_args()

    if not args.paths and not args.clear:
        ap.error("give a file or folder to load, or --clear")
    if args.kind and not norm_kind(args.kind):
        ap.error(f"unknown kind {args.kind!r}. Kinds: {', '.join(KINDS)}")
    kind = norm_kind(args.kind) if args.kind else None

    files: list[Path] = []
    for p in map(Path, args.paths):
        if p.is_dir():
            files += sorted(f for f in p.iterdir() if f.suffix.lower() in (".csv", ".tsv", ".json", ".jsonl", ".ndjson", ".xlsx"))
        elif p.exists():
            files.append(p)
        else:
            sys.exit(f"Not found: {p}")

    rows: list[dict] = []
    for f in files:
        for k, recs in read_file(f, kind, args.keep_names):
            got = raw_rows(recs, f.name) if k == "*" else to_rows(k, recs, args.user_id, f.name)
            print(f"  {f.name}: {len(got)} {k if k != '*' else 'rows'}")
            rows += got

    # Later files win when the same record appears twice.
    rows = list({(r["kind"], r["id"]): r for r in rows}.values())

    # G32 closing: --only-user bounds the load (and any hosted push) to the named customers,
    # so a second-load merge check can run against one demo customer instead of every store.
    only = {u.strip() for arg in args.only_user for u in arg.split(",") if u.strip()}
    if only:
        rows = [r for r in rows if r["user_id"] in only]
        if not rows and not args.clear:
            sys.exit(f"Nothing to load for {', '.join(sorted(only))} in the given files.")
    by_kind: dict[str, int] = {}
    for r in rows:
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1

    where = ("the three agent databases (data/arch/*.db)" if args.target == "file" else
             "the hosted agent tables (agent_user/cm/nordea_records)"
             + (" + abel_records plumbing" if os.environ.get("SUPABASE_URL") else ""))
    if args.dry_run:
        if args.clear:
            print(f"Would delete all data{f' of {chr(44).join(sorted(only))}' if only else ''} in {where}.")
        elif args.replace:
            _scope = sorted(only) if only else ([args.user_id] if args.user_id else [])
            print(f"Would first delete existing {', '.join(by_kind)}"
                  f"{f' of {chr(44).join(_scope)}' if _scope else ''}.")
        print(f"Would load {len(rows)} records into {where}: " + ", ".join(f"{n} {k}" for k, n in by_kind.items()))
        if rows and "users" not in by_kind:
            print("Note: no users in this load. The app shows customers only for ids that exist as users.")
        return

    load_env()
    store = LocalFile() if args.target == "file" else Hosted()
    if args.clear:
        if only:
            # G36: --only-user scopes the clear too - never wipe other customers' stores.
            for u in sorted(only):
                store.delete(None, u)
            print(f"Deleted all data of {', '.join(sorted(only))} in {where}.")
        else:
            store.delete()
            print(f"Deleted all data in {where}.")
    elif args.replace:
        scope = sorted(only) if only else [args.user_id]
        for u in scope:
            for k in by_kind:
                store.delete(k, u)
        print(f"Deleted existing {', '.join(by_kind)}"
              f"{f' of {chr(44).join(scope)}' if any(scope) else ''}.")
    if rows:
        store.upsert(rows)
        print(f"Loaded {len(rows)} records into {where}: " + ", ".join(f"{n} {k}" for k, n in by_kind.items()))
        if "users" not in by_kind:
            print("Note: no users in this load. The app shows customers only for ids that exist as users.")
    if not args.no_reload:
        tell_app(args.app_url)


if __name__ == "__main__":
    main()
