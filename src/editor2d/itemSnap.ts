// Прилипание объектов к стенам: спинкой к грани стены, боком — к перпендикулярной стене.
import { add, closestOnSegment, dot, mul, norm, perp, sub } from '../model/geometry';
import type { Vec2, Wall } from '../model/types';
import { wallFacingRot } from '../model/walls';

export interface ItemPose {
  x: number;
  y: number;
  rot: number;
}

export function snapItemToWalls(center: Vec2, w: number, d: number, rot: number, walls: Wall[], tol: number): ItemPose & { snapped: boolean } {
  let best: { wall: Wall; q: Vec2; dist: number } | null = null;
  for (const wall of walls) {
    const c = closestOnSegment(center, wall.a, wall.b);
    if (c.t <= 0 || c.t >= 1) continue;
    const gap = c.dist - wall.thickness / 2 - d / 2;
    if (gap < tol && c.dist > 1 && (!best || c.dist < best.dist)) best = { wall, q: c.point, dist: c.dist };
  }
  if (!best) return { x: center.x, y: center.y, rot, snapped: false };
  const u = norm(sub(center, best.q));
  let c = add(best.q, mul(u, best.wall.thickness / 2 + d / 2));
  const newRot = wallFacingRot(best.wall, center);
  const s = perp(u);
  for (const w2 of walls) {
    if (w2 === best.wall) continue;
    const c2 = closestOnSegment(c, w2.a, w2.b);
    if (c2.dist < 1) continue;
    const u2 = norm(sub(c, c2.point));
    if (Math.abs(dot(u2, s)) < 0.9) continue;
    const gap = c2.dist - w2.thickness / 2 - w / 2;
    if (Math.abs(gap) < tol) {
      c = sub(c, mul(u2, gap));
      break;
    }
  }
  return { x: Math.round(c.x), y: Math.round(c.y), rot: newRot, snapped: true };
}
