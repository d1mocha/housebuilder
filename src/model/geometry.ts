import type { Vec2 } from './types';

export const EPS = 1e-6;

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const mid = (a: Vec2, b: Vec2): Vec2 => lerp(a, b, 0.5);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** Левая нормаль (-dy, dx). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const eq = (a: Vec2, b: Vec2, tol = 0.5): boolean => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
export const round = (a: Vec2, step = 1): Vec2 => ({ x: Math.round(a.x / step) * step, y: Math.round(a.y / step) * step });
export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;

/** Поворот на угол (градусы) по часовой стрелке в экранных координатах (Y вниз). */
export function rotate(p: Vec2, deg: number): Vec2 {
  const r = deg2rad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Угол вектора в градусах, [0, 360). */
export function angleDeg(a: Vec2): number {
  const d = rad2deg(Math.atan2(a.y, a.x));
  return (d + 360) % 360;
}

/** Параметр проекции точки p на прямую a-b (0 в a, 1 в b). */
export function projectT(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return 0;
  return dot(sub(p, a), ab) / l2;
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; dist: number } {
  const t = Math.max(0, Math.min(1, projectT(p, a, b)));
  const point = lerp(a, b, t);
  return { point, t, dist: dist(p, point) };
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return closestOnSegment(p, a, b).dist;
}

/** Пересечение бесконечных прямых p1+t*d1 и p2+s*d2. */
export function lineIntersection(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const den = cross(d1, d2);
  if (Math.abs(den) < EPS) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, mul(d1, t));
}

/** Пересечение отрезков; возвращает точку и параметры, либо null. */
export function segmentIntersection(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
): { point: Vec2; t: number; s: number } | null {
  const d1 = sub(a2, a1);
  const d2 = sub(b2, b1);
  const den = cross(d1, d2);
  if (Math.abs(den) < EPS) return null;
  const w = sub(b1, a1);
  const t = cross(w, d2) / den;
  const s = cross(w, d1) / den;
  if (t < -EPS || t > 1 + EPS || s < -EPS || s > 1 + EPS) return null;
  return { point: add(a1, mul(d1, t)), t, s };
}

/** Минимальное расстояние между двумя отрезками. */
export function segmentDistance(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
  if (segmentIntersection(a1, a2, b1, b2)) return 0;
  return Math.min(distToSegment(a1, b1, b2), distToSegment(a2, b1, b2), distToSegment(b1, a1, a2), distToSegment(b2, a1, a2));
}

/** Площадь полигона со знаком (мм²). */
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}
export const polygonArea = (poly: Vec2[]): number => Math.abs(signedArea(poly));

export function polygonPerimeter(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += dist(poly[i], poly[(i + 1) % poly.length]);
  return s;
}

export function polylineLength(pts: Vec2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

export function centroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Расстояние от точки до границы полигона. */
export function distToPolygonEdge(p: Vec2, poly: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** Точка гарантированно внутри полигона (центроид либо середина самой длинной горизонтальной хорды). */
export function interiorPoint(poly: Vec2[]): Vec2 {
  const c = centroid(poly);
  if (pointInPolygon(c, poly) && distToPolygonEdge(c, poly) > 50) return c;
  const bb = bbox(poly);
  let best: Vec2 = c;
  let bestW = -1;
  for (let k = 1; k < 16; k++) {
    const y = bb.minY + ((bb.maxY - bb.minY) * k) / 16;
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (w > bestW) {
        bestW = w;
        best = { x: (xs[i] + xs[i + 1]) / 2, y };
      }
    }
  }
  return best;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bbox(pts: Vec2[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function bboxUnion(a: BBox, b: BBox): BBox {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

/** Углы повернутого прямоугольника с центром c, размерами w×d и поворотом deg. */
export function rectCorners(c: Vec2, w: number, d: number, deg: number): Vec2[] {
  const hw = w / 2;
  const hd = d / 2;
  return [v(-hw, -hd), v(hw, -hd), v(hw, hd), v(-hw, hd)].map((p) => add(c, rotate(p, deg)));
}

/** Выпуклая оболочка (Эндрю). */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(sub(lower[lower.length - 1], lower[lower.length - 2]), sub(p, lower[lower.length - 1])) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(sub(upper[upper.length - 1], upper[upper.length - 2]), sub(p, upper[upper.length - 1])) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Расстояние между двумя полигонами (0 при пересечении/вложении). */
export function polygonDistance(a: Vec2[], b: Vec2[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return 0;
  let d = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      d = Math.min(d, segmentDistance(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]));
      if (d === 0) return 0;
    }
  }
  return d;
}

/** Окружность как полигон. */
export function circlePolygon(c: Vec2, r: number, n = 24): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

export const fmtM2 = (mm2: number): number => Math.round((mm2 / 1e6) * 100) / 100;
