// Loads .env, then .env.local (which wins), BEFORE any module reads process.env at import time.
// ESM evaluates a module's imports before its body, so this must be the FIRST import of every
// entry point that expects .env values (server.ts, scripts/load_remote.ts). Precedence is
// unchanged: real environment variables beat .env (dotenv never overrides by default), and
// .env.local overrides both (override: true), exactly as server.ts did before.
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
