# G38 baseline: grants, RLS, policies on the 4 public tables (before any change)

Read 2026-11-02 12:43 EET (10:43 UTC), read-only, via direct role login `agent_nordea` (pooler).
Catalogs used (pg_class, pg_policies, pg_proc, pg_trigger) are readable by any role; values are global.

## relacl (pg_class.relacl)

- agent_cm_records:     {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_cm=arwd/postgres}
- agent_nordea_records: {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_nordea=arwd/postgres}
- agent_user_records:   {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_user=arwd/postgres}
- nordea_feed:          {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,agent_nordea=rw/postgres}

`authenticated` holds the same `arwdDxtm` grant on all four tables (nordea_feed plus the 3 agent tables).
`anon` has no entry on any table (G35/G37 state confirmed).

## RLS and policies

- relrowsecurity=true on all 4 tables (not forced).
- Policies: agent_cm_own / agent_nordea_own / agent_user_own (cmd ALL, own role); nordea_feed_agent (cmd ALL, agent_nordea).
- No policy for `authenticated`: its row read/write is RLS-blocked. The grant still carries privileges
  outside RLS coverage (including TRUNCATE, TRIGGER, REFERENCES) on all four tables.

## Functions and triggers

- Functions in public schema: none.
- Triggers on the 4 tables: none (only Supabase-internal storage/realtime triggers exist).

## App dependency on the `authenticated` role

- Repo grep (scripts/src/supabase, excluding node_modules): no code path references the `authenticated` role.
- App access routes: anon publishable key via PostgREST, direct agent-role logins, service key in abel plumbing.
- No identified current dependency on the `authenticated` grant. A future end-user Supabase Auth feature
  would need grants re-added deliberately, with policies.

## Scope

This file is evidence only; no mutation performed. Revoking `authenticated` on any table is an owner
decision (G38). After an approved change, commit the after-state relacl the same way (G37 method).
