import React, { useRef, useState } from 'react';
import { CabinetEntry } from '../types.js';
import { Icon } from '../ui/icons.js';
import { Band } from './Nordea.js';
import {
  addProfileField, editProfileField, removeProfileField, previewProfileImport, applyProfileImport,
  profileExportUrl, undoCabinetAction, ProfileImportItem,
} from '../services/api.js';

const DEFAULT_GROUP = 'About you';
const MAX_BYTES = 200_000;

const input: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--bg)', color: 'var(--ink)', fontSize: 15, boxSizing: 'border-box',
};

interface Props {
  userId: string;
  entries: CabinetEntry[];
  onChanged: () => void;
  onToast: (message: string, undoToken?: string) => void;
}

/** One field: shows "Label: value", opens into an editor (name, value, section, private) with Save / Remove. */
const FieldRow: React.FC<{
  e: CabinetEntry; groups: string[]; open: boolean; onToggle: () => void;
  onSave: (f: { label: string; value: string; group: string; private: boolean }) => Promise<void>;
  onRemove: () => Promise<void>;
}> = ({ e, groups, open, onToggle, onSave, onRemove }) => {
  const [label, setLabel] = useState(e.title);
  const [value, setValue] = useState(e.detail);
  const [group, setGroup] = useState(e.profileGroup || DEFAULT_GROUP);
  const [priv, setPriv] = useState(e.private);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (open) { setLabel(e.title); setValue(e.detail); setGroup(e.profileGroup || DEFAULT_GROUP); setPriv(e.private); } }, [open, e.id, e.title, e.detail, e.profileGroup, e.private]);
  const canSave = label.trim() && value.trim() && !busy;
  return (
    <div className="row" data-testid="profile-row">
      <div className="row-main">
        <span className="dotc you" />
        <div className="row-txt">
          <h4>{e.title}</h4>
          <p className={open ? '' : 'clamp1'}>{e.detail}</p>
          {(e.private || e.source === 'document') && <span className="meta">{[e.private ? 'Private · never used for offers' : '', e.source === 'document' ? 'From a file you imported' : ''].filter(Boolean).join(' · ')}</span>}
        </div>
        <button className="more" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Close' : 'Edit'} ${e.title}`}>{open ? '×' : '⋯'}</button>
      </div>
      {open && (
        <form className="row-opts" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}
          onSubmit={async (ev) => { ev.preventDefault(); if (!canSave) return; setBusy(true); try { await onSave({ label, value, group, private: priv }); } finally { setBusy(false); } }}>
          <label><span className="kicker" style={{ display: 'block', marginBottom: 4 }}>Name</span>
            <input style={input} value={label} maxLength={60} onChange={(x) => setLabel(x.target.value)} aria-label="Field name" /></label>
          <label><span className="kicker" style={{ display: 'block', marginBottom: 4 }}>Value</span>
            <textarea style={{ ...input, minHeight: 44, resize: 'vertical', fontFamily: 'inherit' }} rows={e.detail.length > 60 ? 3 : 1} value={value} maxLength={1000} onChange={(x) => setValue(x.target.value)} aria-label="Field value" /></label>
          <label><span className="kicker" style={{ display: 'block', marginBottom: 4 }}>Section</span>
            <input style={input} value={group} maxLength={40} list="profile-groups" onChange={(x) => setGroup(x.target.value)} aria-label="Section" />
            <datalist id="profile-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></label>
          <div className="perm-row">
            <span>Keep it private:</span>
            <button type="button" className="toggle" aria-pressed={priv} onClick={() => setPriv(!priv)}><span className="knob" />Only Abel</button>
          </div>
          <div className="wait-act">
            <button type="submit" className="btn small primary" disabled={!canSave}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn small quiet" onClick={onToggle}>Cancel</button>
            <button type="button" className="btn small quiet" disabled={busy} onClick={async () => { setBusy(true); try { await onRemove(); } finally { setBusy(false); } }}>Remove</button>
          </div>
        </form>
      )}
    </div>
  );
};

/** Bottom sheet for adding one field by hand. */
const AddSheet: React.FC<{ groups: string[]; onClose: () => void; onAdd: (f: { label: string; value: string; group: string; private: boolean }) => Promise<void> }> = ({ groups, onClose, onAdd }) => {
  const [line, setLine] = useState('');
  const [group, setGroup] = useState(DEFAULT_GROUP);
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // One box. "Occupation: Nurse" (a short name before a colon) becomes a named field;
  // anything else ("I'm a nurse in Espoo with two kids") is kept as a note in the customer's own words.
  const m = line.match(/^\s*([^:：]{1,40}?)\s*[:：]\s*(.+?)\s*$/);
  const named = !!m && m[1].trim().split(/\s+/).length <= 4;
  const label = named ? m![1] : '';
  const value = named ? m![2] : line.trim();
  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <form className="sheet" role="dialog" aria-label="Add to your profile" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '82vh', overflowY: 'auto', gap: 12 }}
        onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await onAdd({ label, value, group, private: priv }); } catch (x: any) { setErr(x?.message || 'That didn’t work'); setBusy(false); } }}>
        <div className="sec-title" style={{ padding: 0 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Add to your profile</h3>
          <button type="button" className="btn small quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <label><span className="kicker" style={{ display: 'block', marginBottom: 6 }}>Tell Abel about yourself</span>
          <textarea style={{ ...input, minHeight: 84, resize: 'vertical', fontFamily: 'inherit' }} autoFocus value={line} maxLength={1000} rows={3}
            placeholder="e.g. I’m a nurse in Espoo, living with my partner and our cat. Or: Occupation: Nurse" aria-label="Profile line"
            onChange={(e) => { setLine(e.target.value); setErr(''); }} /></label>
        {line.trim() && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>{named ? `Saved as “${label.trim()}: ${value}”` : 'Saved as a note in your own words'}</p>}
        <label><span className="kicker" style={{ display: 'block', marginBottom: 6 }}>Section</span>
          <input style={input} value={group} maxLength={40} list="profile-groups-add" onChange={(e) => setGroup(e.target.value)} />
          <datalist id="profile-groups-add">{[...new Set([DEFAULT_GROUP, 'Work & income', 'Home & family', ...groups])].map((g) => <option key={g} value={g} />)}</datalist></label>
        <div className="perm-row"><span>Keep it private:</span>
          <button type="button" className="toggle" aria-pressed={priv} onClick={() => setPriv(!priv)}><span className="knob" />Only Abel</button></div>
        {err && <p role="alert" style={{ color: 'var(--bad, #a4352c)', fontSize: 13 }}>{err}</p>}
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>📌 Offers never see your profile. You can undo this straight away.</p>
        <div className="btns">
          <button type="submit" className="btn primary block" disabled={busy || !value.trim()} style={{ minHeight: 44 }}>{busy ? 'Saving…' : 'Add'}</button>
          <button type="button" className="btn quiet block" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
};

/** Bottom sheet for a Markdown import: shows what would be added or changed, saves only what is ticked. */
const ImportSheet: React.FC<{ userId: string; source: string; items: ProfileImportItem[]; onClose: () => void; onDone: () => void }> = ({ userId, source, items, onClose, onDone }) => {
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ added: number; updated: number; undoTokens: string[] } | null>(null);
  const picked = rows.filter((r) => r.on);
  const badge = (r: ProfileImportItem) => (r.action === 'new' ? 'New' : r.action === 'update' ? 'Changes it' : 'Already there');
  const save = async () => {
    setBusy(true); setErr('');
    try { setResult(await applyProfileImport(userId, picked, source)); onDone(); }
    catch (x: any) { setErr(x?.message || 'That didn’t work'); }
    finally { setBusy(false); }
  };
  const undo = async () => {
    if (!result) return;
    setBusy(true);
    try { for (const t of result.undoTokens) await undoCabinetAction(t); onDone(); onClose(); }
    catch { setErr('That can’t be undone any more'); setBusy(false); }
  };
  return (
    <div className="sheet-bg" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-label="Import your profile" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '86vh', overflowY: 'auto', gap: 12 }}>
        <div className="sec-title" style={{ padding: 0 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{result ? 'Profile updated' : 'From your file'}</h3>
          <button className="btn small quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {result ? (
          <>
            <p style={{ margin: 0 }}>{[result.added ? `Added ${result.added}` : '', result.updated ? `updated ${result.updated}` : ''].filter(Boolean).join(' and ').replace(/^./, (c) => c.toUpperCase()) || 'Nothing changed'} ✓</p>
            {err && <p role="alert" style={{ color: 'var(--bad, #a4352c)', fontSize: 13, margin: 0 }}>{err}</p>}
            <div className="btns">
              <button className="btn primary block" onClick={onClose}>Done</button>
              {result.undoTokens.length > 0 && <button className="btn quiet block" disabled={busy} onClick={undo}>Undo</button>}
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>I read “{source}”. Untick anything you’d rather not keep. Nothing is saved until you tap Save.</p>
            <div className="list">
              {rows.map((r, i) => (
                <label key={`${r.key}-${i}`} className="row" style={{ display: 'flex', flexDirection: 'row', gap: 10, alignItems: 'flex-start', cursor: 'pointer', opacity: r.action === 'same' && !r.on ? 0.65 : 1 }}>
                  <input type="checkbox" checked={r.on} onChange={() => setRows(rows.map((x, k) => (k === i ? { ...x, on: !x.on } : x)))} style={{ marginTop: 4 }} aria-label={`Keep ${r.label}`} />
                  <span className="row-txt" style={{ flex: 1 }}>
                    <h4>{r.label} <span className={`npill ${r.action === 'update' ? 'down' : r.action === 'new' ? 'up' : 'grey'}`} style={{ marginLeft: 6 }}>{badge(r)}</span></h4>
                    <p>{r.value}</p>
                    {r.action === 'update' && r.oldValue && <span className="meta">Now: {r.oldValue}</span>}
                    {r.sensitive && <span className="meta warn">Looks private, so it’s not ticked. If you save it, only Abel can read it.</span>}
                  </span>
                </label>
              ))}
            </div>
            {err && <p role="alert" style={{ color: 'var(--bad, #a4352c)', fontSize: 13, margin: 0 }}>{err}</p>}
            <div className="btns">
              <button className="btn primary block" disabled={busy || !picked.length} onClick={save} style={{ minHeight: 44 }}>{busy ? 'Saving…' : `Save ${picked.length} ${picked.length === 1 ? 'thing' : 'things'}`}</button>
              <button className="btn quiet block" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const ProfileSection: React.FC<Props> = ({ userId, entries, onChanged, onToast }) => {
  const fields = entries.filter((e) => e.type === 'profile' && e.status !== 'archived');
  const groups = [...new Set(fields.map((e) => e.profileGroup || DEFAULT_GROUP))];
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [imp, setImp] = useState<{ source: string; items: ProfileImportItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const guard = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (x: any) { onToast(x?.message || 'That didn’t work. Try again.'); }
  };

  const pick = (f: File) => guard(async () => {
    if (f.size > MAX_BYTES) throw new Error('That file is too big. Try one under 200 KB.');
    setBusy(true);
    try {
      const text = await f.text();
      const r = await previewProfileImport(userId, text, f.name);
      setImp({ source: r.source, items: r.items });
    } finally { setBusy(false); }
  });

  return (
    <>
      <Band left="Profile" right={fields.length} />
      <div className="ncard flat" data-testid="profile-card">
        {fields.length === 0 ? (
          <div className="nempty">
            <span className="ne-art" aria-hidden="true"><Icon name="person" /></span>
            <b>Tell Abel who you are</b>
            <p>Add a few facts about yourself, or import a Markdown (.md) file. You decide what stays, and you can change or remove any of it.</p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g}>
              <span className="kicker" style={{ display: 'block', padding: '8px 16px 0' }}>{g}</span>
              <div className="list">
                {fields.filter((e) => (e.profileGroup || DEFAULT_GROUP) === g).map((e) => (
                  <FieldRow key={e.id} e={e} groups={groups} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)}
                    onSave={(f) => guard(async () => { const r = await editProfileField(userId, e.id, f); setOpen(null); onToast('Saved. Abel will use the new answer.', r.undoToken); onChanged(); })}
                    onRemove={() => guard(async () => { const r = await removeProfileField(userId, e.id); setOpen(null); onToast('Removed. It’s kept in your history.', r.undoToken); onChanged(); })} />
                ))}
              </div>
            </div>
          ))
        )}
        <div className="wait-act" style={{ padding: '10px 16px 14px' }}>
          <button className="btn small primary" onClick={() => setAdding(true)}>Add</button>
          <button className="btn small" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Reading…' : 'Import .md'}</button>
          {fields.length > 0 && <a className="btn small quiet" href={profileExportUrl(userId)} download="my-profile.md">Export .md</a>}
          <input ref={file} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden aria-label="Import a Markdown file"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
        </div>
      </div>
      {adding && (
        <AddSheet groups={groups} onClose={() => setAdding(false)}
          onAdd={async (f) => { const r = await addProfileField(userId, f); setAdding(false); onToast(r.created ? '📌 Abel will remember this' : 'You already had that, so I updated it.', r.undoToken); onChanged(); }} />
      )}
      {imp && <ImportSheet userId={userId} source={imp.source} items={imp.items} onClose={() => setImp(null)} onDone={onChanged} />}
    </>
  );
};
