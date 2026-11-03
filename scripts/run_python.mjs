#!/usr/bin/env node
/**
 * Run a Python script with whatever the machine offers: "python" first (Windows, most
 * current setups), then "python3" (older macOS/Linux). Keeps npm scripts and tests
 * working on both. Usage: node scripts/run_python.mjs <script.py> [args...]
 */
import { spawn } from 'node:child_process';

const [, , script, ...args] = process.argv;
if (!script) {
  console.error('usage: node scripts/run_python.mjs <script.py> [args...]');
  process.exit(2);
}

const tryCmd = (cmd) => new Promise((resolve, reject) => {
  const child = spawn(cmd, [script, ...args], { stdio: 'inherit' });
  child.on('error', reject);
  child.on("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
});

let code;
try {
  code = await tryCmd('python');
} catch {
  try {
    code = await tryCmd('python3');
  } catch {
    console.error('No Python found: neither "python" nor "python3" is on PATH.');
    process.exit(127);
  }
}
process.exit(code);
