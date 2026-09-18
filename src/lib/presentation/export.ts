import type { ProfileRecord } from '../scoring/types';

// Flattens nested data into "path,value" rows; arrays of primitives join with " | ".
export function flatten(value: unknown, prefix = '', out: [string, string][] = []): [string, string][] {
  if (value === null || typeof value !== 'object') {
    out.push([prefix, value === null || value === undefined ? '' : String(value)]);
  } else if (Array.isArray(value) && value.every((v) => v === null || typeof v !== 'object')) {
    out.push([prefix, value.join(' | ')]);
  } else {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(profile: ProfileRecord): string {
  const rows = [['field', 'value'], ...flatten(profile)];
  // BOM so Excel opens the Chinese text as UTF-8.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
