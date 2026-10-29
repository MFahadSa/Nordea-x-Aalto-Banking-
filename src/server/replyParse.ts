// Free models sometimes write a tool call as text instead of calling the tool. These helpers find
// such calls in the text, so the app can still run them (and never shows them to the customer).
import { ToolCall } from './llm.js';

/** Every complete {...} block in the text, with where it starts and ends. */
function jsonBlocks(s: string): { start: number; end: number; value: any }[] {
  const out: { start: number; end: number; value: any }[] = [];
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { out.push({ start: i, end: j + 1, value: JSON.parse(s.slice(i, j + 1)) }); i = j; } catch { /* not JSON */ }
        break;
      }
    }
  }
  return out;
}

const KV_KEYS = 'couldHelp|suggestions|text|topic|usedEntryIds';
const KV_LINE = new RegExp(`^\\s*(?:[-*]\\s*)?["']?(${KV_KEYS})["']?\\s*[:=]\\s*(.*)$`, 'i');

/**
 * finishReply's fields written as lines, e.g.
 *   couldHelp: true
 *   suggestions: ["Check my budget"]
 *   text: I've changed the target…
 * Returns the text before those lines and the fields, or null.
 */
export function kvReplyIn(t: string): { before: string; fields: Record<string, any> } | null {
  const lines = String(t || '').split('\n');
  const first = lines.findIndex((l) => KV_LINE.test(l));
  if (first < 0) return null;
  const fields: Record<string, any> = {};
  let key = '';
  let count = 0;
  for (let i = first; i < lines.length; i++) {
    const m = lines[i].match(KV_LINE);
    if (m) {
      key = m[1].toLowerCase();
      count++;
      const v = m[2].trim();
      try { fields[key] = JSON.parse(v); } catch { fields[key] = v.replace(/^["']|["']$/g, ''); }
    } else if (key === 'text' && lines[i].trim()) fields.text = `${fields.text}\n${lines[i]}`;
  }
  // One stray "usedEntryIds: []" counts too; otherwise require two of the keys, so a normal sentence like
  // "Topic: your flat" isn't mistaken for it.
  const only = Object.keys(fields);
  if (count < 2 && !only.some((k) => k === 'usedentryids' || k === 'couldhelp')) return null;
  const norm: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) norm[{ couldhelp: 'couldHelp', usedentryids: 'usedEntryIds' }[k] || k] = v;
  return { before: lines.slice(0, first).join('\n').trim(), fields: norm };
}

/**
 * Tool calls written as text: {"name":"getSpending","arguments":{…}}, <function=x>{…}</function>,
 * finishReply's arguments as JSON ({"text":…,"topic":…}) or as lines (see kvReplyIn).
 * Returns the calls and the text that's left once they're taken out.
 */
export function callsInText(text: string, toolNames: string[], only?: { name: string; required: string[] }): { calls: ToolCall[]; rest: string } {
  const names = new Set(toolNames);
  let s = String(text || '').replace(/```(?:json)?/gi, '');
  const calls: ToolCall[] = [];
  let n = 0;
  const id = () => `text_call_${n++}`;

  // <function=name>{...}</function> (Llama style)
  s = s.replace(/<function=([\w.-]+)>\s*(\{[\s\S]*?\})\s*<\/function>/g, (all, name, json) => {
    const nm = closestTool(name, toolNames);
    if (!nm) return all;
    try { calls.push({ id: id(), name: nm, args: JSON.parse(json) }); return ''; } catch { return all; }
  });
  // Qwen style: <tool_call><function=name><parameter=key>value</parameter>…</function></tool_call>
  s = s.replace(/(?:<tool_call>\s*)?<function=([\w.-]+)>([\s\S]*?)(?:<\/function>|$)(?:\s*<\/tool_call>)?/g, (all, name, body) => {
    const nm = closestTool(name, toolNames);
    if (!nm || !/<parameter=/.test(body)) return all;
    const args: Record<string, any> = {};
    for (const m of body.matchAll(/<parameter=([\w.-]+)>\s*([\s\S]*?)\s*(?:<\/parameter>|(?=<parameter=)|$)/g)) {
      const v = m[2].trim();
      if (/^(true|false)$/i.test(v)) args[m[1]] = v.toLowerCase() === 'true';
      else if (/^-?\d+(\.\d+)?$/.test(v)) args[m[1]] = Number(v);
      else if (/^[[{]/.test(v)) { try { args[m[1]] = JSON.parse(v); } catch { args[m[1]] = v; } }
      else args[m[1]] = v;
    }
    calls.push({ id: id(), name: nm, args });
    return '';
  });
  s = s.replace(/<\/?tool_call>/g, '');

  const cut: [number, number][] = [];
  for (const b of jsonBlocks(s)) {
    const v = b.value;
    if (!v || typeof v !== 'object') continue;
    const name = v.name || v.function?.name || v.tool;
    const args = v.arguments ?? v.parameters ?? v.args ?? v.function?.arguments;
    const nm = typeof name === 'string' ? closestTool(name, toolNames) : undefined;
    if (nm && (args === undefined || typeof args === 'object' || typeof args === 'string')) {
      const name = nm;
      let a = args;
      if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
      calls.push({ id: id(), name, args: a && typeof a === 'object' ? a : {} });
      cut.push([b.start, b.end]);
    } else if (only && only.required.length && only.required.every((k) => k in v)) {
      // Only one tool was offered and this is its arguments, written out.
      calls.push({ id: id(), name: only.name, args: v });
      cut.push([b.start, b.end]);
    } else if (names.has('finishReply') && typeof v.text === 'string' && v.text.trim() && ('topic' in v || 'suggestions' in v || 'couldHelp' in v || 'usedEntryIds' in v)) {
      calls.push({ id: id(), name: 'finishReply', args: v });
      cut.push([b.start, b.end]);
    }
  }
  for (const [a, b] of cut.reverse()) s = s.slice(0, a) + s.slice(b);

  if (names.has('finishReply') && !calls.some((c) => c.name === 'finishReply')) {
    const kv = kvReplyIn(s);
    if (kv) {
      // The words before the fields are what the model meant to say; the fields' own text is a re-wording.
      const t = kv.before.length >= 15 ? kv.before : String(kv.fields.text || kv.before || '');
      if (t.trim()) {
        calls.push({ id: id(), name: 'finishReply', args: { ...kv.fields, text: t } });
        s = '';
      } else s = kv.before;
    }
  }
  return { calls, rest: s.replace(/\n{3,}/g, '\n\n').trim() };
}

/** The offered tool a (sometimes misspelled) name means: "proposeCabyrinthChange" → "proposeCabinetChange". */
export function closestTool(name: string, toolNames: string[]): string | undefined {
  if (toolNames.includes(name)) return name;
  const lc = name.toLowerCase();
  let best: { t: string; d: number } | undefined;
  for (const t of toolNames) {
    const d = editDistance(lc, t.toLowerCase());
    if (d <= Math.max(2, Math.floor(t.length / 4)) && (!best || d < best.d)) best = { t, d };
  }
  return best?.t;
}
function editDistance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Text that is (part of) a tool call or code, never something to show a customer. */
export function looksLikeCode(t: string): boolean {
  return /<\/?(tool_call|function|parameter)\b|<function=|\{\s*"(name|arguments|function|parameters|tool)"\s*:|^\s*\{\s*("|$)|^\s*\[\s*[{"]/m.test(String(t || ''));
}
