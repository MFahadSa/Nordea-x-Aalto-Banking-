/**
 * App-level barrel over the four physical stores. Agent modules NEVER import this -
 * each agent imports only its own store module (pinned by the AC1 boundary test).
 * This barrel exists for the app layer: HTTP orchestration, dashboards, tests.
 */
export * from './userStore.js';
export * from './cmStore.js';
export * from './nordeaStore.js';
export * from './busStore.js';
export * from './contextStore.js';
export { fileFor, deleteDbFile } from './common.js';
import { deleteUserDb } from './userStore.js';
import { deleteCmDb } from './cmStore.js';
import { deleteNordeaDb } from './nordeaStore.js';

/** Delete one database, and only that one. */
export function deleteDb(uid: string, which: 'user' | 'cm' | 'nordea') {
  if (which === 'user') deleteUserDb(uid);
  else if (which === 'cm') deleteCmDb(uid);
  else deleteNordeaDb(uid);
}
