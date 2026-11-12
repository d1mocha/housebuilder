// Нейтральные 2D-примитивы: один формат для редактора (SVG), чертежей (PDF) и DXF.
import { add, rotate } from '../model/geometry';
import type { Vec2 } from '../model/types';

export interface Style {
  /** Цвет линии; 'none' — без обводки. */
  stroke?: string;
  /** Толщина линии в мм бумаги. */
  w?: number;
  fill?: string;
  /** Штрих в мм бумаги. */
  dash?: number[];
  opacity?: number;
}

export type Prim2 =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; s?: Style }
  | { t: 'poly'; pts: Vec2[]; closed?: boolean; s?: Style }
  /** Полигон с отверстиями (заливка even-odd). */
  | { t: 'path'; rings: Vec2[][]; s?: Style }
  | { t: 'circle'; cx: number; cy: number; r: number; s?: Style }
  /** Дуга от a0 до a1 (градусы, по возрастанию угла в экранных координатах). */
  | { t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; s?: Style }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      /** Высота шрифта в мм бумаги. */
      size: number;
      anchor?: 'start' | 'middle' | 'end';
      rot?: number;
      color?: string;
      bold?: boolean;
      /** Белая подложка под текстом. */
      halo?: boolean;
    };

export const line = (x1: number, y1: number, x2: number, y2: number, s?: Style): Prim2 => ({ t: 'line', x1, y1, x2, y2, s });
export const poly = (pts: Vec2[], closed = true, s?: Style): Prim2 => ({ t: 'poly', pts, closed, s });
export const rect = (x: number, y: number, w: number, h: number, s?: Style): Prim2 => ({
  t: 'poly',
  pts: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
  closed: true,
  s,
});
export const circle = (cx: number, cy: number, r: number, s?: Style): Prim2 => ({ t: 'circle', cx, cy, r, s });
export const arc = (cx: number, cy: number, r: number, a0: number, a1: number, s?: Style): Prim2 => ({ t: 'arc', cx, cy, r, a0, a1, s });
export const text = (x: number, y: number, str: string, size = 2.5, extra: Partial<Extract<Prim2, { t: 'text' }>> = {}): Prim2 => ({
  t: 'text',
  x,
  y,
  text: str,
  size,
  anchor: 'middle',
  ...extra,
});

export interface Xf {
  tx?: number;
  ty?: number;
  rot?: number;
  scale?: number;
}

/** Применить преобразование: масштаб → поворот → перенос. */
export function transform(prims: Prim2[], xf: Xf): Prim2[] {
  const { tx = 0, ty = 0, rot = 0, scale = 1 } = xf;
  const P = (x: number, y: number): Vec2 => add(rotate({ x: x * scale, y: y * scale }, rot), { x: tx, y: ty });
  return prims.map((p): Prim2 => {
    switch (p.t) {
      case 'line': {
        const a = P(p.x1, p.y1);
        const b = P(p.x2, p.y2);
        return { ...p, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      }
      case 'poly':
        return { ...p, pts: p.pts.map((q) => P(q.x, q.y)) };
      case 'path':
        return { ...p, rings: p.rings.map((r) => r.map((q) => P(q.x, q.y))) };
      case 'circle': {
        const c = P(p.cx, p.cy);
        return { ...p, cx: c.x, cy: c.y, r: p.r * scale };
      }
      case 'arc': {
        const c = P(p.cx, p.cy);
        return { ...p, cx: c.x, cy: c.y, r: p.r * scale, a0: p.a0 + rot, a1: p.a1 + rot };
      }
      case 'text': {
        const c = P(p.x, p.y);
        return { ...p, x: c.x, y: c.y, rot: (p.rot ?? 0) + rot };
      }
    }
  });
}

/** Точки дуги для бэкендов без нативных дуг. */
export function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, step = 6): Vec2[] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** Габариты набора примитивов. */
export function primsBBox(prims: Prim2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ex = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const p of prims) {
    switch (p.t) {
      case 'line':
        ex(p.x1, p.y1);
        ex(p.x2, p.y2);
        break;
      case 'poly':
        p.pts.forEach((q) => ex(q.x, q.y));
        break;
      case 'path':
        p.rings.forEach((r) => r.forEach((q) => ex(q.x, q.y)));
        break;
      case 'circle':
      case 'arc':
        ex(p.cx - p.r, p.cy - p.r);
        ex(p.cx + p.r, p.cy + p.r);
        break;
      case 'text':
        ex(p.x, p.y);
        break;
    }
  }
  return { minX, minY, maxX, maxY };
}
