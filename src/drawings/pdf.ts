// PDF-бэкенд: векторная отрисовка листов через jsPDF со встроенным шрифтом DejaVu Sans (кириллица).
import { jsPDF } from 'jspdf';
import { rotate } from '../model/geometry';
import type { Prim2, Style } from '../draw2d/prims';
import { arcPoints } from '../draw2d/prims';
import type { Sheet } from './sheet';

export interface PdfFonts {
  /** TTF в base64. */
  regular: string;
  bold?: string;
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyStyle(doc: jsPDF, s: Style | undefined, closed: boolean): 'S' | 'F' | 'DF' | null {
  const stroke = s?.stroke ?? '#111827';
  const hasStroke = stroke !== 'none';
  const hasFill = closed && !!s?.fill && s.fill !== 'none';
  if (hasStroke) {
    doc.setDrawColor(...hexRgb(stroke));
    doc.setLineWidth(s?.w ?? 0.25);
    doc.setLineDashPattern(s?.dash ?? [], 0);
  }
  if (hasFill) doc.setFillColor(...hexRgb(s!.fill!));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = doc as any;
  d.setGState(new d.GState({ opacity: s?.opacity ?? 1, 'stroke-opacity': s?.opacity ?? 1 }));
  if (hasStroke && hasFill) return 'DF';
  if (hasFill) return 'F';
  if (hasStroke) return 'S';
  return null;
}

function drawPrim(doc: jsPDF, p: Prim2, hasBold: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = doc as any;
  switch (p.t) {
    case 'line': {
      if (applyStyle(doc, p.s, false)) doc.line(p.x1, p.y1, p.x2, p.y2);
      break;
    }
    case 'poly': {
      const mode = applyStyle(doc, p.s, !!p.closed);
      if (!mode || p.pts.length < 2) break;
      d.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < p.pts.length; i++) d.lineTo(p.pts[i].x, p.pts[i].y);
      if (p.closed) d.close();
      if (mode === 'DF') d.fillStroke();
      else if (mode === 'F') d.fill();
      else d.stroke();
      break;
    }
    case 'path': {
      const mode = applyStyle(doc, p.s, true);
      if (!mode) break;
      for (const r of p.rings) {
        if (r.length < 3) continue;
        d.moveTo(r[0].x, r[0].y);
        for (let i = 1; i < r.length; i++) d.lineTo(r[i].x, r[i].y);
        d.close();
      }
      if (mode === 'DF') d.fillStrokeEvenOdd();
      else if (mode === 'F') d.fillEvenOdd();
      else d.stroke();
      break;
    }
    case 'circle': {
      const mode = applyStyle(doc, p.s, true);
      if (mode) doc.circle(p.cx, p.cy, p.r, mode);
      break;
    }
    case 'arc': {
      if (!applyStyle(doc, p.s, false)) break;
      const pts = arcPoints(p.cx, p.cy, p.r, p.a0, p.a1);
      d.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) d.lineTo(pts[i].x, pts[i].y);
      d.stroke();
      break;
    }
    case 'text': {
      d.setGState(new d.GState({ opacity: 1 }));
      doc.setFont('DejaVu', p.bold && hasBold ? 'bold' : 'normal');
      doc.setFontSize(p.size * 2.8346);
      const w = doc.getTextWidth(p.text);
      const rot = p.rot ?? 0;
      const ax = p.anchor === 'start' ? 0 : p.anchor === 'end' ? -w : -w / 2;
      const off = rotate({ x: ax, y: p.size * 0.35 }, rot);
      if (p.halo) {
        const pad = p.size * 0.2;
        const c = [
          { x: ax - pad, y: -p.size * 0.55 },
          { x: ax + w + pad, y: -p.size * 0.55 },
          { x: ax + w + pad, y: p.size * 0.55 },
          { x: ax - pad, y: p.size * 0.55 },
        ].map((q) => rotate(q, rot));
        doc.setFillColor(255, 255, 255);
        d.moveTo(p.x + c[0].x, p.y + c[0].y);
        for (let i = 1; i < 4; i++) d.lineTo(p.x + c[i].x, p.y + c[i].y);
        d.close();
        d.fill();
      }
      doc.setTextColor(...hexRgb(p.color ?? '#111827'));
      doc.text(p.text, p.x + off.x, p.y + off.y, { angle: -rot });
      break;
    }
  }
}

/** Собрать PDF из листов. Возвращает объект jsPDF (вызывающий сам сохраняет или получает ArrayBuffer). */
export function sheetsToPdf(sheets: Sheet[], fonts: PdfFonts): jsPDF {
  if (!sheets.length) throw new Error('no sheets');
  const first = sheets[0];
  const doc = new jsPDF({ unit: 'mm', format: [first.w, first.h], orientation: first.w > first.h ? 'landscape' : 'portrait', compress: true });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  if (fonts.bold) {
    doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
    doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  }
  sheets.forEach((sh, i) => {
    if (i > 0) doc.addPage([sh.w, sh.h], sh.w > sh.h ? 'landscape' : 'portrait');
    for (const p of sh.prims) drawPrim(doc, p, !!fonts.bold);
  });
  return doc;
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

let fontCache: Promise<PdfFonts> | null = null;

/** Лениво загрузить шрифты (в браузере). */
export function loadPdfFonts(): Promise<PdfFonts> {
  if (!fontCache) {
    fontCache = (async () => {
      const [reg, bold] = await Promise.all([import('dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'), import('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url')]);
      const [a, b] = await Promise.all([fetch(reg.default).then((r) => r.arrayBuffer()), fetch(bold.default).then((r) => r.arrayBuffer())]);
      return { regular: bufToBase64(a), bold: bufToBase64(b) };
    })();
  }
  return fontCache;
}
