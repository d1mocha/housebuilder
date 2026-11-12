// Генераторы 2D-примитивов плана из модели (координаты — мм модели).
// Параметр k — сколько мм модели приходится на 1 мм бумаги (для выносов, засечек, отступов текста).
import { itemDef, routeDef, zoneDef } from '../catalog/registry';
import type { Prim3, Size3 } from '../catalog/registry';
import { add, angleDeg, centroid, dist, interiorPoint, mid, mul, norm, perp, polygonArea, polylineLength, sub } from '../model/geometry';
import type { Dim, Item, Level, Opening, Room, Route, Site, Vec2, Wall, Zone } from '../model/types';
import { differencePolys, fromRing, openingGeom, unionPolys, wallPolygon } from '../model/walls';
import type { Prim2, Style } from './prims';
import { arcPoints, circle, line, poly, text, transform } from './prims';

export const COL = {
  wallBearing: '#3d4756',
  wall: '#a3acb8',
  wallStroke: '#1f2937',
  opening: '#1f2937',
  room: '#334155',
  dim: '#2563eb',
  item: '#475569',
  select: '#f97316',
};

const fmtArea = (m2: number) => m2.toFixed(2).replace('.', ',');

/** Осветлить цвет #rrggbb. */
export function tint(hex: string, amount = 0.6): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v + (255 - v) * amount);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ───────── Стены ─────────

export function wallsPrims(walls: Wall[], openings: Opening[], mono = false): Prim2[] {
  const out: Prim2[] = [];
  const byId = new Map(walls.map((w) => [w.id, w]));
  const cuts: Vec2[][] = [];
  for (const o of openings) {
    const w = byId.get(o.wallId);
    if (w) cuts.push(openingGeom(o, w).quad);
  }
  const groups: [Wall[], string][] = [
    [walls.filter((w) => !w.loadBearing), mono ? '#c9cdd3' : COL.wall],
    [walls.filter((w) => w.loadBearing), mono ? '#555b66' : COL.wallBearing],
  ];
  for (const [group, fill] of groups) {
    if (!group.length) continue;
    const mp = differencePolys(unionPolys(group.map((w) => wallPolygon(w, walls))), cuts);
    for (const p of mp) out.push({ t: 'path', rings: p.map(fromRing), s: { fill, stroke: COL.wallStroke, w: 0.35 } });
  }
  return out;
}

// ───────── Проёмы ─────────

export function openingPrims(o: Opening, wall: Wall): Prim2[] {
  const g = openingGeom(o, wall);
  const h = wall.thickness / 2;
  const n = g.normal;
  const s: Style = { stroke: COL.opening, w: 0.25 };
  const out: Prim2[] = [];
  const jamb = (p: Vec2) => {
    const a = add(p, mul(n, h));
    const b = add(p, mul(n, -h));
    out.push(line(a.x, a.y, b.x, b.y, { stroke: COL.wallStroke, w: 0.35 }));
  };
  jamb(g.p1);
  jamb(g.p2);
  if (o.kind === 'window') {
    const q = [add(g.p1, mul(n, h)), add(g.p2, mul(n, h)), add(g.p2, mul(n, -h)), add(g.p1, mul(n, -h))];
    out.unshift(poly(q, true, { fill: '#ffffff', stroke: COL.wallStroke, w: 0.25 }));
    for (const k of [-0.18, 0.18]) {
      const a = add(g.p1, mul(n, h * 2 * k));
      const b = add(g.p2, mul(n, h * 2 * k));
      out.push(line(a.x, a.y, b.x, b.y, { stroke: '#0ea5e9', w: 0.25 }));
    }
    return out;
  }
  if (o.kind === 'portal') {
    for (const k of [1, -1]) {
      const a = add(g.p1, mul(n, h * k));
      const b = add(g.p2, mul(n, h * k));
      out.push(line(a.x, a.y, b.x, b.y, { stroke: COL.opening, w: 0.18, dash: [1.5, 1] }));
    }
    return out;
  }
  // дверь
  const sign = o.swing === 'L' ? 1 : -1;
  const leaf = (hinge: Vec2, other: Vec2, width: number) => {
    const hf = add(hinge, mul(n, sign * h));
    const of = add(hf, mul(norm(sub(other, hinge)), width));
    const end = add(hf, mul(n, sign * width));
    out.push(line(hf.x, hf.y, end.x, end.y, { stroke: COL.opening, w: 0.4 }));
    const a0 = angleDeg(sub(of, hf));
    let d = angleDeg(sub(end, hf)) - a0;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    out.push({ t: 'poly', pts: arcPoints(hf.x, hf.y, width, a0, a0 + d), closed: false, s });
  };
  if (o.style === 'sliding') {
    const off = sign * (h + 40);
    const a = add(g.p1, mul(n, off));
    const b = add(g.p2, mul(n, off));
    const c = add(b, mul(g.dir, o.width * 0.9));
    out.push(line(a.x, a.y, b.x, b.y, { stroke: COL.opening, w: 0.5 }));
    out.push(line(b.x, b.y, c.x, c.y, { stroke: COL.opening, w: 0.18, dash: [1, 1] }));
  } else if (o.style === 'double') {
    leaf(g.p1, g.p2, o.width / 2);
    leaf(g.p2, g.p1, o.width / 2);
  } else {
    const hinge = o.hinge === 'a' ? g.p1 : g.p2;
    const other = o.hinge === 'a' ? g.p2 : g.p1;
    leaf(hinge, other, o.width);
  }
  return out;
}

// ───────── Помещения ─────────

export function roomFillPrim(room: Room, color: string): Prim2 {
  return poly(room.polygon, true, { fill: color, stroke: 'none', opacity: 0.35 });
}

export function roomLabelPrims(room: Room, k: number): Prim2[] {
  const c = room.seed;
  return [
    text(c.x, c.y - 1.2 * k, room.name, 3, { color: COL.room, bold: true, halo: true }),
    text(c.x, c.y + 3 * k, `${fmtArea(room.area)} м²`, 2.6, { color: COL.room, halo: true }),
  ];
}

// ───────── Объекты ─────────

const symbolCache = new Map<string, Prim2[]>();

function partsToPrims(parts: Prim3[], s: Size3): Prim2[] {
  const sorted = [...parts].sort((a, b) => topZ(a) - topZ(b));
  const out: Prim2[] = [];
  const ox = -s.w / 2;
  const oy = -s.d / 2;
  for (const p of sorted) {
    const st: Style = { fill: tint(p.c, p.m === 'glass' ? 0.8 : 0.55), stroke: COL.item, w: 0.18 };
    if (p.t === 'box') {
      if (p.w < 12 && p.d < 12) continue;
      out.push(poly(
        [
          { x: ox + p.x, y: oy + p.y },
          { x: ox + p.x + p.w, y: oy + p.y },
          { x: ox + p.x + p.w, y: oy + p.y + p.d },
          { x: ox + p.x, y: oy + p.y + p.d },
        ],
        true,
        st,
      ));
    } else if (p.t === 'cyl') {
      const axis = p.axis ?? 'z';
      const r = Math.max(p.r, p.r2 ?? 0);
      if (axis === 'z') {
        if (r >= 8) out.push(circle(ox + p.x, oy + p.y, r, st));
      } else if (axis === 'x') {
        out.push(poly([{ x: ox + p.x, y: oy + p.y - r }, { x: ox + p.x + p.h, y: oy + p.y - r }, { x: ox + p.x + p.h, y: oy + p.y + r }, { x: ox + p.x, y: oy + p.y + r }], true, st));
      } else {
        out.push(poly([{ x: ox + p.x - r, y: oy + p.y }, { x: ox + p.x + r, y: oy + p.y }, { x: ox + p.x + r, y: oy + p.y + p.h }, { x: ox + p.x - r, y: oy + p.y + p.h }], true, st));
      }
    } else {
      out.push(circle(ox + p.x, oy + p.y, p.r, st));
    }
  }
  return out;
}

const topZ = (p: Prim3): number => (p.t === 'box' ? p.z + p.h : p.t === 'cyl' ? ((p.axis ?? 'z') === 'z' ? p.z + p.h : p.z + p.r) : p.z + p.r);

/** Габариты объекта с учётом параметров. */
export function itemSize(item: Item): Size3 {
  const def = itemDef(item.kind);
  if (def) return def.size(item.params);
  const g = (key: string, f: number) => (typeof item.params[key] === 'number' ? (item.params[key] as number) : f);
  return { w: g('w', 600), d: g('d', 600), h: g('h', 600) };
}

/** Локальный символ объекта (центр в начале координат, без поворота). */
export function itemLocalPrims(item: Item): Prim2[] {
  const def = itemDef(item.kind);
  const s = itemSize(item);
  const key = `${item.kind}|${JSON.stringify(item.params)}`;
  const cached = symbolCache.get(key);
  if (cached) return cached;
  let prims: Prim2[];
  if (def?.symbol) prims = def.symbol(item.params, s);
  else if (def?.parts) prims = partsToPrims(def.parts(item.params, s), s);
  else {
    // корпус из конструктора / пользовательская модель — габаритный прямоугольник с диагоналями
    const hw = s.w / 2;
    const hd = s.d / 2;
    const st: Style = { fill: '#efe6d4', stroke: COL.item, w: 0.25 };
    prims = [
      poly([{ x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd }], true, st),
      line(-hw, -hd, hw, hd, { stroke: COL.item, w: 0.13 }),
      line(hw, -hd, -hw, hd, { stroke: COL.item, w: 0.13 }),
      line(-hw, hd - 20, hw, hd - 20, { stroke: COL.item, w: 0.35 }),
    ];
  }
  if (symbolCache.size > 2000) symbolCache.clear();
  symbolCache.set(key, prims);
  return prims;
}

export function itemPrims(item: Item): Prim2[] {
  return transform(itemLocalPrims(item), { tx: item.x, ty: item.y, rot: item.rot });
}

// ───────── Трассы и зоны ─────────

export function routePrims(route: Route, k: number, groupColor?: string): Prim2[] {
  const def = routeDef(route.kind);
  const color = groupColor ?? (typeof def?.color === 'function' ? def.color(route.params) : def?.color) ?? '#64748b';
  const out: Prim2[] = [];
  const width = def?.width?.(route.params);
  if (width && route.points.length > 1) {
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1];
      const b = route.points[i];
      const nn = mul(perp(norm(sub(b, a))), width / 2);
      out.push(poly([add(a, nn), add(b, nn), sub(b, nn), sub(a, nn)], true, { fill: tint(color, 0.45), stroke: 'none' }));
      if (i > 1) out.push(circle(a.x, a.y, width / 2, { fill: tint(color, 0.45), stroke: 'none' }));
    }
    out.push({ t: 'poly', pts: route.points, closed: false, s: { stroke: color, w: 0.18, dash: [2, 1] } });
  } else {
    out.push({ t: 'poly', pts: route.points, closed: false, s: { stroke: color, w: 0.5, dash: def?.dash } });
  }
  const tag = def?.tag?.(route.params);
  if (tag && route.points.length > 1) {
    // подпись на самом длинном сегменте
    let bi = 1;
    let bl = 0;
    for (let i = 1; i < route.points.length; i++) {
      const l = dist(route.points[i - 1], route.points[i]);
      if (l > bl) {
        bl = l;
        bi = i;
      }
    }
    if (bl > 12 * k) {
      const a = route.points[bi - 1];
      const b = route.points[bi];
      const m = mid(a, b);
      let ang = angleDeg(sub(b, a));
      if (ang > 90 && ang <= 270) ang -= 180;
      const off = mul(perp(norm(sub(b, a))), -1.4 * k);
      out.push(text(m.x + off.x, m.y + off.y, tag, 1.8, { rot: ang, color, halo: true }));
    }
  }
  return out;
}

export function zonePrims(zone: Zone, k: number, label?: string): Prim2[] {
  const def = zoneDef(zone.kind);
  const color = def?.color ?? '#94a3b8';
  const out: Prim2[] = [poly(zone.points, true, { fill: color, stroke: color, w: 0.25, opacity: 0.45 })];
  if (zone.points.length >= 3) {
    const c = interiorPoint(zone.points);
    const area = polygonArea(zone.points) / 1e6;
    out.push(text(c.x, c.y, `${label ?? ''} ${fmtArea(area)} м²`.trim(), 2.2, { color: '#374151', halo: true }));
  }
  return out;
}

// ───────── Размеры ─────────

export function dimPrims(a: Vec2, b: Vec2, offset: number, k: number, label?: string, color = COL.dim): Prim2[] {
  const L = dist(a, b);
  if (L < 1) return [];
  const d = norm(sub(b, a));
  const n = perp(d);
  const s: Style = { stroke: color, w: 0.18 };
  const a2 = add(a, mul(n, offset));
  const b2 = add(b, mul(n, offset));
  const over = mul(n, Math.sign(offset || 1) * 1.5 * k);
  const out: Prim2[] = [];
  if (Math.abs(offset) > 0.5 * k) {
    out.push(line(a.x, a.y, a2.x + over.x, a2.y + over.y, s));
    out.push(line(b.x, b.y, b2.x + over.x, b2.y + over.y, s));
  }
  out.push(line(a2.x, a2.y, b2.x, b2.y, s));
  const tick = mul(norm(add(d, n)), 1.2 * k);
  for (const p of [a2, b2]) out.push(line(p.x - tick.x, p.y - tick.y, p.x + tick.x, p.y + tick.y, { stroke: color, w: 0.35 }));
  let ang = angleDeg(d);
  let up = mul(n, -1);
  if (ang > 90 && ang <= 270) {
    ang -= 180;
    up = n;
  }
  // текст над линией (со стороны «верха» повернутого текста)
  const m = mid(a2, b2);
  const tp = add(m, mul(up, 1.1 * k));
  out.push(text(tp.x, tp.y, label ?? String(Math.round(L)), 2.2, { rot: ang, color, halo: true }));
  return out;
}

export const dimEntityPrims = (dm: Dim, k: number): Prim2[] => dimPrims(dm.a, dm.b, dm.offset, k);

/** Авторазмеры: внутренние размеры по рёбрам контура каждого помещения. */
export function autoDimPrims(level: Level, k: number, color = '#64748b'): Prim2[] {
  const out: Prim2[] = [];
  for (const r of level.rooms) {
    const c = centroid(r.polygon);
    for (let i = 0; i < r.polygon.length; i++) {
      const a = r.polygon[i];
      const b = r.polygon[(i + 1) % r.polygon.length];
      if (dist(a, b) < 300) continue;
      // вынос внутрь помещения
      const n = perp(norm(sub(b, a)));
      const inward = (c.x - a.x) * n.x + (c.y - a.y) * n.y > 0 ? 1 : -1;
      out.push(...dimPrims(a, b, inward * 4.5 * k, k, undefined, color));
    }
  }
  return out;
}

// ───────── Участок ─────────

export function sitePrims(site: Site, k: number): Prim2[] {
  const out: Prim2[] = [poly(site.boundary, true, { stroke: '#15803d', w: 0.5, dash: [6, 1.5, 1, 1.5], fill: '#f0fdf4', opacity: 1 })];
  const c = centroid(site.boundary);
  for (let i = 0; i < site.boundary.length; i++) {
    const a = site.boundary[i];
    const b = site.boundary[(i + 1) % site.boundary.length];
    const n = perp(norm(sub(b, a)));
    const outward = (c.x - a.x) * n.x + (c.y - a.y) * n.y > 0 ? -1 : 1;
    const m = add(mid(a, b), mul(n, outward * 2.5 * k));
    let ang = angleDeg(sub(b, a));
    if (ang > 90 && ang <= 270) ang -= 180;
    out.push(text(m.x, m.y, `${(dist(a, b) / 1000).toFixed(2).replace('.', ',')} м`, 2.2, { rot: ang, color: '#15803d' }));
  }
  return out;
}

/** Стрелка севера (локальные мм бумаги → масштабируется k). */
export function northArrowPrims(x: number, y: number, north: number, k: number): Prim2[] {
  const r = 6 * k;
  const prims: Prim2[] = [
    circle(0, 0, r, { stroke: '#334155', w: 0.25, fill: '#ffffff' }),
    poly([{ x: 0, y: -r * 0.85 }, { x: r * 0.3, y: r * 0.5 }, { x: 0, y: r * 0.25 }, { x: -r * 0.3, y: r * 0.5 }], true, { fill: '#334155', stroke: '#334155', w: 0.18 }),
    text(0, -r - 1.2 * k, 'Пн', 2.5, { color: '#334155', bold: true }),
  ];
  return transform(prims, { tx: x, ty: y, rot: -north });
}

export const routeLength = (r: Route): number => polylineLength(r.points);
