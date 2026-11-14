// Геометрические отношения для индикаторов: прямой угол, параллельность, углы.
import { add, closestOnSegment, cross, dist, dot, mul, norm, rad2deg, rotate, sub } from './geometry';
import type { Vec2, Wall } from './types';

export interface RightAngle {
  /** Вершина прямого угла. */
  at: Vec2;
  /** Единичные направления двух сторон угла от вершины. */
  u: Vec2;
  v: Vec2;
}

export interface SegRelations {
  /** Прямые углы в концах отрезка с примыкающими стенами. */
  right: RightAngle[];
  /** Ближайшая параллельная стена (не лежащая на той же прямой). */
  parallel: { wall: Wall; dist: number } | null;
  /** Абсолютный угол отрезка, 0..360 (0 — вправо, по часовой стрелке на экране). */
  angle: number;
  /** Угол к стене, примыкающей в начале отрезка, 0..180; null — нет примыкания. */
  rel: number | null;
}

const sinTol = (deg: number) => Math.sin((deg * Math.PI) / 180);

/** Отношения отрезка a→b (рисуемая или перемещаемая стена) к остальным стенам. */
export function segRelations(a: Vec2, b: Vec2, walls: Wall[], exclude: Set<string> = new Set(), tolDeg = 0.6): SegRelations {
  const L = dist(a, b);
  const d = norm(sub(b, a));
  let ang = rad2deg(Math.atan2(d.y, d.x));
  ang = ((ang % 360) + 360) % 360;
  const out: SegRelations = { right: [], parallel: null, angle: Math.round(ang * 10) / 10, rel: null };
  if (L < 1) return out;
  const st = sinTol(tolDeg);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  for (const w of walls) {
    if (exclude.has(w.id)) continue;
    const wl = dist(w.a, w.b);
    if (wl < 1) continue;
    const wd = norm(sub(w.b, w.a));
    // примыкание в концах отрезка
    for (const [p, dirOut] of [
      [a, d],
      [b, mul(d, -1)],
    ] as [Vec2, Vec2][]) {
      let v: Vec2 | null = null;
      if (dist(p, w.a) < 2) v = wd;
      else if (dist(p, w.b) < 2) v = mul(wd, -1);
      else {
        const c = closestOnSegment(p, w.a, w.b);
        if (c.dist < 2 && c.t > 0 && c.t < 1) v = wd;
      }
      if (!v) continue;
      const cs = dot(dirOut, v);
      if (Math.abs(cs) < st && !out.right.some((r) => dist(r.at, p) < 1)) out.right.push({ at: p, u: dirOut, v });
      if (p === a && out.rel === null) out.rel = Math.round(rad2deg(Math.acos(Math.max(-1, Math.min(1, cs)))) * 10) / 10;
    }
    // параллельность
    if (Math.abs(cross(d, wd)) < st) {
      const off = Math.abs(cross(sub(mid, w.a), wd));
      if (off < 1) continue; // та же прямая
      // стены должны «видеть» друг друга: проекция середины попадает на стену (с запасом)
      const t = dot(sub(mid, w.a), wd);
      if (t < -L / 2 || t > wl + L / 2) continue;
      if (!out.parallel || off < out.parallel.dist) out.parallel = { wall: w, dist: off };
    }
  }
  return out;
}

/** Параллелен ли объект (его ось ширины) ближайшей стене; 'perp' — перпендикулярен; null — нет. */
export function itemWallRelation(pos: Vec2, rot: number, walls: Wall[], maxDist = 1500, tolDeg = 0.6): { kind: 'parallel' | 'perp'; wall: Wall } | null {
  let best: { wall: Wall; d: number } | null = null;
  for (const w of walls) {
    const c = closestOnSegment(pos, w.a, w.b);
    if (c.dist <= maxDist && (!best || c.dist < best.d)) best = { wall: w, d: c.dist };
  }
  if (!best) return null;
  const ax = rotate({ x: 1, y: 0 }, rot);
  const wd = norm(sub(best.wall.b, best.wall.a));
  const st = sinTol(tolDeg);
  if (Math.abs(cross(ax, wd)) < st) return { kind: 'parallel', wall: best.wall };
  if (Math.abs(dot(ax, wd)) < st) return { kind: 'perp', wall: best.wall };
  return null;
}

/** Точки значка прямого угла (квадратик со стороной size) в вершине. */
export function rightAngleMark(r: RightAngle, size: number): Vec2[] {
  const p1 = add(r.at, mul(r.u, size));
  const p2 = add(p1, mul(r.v, size));
  const p3 = add(r.at, mul(r.v, size));
  return [p1, p2, p3];
}
