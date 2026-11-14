// Постановка нового объекта на план: сетка, прилипание мебели спинкой к стене, инженерных точек — к грани стены.
import { itemDef } from '../catalog/registry';
import { itemSize } from '../draw2d/plan';
import { add, mul, norm, sub } from '../model/geometry';
import { makeItem } from '../model/ops';
import type { Item, Level, Vec2 } from '../model/types';
import { geomOf, locateOnWall, wallFacingRot } from '../model/walls';
import { snapItemToWalls } from './itemSnap';

/** Объект вида kind в точке raw (мм) с учётом привязок. Объекты участка и потолочные к стенам не липнут. */
export function poseNewItem(level: Level, kind: string, raw: Vec2, params: Item['params'] = {}, opts: { rot?: number; grid?: number; site?: boolean } = {}): Item {
  const def = itemDef(kind);
  const it = makeItem(kind, raw, opts.rot ?? 0, level, params);
  const s = itemSize(it);
  const g = opts.grid && opts.grid > 0 ? opts.grid : 1;
  it.x = Math.round(raw.x / g) * g;
  it.y = Math.round(raw.y / g) * g;
  if (opts.site) return it;
  if (def?.mount === 'wall' || !def) {
    const sn = snapItemToWalls(raw, s.w, s.d, it.rot, geomOf(level).walls, 250);
    if (sn.snapped) Object.assign(it, { x: sn.x, y: sn.y, rot: sn.rot });
  } else if (def.layer !== 'furniture' && def.mount !== 'ceiling') {
    // инженерные точки липнут к грани стены
    const hit = locateOnWall(level, raw, 200);
    if (hit && hit.dist > 1) {
      const u = norm(sub(raw, hit.point));
      const c = add(hit.point, mul(u, hit.seg.thickness / 2));
      Object.assign(it, { x: Math.round(c.x), y: Math.round(c.y), rot: wallFacingRot(hit.seg, raw) });
    }
  }
  return it;
}
