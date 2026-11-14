// Коллизии прогулки: окружность (игрок) против отрезков стен с полутолщиной.
import { bbox as bboxOf, centroid, distToPolygonEdge, distToSegment, pointInPolygon } from '../model/geometry';
import type { Level, Vec2 } from '../model/types';

export interface CollisionSeg {
  a: Vec2;
  b: Vec2;
  /** Полутолщина стены, мм. */
  h: number;
}

/** Вытолкнуть точку из стен так, чтобы расстояние до оси каждой было ≥ h + radius. */
export function resolveCollisions(p: Vec2, segs: CollisionSeg[], radius: number): Vec2 {
  let x = p.x;
  let y = p.y;
  for (let iter = 0; iter < 3; iter++) {
    for (const s of segs) {
      const abx = s.b.x - s.a.x;
      const aby = s.b.y - s.a.y;
      const l2 = abx * abx + aby * aby;
      let t = l2 > 0 ? ((x - s.a.x) * abx + (y - s.a.y) * aby) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = s.a.x + abx * t;
      const cy = s.a.y + aby * t;
      let dx = x - cx;
      let dy = y - cy;
      let d = Math.hypot(dx, dy);
      const min = s.h + radius;
      if (d < min) {
        if (d < 1e-3) {
          const l = Math.sqrt(l2) || 1;
          dx = -aby / l;
          dy = abx / l;
          d = 1;
        }
        x = cx + (dx / d) * min;
        y = cy + (dy / d) * min;
      }
    }
  }
  return { x, y };
}

// ───────── Точка старта прогулки ─────────


export interface WalkStart {
  pos: Vec2;
  /** Поворот камеры вокруг вертикали: вперёд = (−sin yaw, −cos yaw) в координатах (X, Z). */
  yaw: number;
  /** Свободный радиус вокруг точки, мм. */
  clearance: number;
}

function distToPolygon(p: Vec2, poly: Vec2[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/**
 * Старт прогулки: точка самого большого помещения с максимальным свободным радиусом
 * (до стен и до контуров мебели), взгляд — к центру помещения.
 */
export function walkStart(level: Level, obstacles: Vec2[][] = []): WalkStart {
  const room = [...level.rooms].sort((a, b) => b.area - a.area)[0];
  if (!room || room.polygon.length < 3) {
    const pts = level.walls.flatMap((w) => [w.a, w.b]);
    if (!pts.length) return { pos: { x: 0, y: 0 }, yaw: 0, clearance: 0 };
    const bb = bboxOf(pts);
    return { pos: { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }, yaw: 0, clearance: 0 };
  }
  const bb = bboxOf(room.polygon);
  const c = centroid(room.polygon);
  const step = Math.max(100, Math.min(250, Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY) / 12));
  const near = obstacles.filter((o) => o.some((q) => q.x > bb.minX - 500 && q.x < bb.maxX + 500 && q.y > bb.minY - 500 && q.y < bb.maxY + 500));
  let best: Vec2 = room.seed;
  let bestClear = -1;
  let bestToCenter = Infinity;
  for (let x = bb.minX + step / 2; x < bb.maxX; x += step) {
    for (let y = bb.minY + step / 2; y < bb.maxY; y += step) {
      const p = { x, y };
      if (!pointInPolygon(p, room.polygon)) continue;
      let clear = distToPolygonEdge(p, room.polygon);
      for (const o of near) {
        if (clear <= bestClear - 1) break;
        clear = Math.min(clear, distToPolygon(p, o));
      }
      const toC = Math.hypot(x - c.x, y - c.y);
      // при равном просторе — ближе к центру помещения
      if (clear > bestClear + 1 || (Math.abs(clear - bestClear) <= 1 && toC < bestToCenter)) {
        bestClear = clear;
        best = p;
        bestToCenter = toC;
      }
    }
  }
  // взгляд к центру помещения; если стоим почти в центре — к самой дальней вершине
  let target = c;
  if (Math.hypot(c.x - best.x, c.y - best.y) < 400) {
    let far = 0;
    for (const q of room.polygon) {
      const d = Math.hypot(q.x - best.x, q.y - best.y);
      if (d > far) {
        far = d;
        target = q;
      }
    }
  }
  const dx = target.x - best.x;
  const dz = target.y - best.y;
  return { pos: { x: Math.round(best.x), y: Math.round(best.y) }, yaw: Math.atan2(-dx, -dz), clearance: Math.max(0, bestClear) };
}
