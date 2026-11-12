// CSV (разделитель «;», BOM — чтобы Excel корректно открыл кириллицу).
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number): string => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

export function download(filename: string, data: string | Blob | ArrayBuffer, mime = 'text/plain;charset=utf-8'): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s: string): string => s.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'project';
