// Коллизии прогулки: окружность (игрок) против отрезков стен с полутолщиной.
import type { Vec2 } from '../model/types';

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
