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
case "$*" in *'select rolname'* ) PROBE exit PROBE_RC;; esac
cat >/dev/null; echo 'smoke ok'
exit 0
"""

def make_root(probe_out="agent_user\nagent_cm\n", probe_rc=0):
    tmp = pathlib.Path(tempfile.mkdtemp())
    (tmp / "scripts").mkdir()
    shutil.copy(REPO / "scripts" / "load_data.py", tmp / "scripts" / "load_data.py")
    shutil.copytree(REPO / "supabase", tmp / "supabase")
    bin_dir = tmp / "bin"
    bin_dir.mkdir()
    probe = ("printf '%s\\n' " + " ".join("'" + line + "'" for line in probe_out.splitlines())) if probe_rc == 0 else "echo 'pg_roles denied' >&2;"
    psql = bin_dir / "psql"
    psql.write_text(PSQL_TEMPLATE.replace("PROBE", probe).replace("PROBE_RC", str(probe_rc)))
    psql.chmod(0o755)
    env = dict(os.environ)
    env["PATH"] = str(bin_dir) + os.pathsep + env.get("PATH", "")
    env["SUPABASE_DB_URL"] = "postgresql://owner:secretpw@db.example:5432/postgres"
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
r2 = run(tmp, env, AGENT_USER_PASSWORD="knownpw2")
content2 = (tmp / ".env.local").read_text()
check("rerun with the matching env password writes that role URL", r2.returncode == 0 and 'USER_DB_URL="postgresql://agent_user:knownpw2@' in content2, (r2.stdout + r2.stderr)[-200:] + " || " + content2)
check("rerun still preserves unrelated keys", 'GEMINI_API_KEY="keep-me"' in content2)
tmp3, env3 = make_root(probe_rc=1)
(tmp3 / ".env.local").write_text('GEMINI_API_KEY="keep-me"\n')
r3 = run(tmp3, env3)
content3 = (tmp3 / ".env.local").read_text()
check("pg_roles check failure refuses to provision (no blind credential writes)", r3.returncode != 0 and 'GEMINI_API_KEY="keep-me"' in content3 and "NORDEA_DB_URL" not in content3 and "secretpw" not in (r3.stdout + r3.stderr))

print("FAILURES: " + ", ".join(fails) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
