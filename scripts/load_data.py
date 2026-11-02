#!/usr/bin/env python3
"""
Load data into the Abel app's Supabase table (abel_records), separately from the app.

The app ships with no data. Whatever this script loads is what the app shows; with nothing loaded the
app says "No data yet". Every record becomes one row: (kind, id, user_id, data jsonb).

Files it reads (the record kind comes from --kind, or else from the file or sheet name):
  .csv / .tsv         one record per row. Headers like accounts.current.balance become nested fields,
                      cells holding JSON ({...} or [...]) are parsed, numbers and true/false are converted.
  .json               a list of records, a full snapshot {"users": {...}, "transactions": [...], ...}
                      (the shape of data/cabinet-db.json), or raw rows [{"kind", "id", "data"}, ...].
  .jsonl / .ndjson    one record per line.
  .xlsx               one record per row; each sheet named after a kind is loaded as that kind
                      (needs: pip install openpyxl).
  a folder            every file above in it, e.g. seed/demo/.

Kinds: users, cabinetEntries, transactions, messages, accessLog, topicLog, undoRecords, conversations,
earnings, shares, documents, entryHistory, dataRewards (snake_case like cabinet_entries works too).

Examples:
  python scripts/load_data.py seed/demo                       # the fictional demo customers
  python scripts/load_data.py my.csv --kind transactions --user-id lauri
  python scripts/load_data.py seed/demo --clear               # delete everything first, then load
  python scripts/load_data.py --clear                         # just delete everything
  python scripts/load_data.py seed/demo --dry-run             # show what would be loaded

Needs SUPABASE_URL and SUPABASE_SECRET_KEY (read from the environment, .env or .env.local), and
supabase/setup.sql run once. Without Supabase use --target file to write data/cabinet-db.json instead.
Afterwards it asks the running app to read the data again (POST /api/admin/reload), so no restart is needed.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE = "abel_records"
LOCAL_FILE = ROOT / "data" / "cabinet-db.json"

KINDS = [
    "users", "cabinetEntries", "transactions", "messages", "accessLog", "topicLog", "undoRecords",
    "conversations", "earnings", "shares", "documents", "entryHistory", "dataRewards",
]
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
                     "Or use --target file to write data/cabinet-db.json.")

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

class LocalFile:
    def __init__(self) -> None:
        self.state = json.loads(LOCAL_FILE.read_text(encoding="utf-8")) if LOCAL_FILE.exists() else {}
        self.state.setdefault("users", {})
        for k in KINDS[1:]:
            self.state.setdefault(k, [])

    def upsert(self, rows: list[dict]) -> None:
        for r in rows:
            if r["kind"] == "users":
                self.state["users"][r["id"]] = r["data"]
                continue
            lst = self.state[r["kind"]]
            at = next((i for i, x in enumerate(lst) if key_of(r["kind"], x) == r["id"]), None)
            if at is None:
                lst.append(r["data"])
            else:
                lst[at] = r["data"]
        self.save()

    def delete(self, kind: str | None = None, user_id: str | None = None) -> None:
        for k in ([kind] if kind else KINDS):
            if k == "users":
                self.state["users"] = {i: u for i, u in self.state["users"].items() if user_id and i != user_id}
            else:
                self.state[k] = [x for x in self.state[k] if user_id and x.get("userId") != user_id]
        self.save()

    def save(self) -> None:
        LOCAL_FILE.parent.mkdir(parents=True, exist_ok=True)
        LOCAL_FILE.write_text(json.dumps(self.state, indent=2, ensure_ascii=False), encoding="utf-8")


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
    ap.add_argument("--clear", action="store_true", help="delete ALL data first (alone: only delete)")
    ap.add_argument("--replace", action="store_true",
                    help="delete the existing records of the kinds being loaded first (only that customer's with --user-id)")
    ap.add_argument("--keep-names", action="store_true", help="keep column names as they are (no user_id -> userId)")
    ap.add_argument("--target", choices=["supabase", "file"], default="supabase",
                    help="supabase (default) or file = data/cabinet-db.json for running without Supabase")
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
    by_kind: dict[str, int] = {}
    for r in rows:
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1

    where = "data/cabinet-db.json" if args.target == "file" else f"Supabase table {TABLE}"
    if args.dry_run:
        if args.clear:
            print(f"Would delete all data in {where}.")
        elif args.replace:
            print(f"Would first delete existing {', '.join(by_kind)}{f' of {args.user_id}' if args.user_id else ''}.")
        print(f"Would load {len(rows)} records into {where}: " + ", ".join(f"{n} {k}" for k, n in by_kind.items()))
        if rows and "users" not in by_kind:
            print("Note: no users in this load. The app shows customers only for ids that exist as users.")
        return

    load_env()
    store = LocalFile() if args.target == "file" else Supabase()
    if args.clear:
        store.delete()
        print(f"Deleted all data in {where}.")
    elif args.replace:
        for k in by_kind:
            store.delete(k, args.user_id)
        print(f"Deleted existing {', '.join(by_kind)}{f' of {args.user_id}' if args.user_id else ''}.")
    if rows:
        store.upsert(rows)
        print(f"Loaded {len(rows)} records into {where}: " + ", ".join(f"{n} {k}" for k, n in by_kind.items()))
        if "users" not in by_kind:
            print("Note: no users in this load. The app shows customers only for ids that exist as users.")
    if not args.no_reload:
        tell_app(args.app_url)


if __name__ == "__main__":
    main()
