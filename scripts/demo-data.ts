// Builds a throwaway cabinet-db.json from the bundled demo dataset (seed/demo), in the
// same shape scripts/load_data.py --target file writes. The check scripts use it so they
// work on a fresh clone, where no data has been loaded yet. Never touches real data.
import fs from 'fs';
import path from 'path';

export function writeDemoDb(dir: string): string {
  const seedDir = path.resolve('seed/demo');
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(seedDir, name), 'utf-8'));
  const users = read('users.json') as { id: string }[];
  const state = {
    users: Object.fromEntries(users.map((u) => [u.id, u])),
    cabinetEntries: read('cabinetEntries.json'),
    entryHistory: read('entryHistory.json'),
    messages: read('messages.json'),
    accessLog: read('accessLog.json'),
    topicLog: read('topicLog.json'),
  };
  const file = path.join(dir, 'cabinet-db.json');
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8');
  return file;
}
