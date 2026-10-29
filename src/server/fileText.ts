// Turn uploaded files into plain text the AI can read: PDFs (text layer) and spreadsheets (Excel .xlsx, CSV).
// Photos and scanned PDFs have no text and need a model that can read images.

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The text inside a PDF, or '' if it has none (e.g. a scan). */
export async function pdfText(base64: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')));
  return String((await extractText(pdf, { mergePages: true })).text || '').trim();
}

const cell = (v: unknown) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
};

/** An Excel file as text: each sheet, row by row ("a | b | c"), at most `maxRows` rows per sheet. */
export async function xlsxText(base64: string, maxRows = 250): Promise<{ text: string; rows: number; sheets: number }> {
  const { default: readXlsxFile } = await import('read-excel-file/node');
  const sheets = await readXlsxFile(Buffer.from(base64, 'base64'));
  let rows = 0;
  const parts = sheets.map((s: any) => {
    const data: unknown[][] = (s.data || []).filter((r: unknown[]) => r.some((c) => c != null && String(c).trim() !== ''));
    rows += data.length;
    const shown = data.slice(0, maxRows).map((r) => r.map(cell).join(' | '));
    return `Sheet “${s.sheet}” (${data.length} rows${data.length > maxRows ? `, first ${maxRows} shown` : ''}):\n${shown.join('\n')}`;
  });
  return { text: parts.join('\n\n'), rows, sheets: sheets.length };
}

/** CSV as text (kept as is, but at most `maxRows` rows). */
export function csvText(text: string, maxRows = 250) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return { text: lines.slice(0, maxRows).join('\n') + (lines.length > maxRows ? `\n(${lines.length - maxRows} more rows not shown)` : ''), rows: lines.length };
}
