"""Functional --init pins (G64): runs load_data.py --init against a fake psql in a temp root.
Pins: the privileged URL never reaches argv; existing roles are detected via pg_roles and never
rotated; URLs are written under the app key names, merged into .env.local, only with a
known-current password; output never carries a password."""
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
case "$*" in *secretpw* ) echo 'password in argv' >&2; exit 9;; esac
case "$*" in *server_version_num* ) echo 'VERSION_NUM'; exit 0;; esac
case "$*" in *'select rolname'* ) PROBE exit PROBE_RC;; esac
cat >"$PSQL_STDIN_CAPTURE"; echo 'smoke ok'
exit 0
"""

def make_root(probe_out="agent_user\nagent_cm\n", probe_rc=0, version="170011"):
    tmp = pathlib.Path(tempfile.mkdtemp())
    (tmp / "scripts").mkdir()
    shutil.copy(REPO / "scripts" / "load_data.py", tmp / "scripts" / "load_data.py")
    shutil.copytree(REPO / "supabase", tmp / "supabase")
    bin_dir = tmp / "bin"
    bin_dir.mkdir()
    probe = ("printf '%s\\n' " + " ".join("'" + line + "'" for line in probe_out.splitlines())) if probe_rc == 0 else "echo 'pg_roles denied' >&2;"
    psql = bin_dir / "psql"
    psql.write_text(PSQL_TEMPLATE.replace("PROBE", probe).replace("PROBE_RC", str(probe_rc)).replace("VERSION_NUM", version))
    psql.chmod(0o755)
    env = dict(os.environ)
    env["PATH"] = str(bin_dir) + os.pathsep + env.get("PATH", "")
    env["SUPABASE_DB_URL"] = "postgresql://owner:secretpw@db.example:5432/postgres"
    env["PSQL_STDIN_CAPTURE"] = str(tmp / "stdin.sql")
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
stdin_sql = (tmp / "stdin.sql").read_text()
check("every agent role is granted back to the owner WITH SET TRUE (PG16+ hosted SET ROLE fix), including pre-existing roles",
      all(("grant " + r + " to current_user with set true;") in stdin_sql for r in ("agent_user", "agent_cm", "agent_nordea")), stdin_sql[:400])
check("only the missing role gets a generated password (existing roles never rotated)",
      "create role agent_nordea login password" in stdin_sql
      and "create role agent_user login password" not in stdin_sql
      and "create role agent_cm login password" not in stdin_sql, stdin_sql[:400])
r2 = run(tmp, env, AGENT_USER_PASSWORD="knownpw2")
content2 = (tmp / ".env.local").read_text()
check("rerun with the matching env password writes that role URL", r2.returncode == 0 and 'USER_DB_URL="postgresql://agent_user:knownpw2@' in content2, (r2.stdout + r2.stderr)[-200:] + " || " + content2)
check("rerun still preserves unrelated keys", 'GEMINI_API_KEY="keep-me"' in content2)
tmp3, env3 = make_root(probe_rc=1)
(tmp3 / ".env.local").write_text('GEMINI_API_KEY="keep-me"\n')
r3 = run(tmp3, env3)
content3 = (tmp3 / ".env.local").read_text()
check("pg_roles check failure refuses to provision (no blind credential writes)", r3.returncode != 0 and 'GEMINI_API_KEY="keep-me"' in content3 and "NORDEA_DB_URL" not in content3 and "secretpw" not in (r3.stdout + r3.stderr))

tmp5, env5 = make_root(version="150006")
r5 = run(tmp5, env5)
stdin5 = (tmp5 / "stdin.sql").read_text()
check("PG<16 branch: plain GRANT without WITH options (server cannot parse WITH SET; membership alone permits SET ROLE)",
      r5.returncode == 0
      and all(("grant " + r + " to current_user;") in stdin5 for r in ("agent_user", "agent_cm", "agent_nordea"))
      and " with " not in stdin5.split("grant agent_user to current_user")[1].split(";")[0], stdin5[:400])

print("FAILURES: " + ", ".join(fails) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
