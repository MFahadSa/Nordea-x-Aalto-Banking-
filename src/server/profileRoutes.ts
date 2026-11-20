// Profile routes: list, add, edit, remove, Markdown import (preview, then apply) and export.
import type { Express, Request, Response } from 'express';
import { db } from './db.js';
import {
  getProfileEntries, saveProfileField, updateProfileField, removeProfileField,
  parseProfileMarkdown, previewProfileImport, applyProfileImport, profileToMarkdown,
} from './profile.js';

const fail = (res: Response, err: any) => res.status(err?.status || 500).json({ error: String(err?.message || err) });

export function registerProfileRoutes(app: Express) {
  /** The customer must exist; an unknown id never reaches the profile functions. */
  const owner = (req: Request, res: Response): string | undefined => {
    const userId = String((req.method === 'GET' ? req.query.userId : req.body?.userId) || '');
    if (!userId || !db.getUser(userId)) { res.status(404).json({ error: 'Unknown customer' }); return undefined; }
    return userId;
  };
  /** An entry id must belong to the customer who asks. */
  const mine = (userId: string, id: string) => {
    const e = db.getCabinetEntry(id);
    return e && e.userId === userId && e.type === 'profile' ? e : undefined;
  };

  app.get('/api/profile', (req, res) => {
    const userId = owner(req, res); if (!userId) return;
    res.json({ fields: getProfileEntries(userId) });
  });

  app.post('/api/profile', (req, res) => {
    const userId = owner(req, res); if (!userId) return;
    try {
      const { label, value, group, private: priv } = req.body || {};
      res.status(201).json(saveProfileField(userId, { label: String(label ?? ''), value: String(value ?? ''), group: group ? String(group) : undefined, private: !!priv }));
    } catch (err) { fail(res, err); }
  });

  app.patch('/api/profile/:id', (req, res) => {
    const userId = owner(req, res); if (!userId) return;
    if (!mine(userId, req.params.id)) return res.status(404).json({ error: 'Profile field not found' });
    try {
      const { label, value, group, private: priv } = req.body || {};
      res.json(updateProfileField(req.params.id, {
        ...(label !== undefined ? { label: String(label) } : {}),
        ...(value !== undefined ? { value: String(value) } : {}),
        ...(group !== undefined ? { group: String(group) } : {}),
        ...(priv !== undefined ? { private: !!priv } : {}),
      }));
    } catch (err) { fail(res, err); }
  });

  app.delete('/api/profile/:id', (req, res) => {
    // DELETE has no JSON body by habit: the customer id comes in the query.
    const userId = String(req.query.userId || req.body?.userId || '');
    if (!userId || !db.getUser(userId)) return res.status(404).json({ error: 'Unknown customer' });
    if (!mine(userId, req.params.id)) return res.status(404).json({ error: 'Profile field not found' });
    try { res.json(removeProfileField(req.params.id)); } catch (err) { fail(res, err); }
  });

  /** Step 1 of an import: read the file, compare with the profile, change nothing. */
  app.post('/api/profile/import/preview', (req, res) => {
    const userId = owner(req, res); if (!userId) return;
    const text = req.body?.text;
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'The file is empty.' });
    if (text.length > 200_000) return res.status(413).json({ error: 'That file is too big. Try one under 200 KB.' });
    const fields = parseProfileMarkdown(text);
    if (!fields.length) return res.status(422).json({ error: 'I couldn’t find anything about you in that file. Write a few sentences, or lines like “- Occupation: Nurse”.' });
    res.json({ items: previewProfileImport(userId, fields), source: String(req.body?.fileName || 'your file').slice(0, 80) });
  });

  /** Step 2: save only what the customer ticked. */
  app.post('/api/profile/import/apply', (req, res) => {
    const userId = owner(req, res); if (!userId) return;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Nothing selected.' });
    try {
      res.json(applyProfileImport(userId, items.map((i: any) => ({
        key: '', label: String(i?.label ?? ''), value: String(i?.value ?? ''), group: String(i?.group ?? ''),
        existingId: i?.existingId ? String(i.existingId) : undefined, sensitive: !!i?.sensitive,
      })), String(req.body?.source || '')));
    } catch (err) { fail(res, err); }
  });

  app.get('/api/profile/export', (req, res) => {
    const userId = owner(req, res); if (!userId) return;
    res.type('text/markdown; charset=utf-8').set('Content-Disposition', 'attachment; filename="my-profile.md"').send(profileToMarkdown(userId));
  });
}
