// "Your documents": files the customer chose to keep ("Keep a copy" when adding a file to chat).
// By default nothing is kept: Abel reads the file once and only the things the customer ticks are saved.
import { db } from './db.js';
import { StoredDocument } from '../types.js';
import { supabaseConfigured, supabaseRemote, localFiles, Remote } from './store.js';

/** Kept copies delete themselves after this many days. */
export const KEEP_DAYS = 30;

let remote: Remote | null = null;
function files() {
  if (supabaseConfigured() && db.status().mode === 'supabase') return (remote ||= supabaseRemote());
  return localFiles;
}

const newId = () => `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function keepDocument(input: {
  userId: string;
  name: string;
  kind: StoredDocument['kind'];
  mimeType: string;
  body: Buffer;
  conversationId?: string;
}): Promise<StoredDocument> {
  const id = newId();
  const storagePath = `${input.userId}/${id}`;
  await files().putFile(storagePath, input.body, input.mimeType);
  const now = new Date();
  return db.addDocument({
    id, userId: input.userId, name: input.name, kind: input.kind, mimeType: input.mimeType, size: input.body.length, storagePath,
    conversationId: input.conversationId, entryIds: [], createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + KEEP_DAYS * 86400000).toISOString(),
  });
}

export async function readDocument(d: StoredDocument): Promise<Buffer> {
  return files().getFile(d.storagePath);
}

/**
 * Delete a kept file. With alsoEntries, the things saved from it are deleted for good too
 * (including their history). Without it, they stay in What Abel knows.
 */
export async function deleteDocument(d: StoredDocument, alsoEntries: boolean) {
  await files().deleteFiles([d.storagePath]);
  let removed = 0;
  if (alsoEntries) for (const id of d.entryIds) if (db.deleteCabinetEntry(id, { purge: true })) removed++;
  db.removeDocument(d.id);
  return { removed };
}

/** Delete copies older than KEEP_DAYS. The things saved from them stay. */
export async function sweepExpired() {
  const now = new Date().toISOString();
  const old = db.getState().documents.filter((d) => d.expiresAt <= now);
  for (const d of old) {
    try {
      await deleteDocument(d, false);
    } catch (err) {
      console.error('Could not delete an expired document:', err);
    }
  }
  return old.length;
}

/** Demo reset: remove every kept file before the data goes back to the start. */
export async function deleteAllDocumentFiles() {
  const paths = db.getState().documents.map((d) => d.storagePath);
  try {
    await files().deleteFiles(paths);
  } catch (err) {
    console.error('Could not delete kept files on reset:', err);
  }
}

// Check for expired copies every hour.
setInterval(() => { sweepExpired().catch(() => {}); }, 3600_000).unref();
