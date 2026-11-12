// Привязки: узлы → оси стен → угловые лучи → направляющие → сетка.
import { add, closestOnSegment, deg2rad, dist, dot, lineIntersection, mul, sub } from '../model/geometry';
import type { Vec2, Wall } from '../model/types';

export interface SnapCtx {
  walls: Wall[];
  /** Дополнительные точки привязки (углы помещений, центры объектов…). */
  points?: Vec2[];
  /** Шаг сетки, 0 — выключена. */
  grid: number;
  /** Точка, от которой отсчитываются угловые лучи (предыдущая точка стены/трассы). */
  from?: Vec2 | null;
  /** Привязка к углам, кратным 45°. */
  angle: boolean;
  /** Допуск в мм модели. */
  tol: number;
  excludeWalls?: Set<string>;
  /** Узлы, которые нужно игнорировать (перетаскиваемые). */
  excludePoints?: Vec2[];
}

export interface SnapResult {
  point: Vec2;
  kind: 'node' | 'wall' | 'angle' | 'guide' | 'grid' | 'none';
  guides: { a: Vec2; b: Vec2 }[];
}

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

export function snapPoint(raw: Vec2, ctx: SnapCtx): SnapResult {
  const { tol } = ctx;
  const walls = ctx.walls.filter((w) => !ctx.excludeWalls?.has(w.id));
  const excluded = (p: Vec2) => ctx.excludePoints?.some((q) => dist(p, q) < 1) ?? false;

  // 1. Узлы и точки
  const nodes: Vec2[] = [];
  for (const w of walls) {
    if (!excluded(w.a)) nodes.push(w.a);
    if (!excluded(w.b)) nodes.push(w.b);
  }
  if (ctx.points) nodes.push(...ctx.points);
  let best: Vec2 | null = null;
  let bestD = tol;
  for (const n of nodes) {
    const d = dist(raw, n);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  if (best) return { point: { x: best.x, y: best.y }, kind: 'node', guides: [] };

  const guides: { a: Vec2; b: Vec2 }[] = [];

  // 2. Угловой луч от предыдущей точки
  let ray: { o: Vec2; d: Vec2 } | null = null;
  if (ctx.from && ctx.angle) {
    const v = sub(raw, ctx.from);
    const L = Math.hypot(v.x, v.y);
    if (L > 1) {
      const ang = Math.atan2(v.y, v.x);
      const stepRad = deg2rad(45);
      const snapped = Math.round(ang / stepRad) * stepRad;
      const d = { x: Math.cos(snapped), y: Math.sin(snapped) };
      const proj = dot(v, d);
      const off = Math.abs(v.x * d.y - v.y * d.x);
      if (off < Math.max(tol, L * 0.07) && proj > 0) ray = { o: ctx.from, d };
    }
  }

  // 3. Оси стен
  let wallHit: { wall: Wall; point: Vec2 } | null = null;
  let wd = tol;
  for (const w of walls) {
    const c = closestOnSegment(raw, w.a, w.b);
    if (c.dist < wd) {
      wd = c.dist;
      wallHit = { wall: w, point: c.point };
    }
  }

  if (ray) {
    let p = add(ray.o, mul(ray.d, dot(sub(raw, ray.o), ray.d)));
    let kind: SnapResult['kind'] = 'angle';
    guides.push({ a: ray.o, b: p });
    // пересечение луча с осью стены
    if (wallHit) {
      const i = lineIntersection(ray.o, ray.d, wallHit.wall.a, sub(wallHit.wall.b, wallHit.wall.a));
      if (i && dist(i, p) < tol * 2) {
        return { point: i, kind: 'wall', guides };
      }
    }
    // выравнивание по узлам (направляющие) вдоль луча
    let aligned = false;
    for (const n of nodes) {
      for (const axis of ['x', 'y'] as const) {
        if (Math.abs(ray.d[axis]) < 0.01) continue;
        const t = (n[axis] - ray.o[axis]) / ray.d[axis];
        if (t <= 0) continue;
        const q = add(ray.o, mul(ray.d, t));
        if (dist(q, p) < tol && dist(q, n) > 1) {
          p = q;
          kind = 'guide';
          guides.push({ a: n, b: q });
          aligned = true;
          break;
        }
      }
      if (aligned) break;
    }
    if (!aligned && ctx.grid > 0) {
      const len = roundTo(dot(sub(p, ray.o), ray.d), ctx.grid);
      p = add(ray.o, mul(ray.d, len));
    }
    return { point: p, kind, guides };
  }

  if (wallHit) return { point: wallHit.point, kind: 'wall', guides };

  // 4. Направляющие по X/Y через узлы
  let p = { ...raw };
  let kind: SnapResult['kind'] = 'none';
  let gx: Vec2 | null = null;
  let gy: Vec2 | null = null;
  let dx = tol;
  let dy = tol;
  for (const n of nodes) {
    const ex = Math.abs(raw.x - n.x);
    const ey = Math.abs(raw.y - n.y);
    if (ex < dx) {
      dx = ex;
      gx = n;
    }
    if (ey < dy) {
      dy = ey;
      gy = n;
    }
  }
  if (gx) {
    p.x = gx.x;
    kind = 'guide';
  } else if (ctx.grid > 0) p.x = roundTo(p.x, ctx.grid);
  if (gy) {
    p.y = gy.y;
    kind = 'guide';
  } else if (ctx.grid > 0) p.y = roundTo(p.y, ctx.grid);
  if (gx) guides.push({ a: gx, b: p });
  if (gy) guides.push({ a: gy, b: p });
  if (kind === 'none' && ctx.grid > 0) kind = 'grid';
  return { point: p, kind, guides };
}
