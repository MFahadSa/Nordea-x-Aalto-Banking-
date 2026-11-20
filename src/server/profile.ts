// The Profile part of the Context Cabinet: what the customer says about themselves ("You told us").
// A profile field is a cabinet entry of type 'profile': title = label ("Occupation"), detail = value.
//
// Importing a Markdown file is done in plain code (no model): the file is untrusted text, so it is
// only ever read as data - never as instructions - and nothing is saved until the customer ticks it
// in the preview. A tick on a field that already exists updates it (merge) instead of adding a copy.
import { db } from './db.js';
import { ABEL_PRIVATE_TOPIC } from './sensitive.js';
import type { CabinetEntry } from '../types.js';

export const DEFAULT_GROUP = 'About you';
/** The name a free description is shown under. */
export const NOTE_LABEL = 'In my words';
const NOTE_KEY = 'inmywords';
const isNote = (e: { profileKey?: string; title: string }) => (e.profileKey || '').startsWith('note-') || e.title === NOTE_LABEL;
const noteKey = () => `note-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const MAX_FIELDS = 60;
const MAX_LABEL = 60;
const MAX_VALUE = 300;
/** A note in the customer's own words can be longer than a field value. */
const MAX_NOTE = 1000;
const MAX_TEXT = 200_000;

export interface ProfileField {
  key: string;
  label: string;
  value: string;
  group: string;
}

export interface ProfileImportItem extends ProfileField {
  /** new = not in the profile yet, update = the field exists with another value, same = nothing to do. */
  action: 'new' | 'update' | 'same';
  existingId?: string;
  oldValue?: string;
  /** Looks private (health, debt collection ...): saved as private if ticked, never shown to offers. */
  sensitive: boolean;
  /** Ticked in the preview by default. */
  on: boolean;
}

/** Different spellings of the same field are one field ("Job" and "Occupation"). */
const ALIASES: [RegExp, string][] = [
  [/^(name|fullname|myname|preferredname|firstname)$/, 'name'],
  [/^(age|yearsold)$/, 'age'],
  [/^(birthday|birthdate|dateofbirth|dob|born)$/, 'birthday'],
  [/^(city|location|livesin|livein|hometown|residence|town|country|address)$/, 'location'],
  [/^(occupation|job|jobtitle|profession|role|work|position|career)$/, 'occupation'],
  [/^(employer|company|workplace|worksat|organisation|organization)$/, 'employer'],
  [/^(income|salary|monthlyincome|netincome|netsalary|grosssalary|pay)$/, 'income'],
  [/^(household|family|familystatus|maritalstatus|relationshipstatus|civilstatus|livingsituation)$/, 'household'],
  [/^(kids|children|dependants|dependents)$/, 'children'],
  [/^(housing|home|residencetype|rentorown|housingsituation)$/, 'housing'],
  [/^(language|languages|spokenlanguages|preferredlanguage)$/, 'languages'],
  [/^(education|studies|degree|school|university)$/, 'education'],
];

/** "Job title" -> "jobtitle" -> "occupation". The key decides whether an import updates or adds. */
export function profileKeyOf(label: string): string {
  const k = label.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  return ALIASES.find(([re]) => re.test(k))?.[1] ?? (k || 'field');
}

const PLACEHOLDER = /^(?:-|–|—|\?|n\/?a|none|null|tbd|todo|unknown|\.{2,}|_+|your .*here|<.*>|\[.*\])$/i;

/** Plain text out of Markdown inline formatting: **bold**, _italic_, `code`, [text](url), <b>x</b>. */
function plain(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function make(label: string, value: string, group: string): ProfileField | null {
  const l = plain(label).replace(/[:：]\s*$/, '').trim().slice(0, MAX_LABEL);
  const v = plain(value).slice(0, profileKeyOf(l) === NOTE_KEY ? MAX_NOTE : MAX_VALUE);
  if (!l || !v || PLACEHOLDER.test(v) || PLACEHOLDER.test(l) || v.startsWith('//')) return null;
  return { key: profileKeyOf(l), label: l, value: v, group: plain(group).slice(0, 40) || DEFAULT_GROUP };
}

/**
 * Reads a Markdown file and returns profile fields. Understands:
 *   - front matter (--- key: value ---)
 *   - "## Section" headings, which become the group
 *   - "- Key: value", "* **Key:** value", "Key: value" lines
 *   - "| Field | Value |" tables
 *   - a heading followed by a plain bullet list ("## Languages", "- Finnish", "- English"),
 *     which becomes one field ("Languages: Finnish, English")
 * The first line of a field wins when the same key appears twice.
 */
export function parseProfileMarkdown(raw: string): ProfileField[] {
  const text = String(raw ?? '').replace(/\r\n?/g, '\n').slice(0, MAX_TEXT);
  const out: ProfileField[] = [];
  const seen = new Set<string>();
  const add = (f: ProfileField | null) => {
    if (!f || out.length >= MAX_FIELDS) return;
    const id = `${f.group}\u0000${f.key}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(f);
  };

  let lines = text.split('\n');
  let group = DEFAULT_GROUP;
  // Front matter.
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) {
      for (const l of lines.slice(1, end)) {
        const m = l.match(/^\s*([^:#][^:]*?)\s*:\s*(.+?)\s*$/);
        if (m) add(make(m[1], m[2], group));
      }
      lines = lines.slice(end + 1);
    }
  }

  let listHeading: string | null = null;
  let listItems: string[] = [];
  const flushList = () => {
    if (listHeading && listItems.length) add(make(listHeading, listItems.join(', '), group));
    listItems = [];
  };

  // Free text (a paragraph that is not a field or a list) is kept as a note in the customer's own words.
  let para: string[] = [];
  const flushPara = () => {
    const txt = para.join(' ').trim();
    para = [];
    if (txt.length < 12 || out.length >= MAX_FIELDS) return; // too short to say anything
    const v = plain(txt).slice(0, MAX_NOTE);
    if (!v || /^https?:\/\/\S+$/.test(v)) return;
    const id = `${group}\u0000note\u0000${v.toLowerCase()}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ key: NOTE_KEY, label: NOTE_LABEL, value: v, group });
  };

  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { flushPara(); inFence = !inFence; continue; }
    if (inFence) continue;
    const t = line.trim();
    if (!t) { flushPara(); continue; }

    const h = t.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (h) {
      flushPara();
      flushList();
      const name = plain(h[2]);
      // "# My profile" (level 1) is the title. Level 2+ opens a section and may also name a list field.
      if (h[1].length >= 2 && name) { group = name.slice(0, 40); listHeading = name; }
      else listHeading = null;
      continue;
    }

    // Table row.
    if (t.startsWith('|')) {
      flushPara();
      const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // |---|---|
      if (cells.length >= 2 && !/^(field|key|item|question|label|name)$/i.test(plain(cells[0])) ) add(make(cells[0], cells[1], group));
      continue;
    }

    const bullet = t.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    const body = bullet ? bullet[1] : t;
    // "Key: value" - the key must be short, so a sentence with a colon is not read as a field.
    const kv = body.match(/^(\*\*|__)?([^:：*]{1,60}?)(?:\1)?\s*[:：]\s*(?:\1)?\s*(.+)$/) || body.match(/^\*\*([^*]{1,60})\*\*\s*[:：-]\s*(.+)$/);
    if (kv) {
      const label = kv.length === 4 ? kv[2] : kv[1];
      const value = kv.length === 4 ? kv[3] : kv[2];
      if (label.trim().split(/\s+/).length <= 6 && !/^https?$/i.test(label.trim())) { flushPara(); add(make(label, value, group)); continue; }
    }
    if (bullet) { flushPara(); if (listHeading) listItems.push(plain(bullet[1])); continue; }
    para.push(t);
  }
  flushPara();
  flushList();
  return out;
}

/** The customer's current profile fields (not removed), in a stable order. */
export function getProfileEntries(userId: string): CabinetEntry[] {
  return db
    .getCabinetEntries(userId)
    .filter((e) => e.type === 'profile' && e.status !== 'archived')
    .sort((a, b) => (a.profileGroup || DEFAULT_GROUP).localeCompare(b.profileGroup || DEFAULT_GROUP) || a.createdAt.localeCompare(b.createdAt));
}

const keyOfEntry = (e: CabinetEntry) => e.profileKey || profileKeyOf(e.title);

/** Compares parsed fields with the profile as it is now. Nothing is changed. */
export function previewProfileImport(userId: string, fields: ProfileField[]): ProfileImportItem[] {
  const mine = getProfileEntries(userId);
  return fields.map((f) => {
    const sensitive = ABEL_PRIVATE_TOPIC.test(`${f.label} ${f.value}`);
    const base = { ...f, sensitive };
    if (f.key === NOTE_KEY) {
      // Notes are never merged into each other: the same text is "already there", anything else is new.
      const same = mine.find((e) => isNote(e) && e.detail.trim().toLowerCase() === f.value.trim().toLowerCase());
      return (same ? { ...base, action: 'same', existingId: same.id, oldValue: same.detail, on: false } : { ...base, action: 'new', on: !sensitive }) as ProfileImportItem;
    }
    const hit = mine.find((e) => !isNote(e) && keyOfEntry(e) === f.key);
    if (!hit) return { ...base, action: 'new', on: !sensitive } as ProfileImportItem;
    if (hit.detail.trim().toLowerCase() === f.value.trim().toLowerCase())
      return { ...base, action: 'same', existingId: hit.id, oldValue: hit.detail, on: false };
    return { ...base, action: 'update', existingId: hit.id, oldValue: hit.detail, on: !sensitive };
  });
}

const stamp = () => new Date().toISOString();
const newId = () => `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const undoId = () => `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export interface ProfileInput {
  label: string;
  value: string;
  group?: string;
  private?: boolean;
}

/** Adds one profile field (a new field with the same key as an existing one updates that one). */
export function saveProfileField(userId: string, input: ProfileInput, how = 'In the app') {
  // A free description ("I'm a nurse in Espoo with two kids") has no name: it is saved as its own note,
  // with a unique key, so a second note never overwrites the first.
  if ((!plain(input.label || '') || profileKeyOf(input.label) === NOTE_KEY) && plain(input.value || '')) {
    const v = plain(input.value).slice(0, MAX_NOTE);
    const t = stamp();
    const entry: CabinetEntry = {
      id: newId(), userId, type: 'profile', title: NOTE_LABEL, detail: v, source: 'customer', status: 'active',
      private: !!input.private || ABEL_PRIVATE_TOPIC.test(v), readableBy: { abel: true, offers: false }, provenance: { channel: 'app' },
      profileKey: noteKey(), profileGroup: plain(input.group || '').slice(0, 40) || DEFAULT_GROUP,
      reviewed: true, confirmedAt: t, createdAt: t, updatedAt: t,
    };
    db.addCabinetEntry(entry, { by: 'you', how });
    const undoToken = undoId();
    db.addUndoRecord({ undoToken, timestamp: t, userId, action: 'create', description: 'Added a note to your profile', previousEntry: null, entryId: entry.id });
    return { entry, undoToken, created: true };
  }
  const f = make(input.label, input.value, input.group || DEFAULT_GROUP);
  if (!f) throw Object.assign(new Error('Write a name and a value for it.'), { status: 400 });
  const hit = getProfileEntries(userId).find((e) => !isNote(e) && keyOfEntry(e) === f.key);
  if (hit) return { ...updateProfileField(hit.id, { label: f.label, value: f.value, group: f.group, private: input.private }, how), created: false };
  const t = stamp();
  const entry: CabinetEntry = {
    id: newId(), userId, type: 'profile', title: f.label, detail: f.value, source: 'customer', status: 'active',
    private: !!input.private, readableBy: { abel: true, offers: false }, provenance: { channel: 'app' },
    profileKey: f.key, profileGroup: f.group, reviewed: true, confirmedAt: t, createdAt: t, updatedAt: t,
  };
  db.addCabinetEntry(entry, { by: 'you', how });
  const undoToken = undoId();
  db.addUndoRecord({ undoToken, timestamp: t, userId, action: 'create', description: `Added "${entry.title}" to your profile`, previousEntry: null, entryId: entry.id });
  return { entry, undoToken, created: true };
}

/** Edits a profile field: its name, value, section or privacy. */
export function updateProfileField(id: string, input: Partial<ProfileInput>, how = 'In the app') {
  const old = db.getCabinetEntry(id);
  if (!old || old.type !== 'profile') throw Object.assign(new Error('Profile field not found'), { status: 404 });
  const label = input.label !== undefined ? plain(input.label).replace(/[:：]\s*$/, '').slice(0, MAX_LABEL) : old.title;
  const value = input.value !== undefined ? plain(input.value).slice(0, isNote(old) ? MAX_NOTE : MAX_VALUE) : old.detail;
  if (!label || !value) throw Object.assign(new Error('Write a name and a value for it.'), { status: 400 });
  const updates: Partial<CabinetEntry> = {
    title: label, detail: value, profileKey: label === old.title && old.profileKey ? old.profileKey : profileKeyOf(label),
    profileGroup: input.group !== undefined ? plain(input.group).slice(0, 40) || DEFAULT_GROUP : old.profileGroup || DEFAULT_GROUP,
    status: 'active', confirmedAt: stamp(),
  };
  if (input.private !== undefined) {
    updates.private = !!input.private;
    // Private means never offers; making it private also switches offers off.
    if (input.private) updates.readableBy = { ...old.readableBy, offers: false };
  }
  const prev = { ...old };
  const entry = db.updateCabinetEntry(id, updates, { by: 'you', how })!;
  const undoToken = undoId();
  db.addUndoRecord({ undoToken, timestamp: stamp(), userId: old.userId, action: 'update', description: `Updated "${old.title}"`, previousEntry: prev, entryId: id });
  return { entry, undoToken };
}

/** Removes a profile field. It is archived, so the history keeps it and the customer can bring it back. */
export function removeProfileField(id: string) {
  const old = db.getCabinetEntry(id);
  if (!old || old.type !== 'profile') throw Object.assign(new Error('Profile field not found'), { status: 404 });
  const prev = { ...old };
  const entry = db.updateCabinetEntry(id, { status: 'archived' }, { by: 'you', how: 'In the app' })!;
  const undoToken = undoId();
  db.addUndoRecord({ undoToken, timestamp: stamp(), userId: old.userId, action: 'archive', description: `Removed "${old.title}" from your profile`, previousEntry: prev, entryId: id });
  return { entry, undoToken };
}

/** Saves the ticked items of an import preview: updates existing fields, adds new ones. */
export function applyProfileImport(userId: string, items: Array<ProfileField & { existingId?: string; sensitive?: boolean }>, source: string) {
  const how = `From ${source.slice(0, 60) || 'a Markdown file'}`;
  const mine = getProfileEntries(userId);
  const undoTokens: string[] = [];
  const createdIds: string[] = [];
  let updated = 0;
  for (const raw of items.slice(0, MAX_FIELDS)) {
    const f = make(raw.label, raw.value, raw.group || DEFAULT_GROUP);
    if (!f) continue;
    const note = f.key === NOTE_KEY;
    // Trust the server's own view of what exists, never an id from the browser alone. Notes only match the same text.
    const hit = note
      ? mine.find((e) => isNote(e) && e.detail.trim().toLowerCase() === f.value.trim().toLowerCase())
      : mine.find((e) => !isNote(e) && ((raw.existingId && e.id === raw.existingId) || keyOfEntry(e) === f.key));
    const sensitive = !!raw.sensitive || ABEL_PRIVATE_TOPIC.test(`${f.label} ${f.value}`);
    const t = stamp();
    if (hit && note) continue;
    if (hit) {
      if (hit.detail === f.value && (hit.profileGroup || DEFAULT_GROUP) === f.group) continue;
      const prev = { ...hit };
      db.updateCabinetEntry(hit.id, { title: hit.title, detail: f.value, profileKey: f.key, profileGroup: f.group, status: 'active', confirmedAt: t }, { by: 'you', how });
      const undoToken = undoId();
      db.addUndoRecord({ undoToken, timestamp: t, userId, action: 'update', description: `Updated "${hit.title}"`, previousEntry: prev, entryId: hit.id });
      undoTokens.push(undoToken);
      updated++;
      continue;
    }
    const entry: CabinetEntry = {
      id: newId(), userId, type: 'profile', title: f.label, detail: f.value, source: 'document', status: 'active',
      private: sensitive, readableBy: { abel: true, offers: false }, provenance: { channel: 'document' },
      profileKey: note ? noteKey() : f.key, profileGroup: f.group, reviewed: true, confirmedAt: t, createdAt: t, updatedAt: t,
    };
    db.addCabinetEntry(entry, { by: 'you', how });
    mine.push(entry);
    createdIds.push(entry.id);
  }
  if (createdIds.length) {
    const undoToken = undoId();
    db.addUndoRecord({ undoToken, timestamp: stamp(), userId, action: 'create_many', description: `Imported ${createdIds.length} profile fields`, previousEntry: null, entryIds: createdIds });
    undoTokens.unshift(undoToken);
  }
  return { added: createdIds.length, updated, undoTokens };
}

/** The profile as a Markdown file, in the same shape the importer reads (export, edit, import again). */
export function profileToMarkdown(userId: string): string {
  const groups = new Map<string, CabinetEntry[]>();
  for (const e of getProfileEntries(userId)) {
    const g = e.profileGroup || DEFAULT_GROUP;
    groups.set(g, [...(groups.get(g) || []), e]);
  }
  const lines = ['# My profile', ''];
  for (const [g, es] of groups) {
    lines.push(`## ${g}`, '');
    for (const e of es) lines.push(`- ${e.title}: ${e.detail}`);
    lines.push('');
  }
  return lines.join('\n');
}
