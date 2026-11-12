// Тени на плане участка: здание, деревья, заборы.
import { itemDef, num, routeDef } from '../catalog/registry';
import type { Prim2 } from '../draw2d/prims';
import { add, circlePolygon, convexHull } from '../model/geometry';
import type { Project, Vec2 } from '../model/types';
import { detectRooms, fromRing, unionPolys } from '../model/walls';
import { shadowVector, sunPosition } from './sun';

/** Полная высота здания, мм. */
export function buildingHeight(p: Project): number {
  let h = 0;
  for (const l of p.levels) h = Math.max(h, l.elevation + l.height + l.slab);
  if (p.roof.type === 'gable' || p.roof.type === 'hip') h += 1500;
  return h;
}

function extrudeShadow(poly: Vec2[], s: Vec2): Vec2[][] {
  const parts: Vec2[][] = [poly, poly.map((q) => add(q, s))];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    parts.push([a, b, add(b, s), add(a, s)]);
  }
  return parts;
}

export function siteShadowPrims(p: Project): Prim2[] {
  const site = p.site;
  if (!site) return [];
  const sun = sunPosition(site.latitude, p.sun.month, p.sun.day, p.sun.hour);
  const polys: Vec2[][] = [];
  const sv = shadowVector(sun, site.north, buildingHeight(p));
  if (!sv) return [];
  const ground = p.levels[0];
  if (ground) for (const o of detectRooms(ground.walls).outline) polys.push(...extrudeShadow(o, sv));
  for (const it of site.items) {
    const def = itemDef(it.kind);
    if (!def) continue;
    const s = def.size(it.params);
    if (s.h < 300) continue;
    const v = shadowVector(sun, site.north, s.h);
    if (!v) continue;
    const r = Math.max(s.w, s.d) / 2;
    const base = circlePolygon({ x: it.x, y: it.y }, r, 12);
    polys.push(convexHull([...base, ...base.map((q) => add(q, v))]));
  }
  for (const r of site.routes) {
    const def = routeDef(r.kind);
    const h = num(r.params, 'h', 0);
    if (!def || h < 300) continue;
    const v = shadowVector(sun, site.north, h);
    if (!v) continue;
    for (let i = 1; i < r.points.length; i++) polys.push([r.points[i - 1], r.points[i], add(r.points[i], v), add(r.points[i - 1], v)]);
  }
  const mp = unionPolys(polys);
  return mp.map((poly): Prim2 => ({ t: 'path', rings: poly.map(fromRing), s: { fill: '#0f172a', stroke: 'none', opacity: 0.16 } }));
}
