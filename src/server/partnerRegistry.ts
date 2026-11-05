import fs from 'fs';
import path from 'path';
import { PartnerManifest } from '../types.js';

// Partners are plain JSON manifests in /partners, like agents in /agents.
// Adding a partner means adding a file; the core doesn't change.
const DIR = path.resolve(process.cwd(), 'partners');

export function getAllPartners(): PartnerManifest[] {
  try {
    if (!fs.existsSync(DIR)) return [];
    return fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf-8')) as PartnerManifest);
  } catch (err) {
    console.error('Error reading partners directory:', err);
    return [];
  }
}

export function getPartner(id: string): PartnerManifest | null {
  return getAllPartners().find((p) => p.id === id) || null;
}
