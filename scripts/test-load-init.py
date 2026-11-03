"""Functional --init pins (G64, G70/G72): runs load_data.py --init against a fake psql in a temp root.
Pins: the privileged URL never reaches argv; VERSION FIRST (server_version_num is the first query and
an unknown version refuses before anything else); a single read-only all-role preflight runs before
any write or CREATE; roles with effective SET (direct, indirect, or superuser) are skipped; missing
roles are created and granted; a missing-SET role is granted only when the owner is admin-capable
(direct ADMIN OPTION any grantor, or superuser) and otherwise refuses with zero write stream; the
owner-grantor row snapshot is printed for preservation proof; no REVOKE or INHERIT clause is ever
emitted (G69-B default INHERIT; G71 cleanup deferred). Pre-16: the preflight references only MEMBER
and admin_option (no set_option/'SET'), plain GRANT is emitted, and the no-ADMIN refusal still holds.
URLs are written under the app key names, merged into .env.local, only with a known-current password;
output never carries a password."""
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parent.parent
fails = []

def check(name, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else "  " + extra))
    if not cond:
        fails.append(name)

PSQL_TEMPLATE = """#!/bin/sh
echo "$*" >>"$PSQL_QUERIES_LOG"
case "$*" in *secretpw* ) echo 'password in argv' >&2; exit 9;; esac
case "$*" in *server_version_num* ) if [ 'VERSION_RC' = 0 ]; then echo 'VERSION_NUM'; exit 0; else echo 'version denied' >&2; exit 'VERSION_RC'; fi;; esac
case "$*" in *pg_auth_members* ) PREFLIGHT exit PREFLIGHT_RC;; esac
cat >"$PSQL_STDIN_CAPTURE"; echo 'smoke ok'
exit 0
"""

ROLES = ("agent_user", "agent_cm", "agent_nordea")

def pf16(exists="t", can_set="f", admin="t", superuser="f", og_row="t", og_admin="f", og_inherit="t", og_set="f"):
    return [exists, can_set, admin, superuser, og_row, og_admin, og_inherit, og_set]

def pf15(exists="t", member="t", admin="t", superuser="f"):
    return [exists, member, admin, superuser]

def make_root(preflight_rows=None, preflight_rc=0, version="170011", version_rc=0):
    tmp = pathlib.Path(tempfile.mkdtemp())
    (tmp / "scripts").mkdir()
    shutil.copy(REPO / "scripts" / "load_data.py", tmp / "scripts" / "load_data.py")
    shutil.copytree(REPO / "supabase", tmp / "supabase")
    bin_dir = tmp / "bin"
    bin_dir.mkdir()
    if preflight_rows is None:
        preflight_rows = {"agent_user": pf16(), "agent_cm": pf16(), "agent_nordea": pf16(exists="f", admin="f", og_row="f")}
    lines = [r + "\t" + "\t".join(cols) for r, cols in preflight_rows.items()]
    preflight = ("printf '%s\\n' " + " ".join("'" + line + "'" for line in lines) + ";") if preflight_rc == 0 else "echo 'pg_auth_members denied' >&2;"
    psql = bin_dir / "psql"
    psql.write_text(PSQL_TEMPLATE.replace("PREFLIGHT_RC", str(preflight_rc)).replace("PREFLIGHT", preflight)
                    .replace("VERSION_NUM", version).replace("VERSION_RC", str(version_rc)))
    psql.chmod(0o755)
    env = dict(os.environ)
    env["PATH"] = str(bin_dir) + os.pathsep + env.get("PATH", "")
    env["SUPABASE_DB_URL"] = "postgresql://owner:secretpw@db.example:5432/postgres"
    env["PSQL_STDIN_CAPTURE"] = str(tmp / "stdin.sql")
    env["PSQL_QUERIES_LOG"] = str(tmp / "queries.log")
    return tmp, env

def run(tmp, env, **extra):
    e = dict(env)
    e.update(extra)
    return subprocess.run([sys.executable, str(tmp / "scripts" / "load_data.py"), "--init"],
                          capture_output=True, text=True, env=e, cwd=tmp)

tmp, env = make_root()
(tmp / ".env.local").write_text('SUPABASE_DB_URL="postgresql://owner:secretpw@db.example:5432/postgres"\nGEMINI_API_KEY="keep-me"\nUSER_DB_URL="postgresql://stale:oldpw@db.example:5432/postgres"\n')
r = run(tmp, env)
out = r.stdout + r.stderr
check("fresh run succeeds against fake psql", r.returncode == 0, out[-300:])
check("privileged URL never in argv (fake psql rejects it)", "password in argv" not in out)
check("no password in stdout/stderr", "secretpw" not in out and "postgresql://agent_" not in out)
content = (tmp / ".env.local").read_text()
check(".env.local merge: unrelated keys preserved", 'GEMINI_API_KEY="keep-me"' in content and "SUPABASE_DB_URL" in content, content)
check("existing managed URLs preserved when no validated replacement (G64d: rerun never deletes working config)", 'USER_DB_URL="postgresql://stale:oldpw@db.example:5432/postgres"' in content and "CM_DB_URL" not in content, content)
check("new role URL written under the app key name NORDEA_DB_URL", 'NORDEA_DB_URL="postgresql://agent_nordea' in content, content)
queries = (tmp / "queries.log").read_text().splitlines()
check("VERSION FIRST: server_version_num is the first query", queries and "server_version_num" in queries[0], queries[0] if queries else "no queries")
check("single read-only preflight runs before the write stream", len(queries) >= 2 and "pg_auth_members" in queries[1] and "pg_auth_members" not in " ".join(queries[2:]), str(queries))
stdin_sql = (tmp / "stdin.sql").read_text()
check("missingSET+ADMIN: each existing role granted back WITH SET TRUE exactly once, no INHERIT or ADMIN clause (PG16 GRANT retains omitted options)",
      all(stdin_sql.count("grant " + r + " to current_user with set true;") == 1 for r in ("agent_user", "agent_cm"))
      and "inherit" not in stdin_sql.lower() and "admin" not in stdin_sql.lower(), stdin_sql[:400])
check("missing role created and granted WITH SET TRUE",
      "create role agent_nordea login password" in stdin_sql
      and stdin_sql.count("grant agent_nordea to current_user with set true;") == 1, stdin_sql[:400])
check("only the missing role gets a generated password (existing roles never rotated)",
      "create role agent_user login password" not in stdin_sql
      and "create role agent_cm login password" not in stdin_sql, stdin_sql[:400])
check("G71 deferred: no REVOKE anywhere in the write stream", "revoke" not in stdin_sql.lower(), stdin_sql[:400])
check("owner-grantor row snapshot printed for preservation proof (exists bool + options)",
      "preflight agent_user: exists=true can_set=false direct_admin=true superuser=false og_row_exists=true(admin=false,inherit=true,set=false)" in out, out[-600:])
r2 = run(tmp, env, AGENT_USER_PASSWORD="knownpw2")
content2 = (tmp / ".env.local").read_text()
check("rerun with the matching env password writes that role URL", r2.returncode == 0 and 'USER_DB_URL="postgresql://agent_user:knownpw2@' in content2, (r2.stdout + r2.stderr)[-200:] + " || " + content2)
check("rerun still preserves unrelated keys", 'GEMINI_API_KEY="keep-me"' in content2)

tmpS, envS = make_root(preflight_rows={"agent_user": pf16(can_set="t", og_set="t"),
                                       "agent_cm": pf16(can_set="t", og_set="t"),
                                       "agent_nordea": pf16(exists="f", admin="f", og_row="f")})
rS = run(tmpS, envS)
stdinS = (tmpS / "stdin.sql").read_text()
check("effective SET true (direct or indirect chain, per pg_has_role 'SET') skips the grant entirely",
      rS.returncode == 0 and "grant agent_user" not in stdinS and "grant agent_cm" not in stdinS
      and stdinS.count("grant agent_nordea to current_user with set true;") == 1, stdinS[:300])

tmpU, envU = make_root(preflight_rows={"agent_user": pf16(can_set="t", superuser="t", og_row="f"),
                                       "agent_cm": pf16(can_set="t", superuser="t", og_row="f"),
                                       "agent_nordea": pf16(can_set="t", superuser="t", og_row="f")})
rU = run(tmpU, envU)
stdinU = (tmpU / "stdin.sql").read_text()
check("superuser skip: no grant or create emitted for any existing role when connecting as superuser",
      rU.returncode == 0 and "to current_user" not in stdinU and "login password" not in stdinU, stdinU[:300])
outU = rU.stdout + rU.stderr
check("absent owner-grantor row printed as og_row_exists=false (distinguished from an all-false row)",
      "og_row_exists=false" in outU and "og_row_exists=false(" not in outU, outU[-600:])

tmpN, envN = make_root(preflight_rows={"agent_user": pf16(admin="f"),
                                       "agent_cm": pf16(can_set="t", og_set="t"),
                                       "agent_nordea": pf16(can_set="t", og_set="t")})
rN = run(tmpN, envN)
outN = rN.stdout + rN.stderr
check("noADMIN refusal: zero write stream, role named, indirect ADMIN refused conservatively",
      rN.returncode != 0 and not (tmpN / "stdin.sql").exists()
      and "agent_user" in outN and "ADMIN OPTION" in outN and "indirect ADMIN chains are not resolved" in outN
      and "membership WITH SET TRUE" in outN
      and "secretpw" not in outN, outN[-400:])

tmpV, envV = make_root(version_rc=1)
rV = run(tmpV, envV)
check("version probe failure refuses before ANY other query or write",
      rV.returncode != 0 and (tmpV / "queries.log").read_text().count("\n") == 1
      and not (tmpV / "stdin.sql").exists(), (rV.stdout + rV.stderr)[-300:])

tmpF, envF = make_root(preflight_rc=1)
(tmpF / ".env.local").write_text('GEMINI_API_KEY="keep-me"\n')
rF = run(tmpF, envF)
contentF = (tmpF / ".env.local").read_text()
check("preflight failure refuses to provision (no blind credential writes)",
      rF.returncode != 0 and 'GEMINI_API_KEY="keep-me"' in contentF and "NORDEA_DB_URL" not in contentF
      and "secretpw" not in (rF.stdout + rF.stderr))

rows15 = {"agent_user": pf15(member="t"), "agent_cm": pf15(member="f", admin="t"), "agent_nordea": pf15(exists="f", member="f", admin="f")}
tmp5, env5 = make_root(preflight_rows=rows15, version="150006")
r5 = run(tmp5, env5)
out5 = r5.stdout + r5.stderr
stdin5 = (tmp5 / "stdin.sql").read_text()
queries5 = (tmp5 / "queries.log").read_text()
check("PG<16 branch: member skipped, non-member admin-capable gets plain GRANT, missing role created + plain GRANT, no WITH options",
      r5.returncode == 0
      and "grant agent_user" not in stdin5
      and stdin5.count("grant agent_cm to current_user;") == 1
      and stdin5.count("grant agent_nordea to current_user;") == 1
      and " with " not in stdin5.split("grant agent_cm to current_user")[1].split(";")[0], stdin5[:400])
check("PG<16 preflight references no set_option and no 'SET' privilege (catalog lacks those columns)",
      "set_option" not in queries5 and "'SET'" not in queries5, queries5[:300])

rows15r = {"agent_user": pf15(member="f", admin="f"), "agent_cm": pf15(member="t"), "agent_nordea": pf15(member="t")}
tmp5r, env5r = make_root(preflight_rows=rows15r, version="150006")
r5r = run(tmp5r, env5r)
out5r = r5r.stdout + r5r.stderr
check("PG<16 universal refusal: non-member without ADMIN OPTION refuses with zero write stream",
      r5r.returncode != 0 and not (tmp5r / "stdin.sql").exists()
      and "agent_user" in out5r, out5r[-300:])
check("PG<16 refusal advice is version-specific: plain membership/ADMIN OPTION, never WITH SET TRUE advice",
      "plain membership" in out5r and "cannot parse WITH SET TRUE" in out5r
      and "membership WITH SET TRUE" not in out5r, out5r[-400:])
check("PG<16 refusal states conservative loader policy (does not rely on pre-16 CREATEROLE grant powers)",
      "conservative loader policy" in out5r and "does not rely" in out5r, out5r[-400:])

print("FAILURES: " + ", ".join(fails) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
