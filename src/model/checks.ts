// Проверки целостности модели: объекты вне помещений, мебель в стене, проёмы за пределами стены.
import { itemDef } from '../catalog/registry';
import { add, cross, dot, norm, pointInPolygon, projectT, rectCorners, rotate, sub } from './geometry';
import type { Item, Level, Opening, Vec2, Wall } from './types';
import { arcInfo, geomOf, wallLen, wallPolygon } from './walls';

/**
 * Объекты этажа, не попадающие ни в одно помещение.
 * Объект считается «внутри», если в помещении лежит его центр либо точка перед ним
 * (настенные объекты стоят центром на грани стены).
 */
export function itemsOutsideRooms(level: Level): Item[] {
  return level.items.filter((it) => {
    const def = itemDef(it.kind);
    const d = def ? def.size(it.params).d : typeof it.params.d === 'number' ? it.params.d : 600;
    const front = add({ x: it.x, y: it.y }, rotate({ x: 0, y: Math.min(d / 2 + 60, 200) }, it.rot));
    const center = { x: it.x, y: it.y };
    return !level.rooms.some((r) => pointInPolygon(center, r.polygon) || pointInPolygon(front, r.polygon));
  });
}

/** Габариты объекта в плане (ширина × глубина). */
export function itemFootprintSize(it: Item): { w: number; d: number } {
  const def = itemDef(it.kind);
  if (def) {
    const s = def.size(it.params);
    return { w: s.w, d: s.d };
  }
  return { w: typeof it.params.w === 'number' ? it.params.w : 600, d: typeof it.params.d === 'number' ? it.params.d : 600 };
}

/** Пересекаются ли два выпуклых многоугольника (теорема о разделяющей оси). */
export function convexOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const n = { x: q.y - p.y, y: p.x - q.x };
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of a) {
        const d = dot(v, n);
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      for (const v of b) {
        const d = dot(v, n);
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

/** Мебель, которая может «врезаться» в стену: стоит на полу или висит на стене, не потолочная. */
const collidable = (it: Item): boolean => {
  const def = itemDef(it.kind);
  return (def?.layer ?? 'furniture') === 'furniture' && def?.mount !== 'ceiling';
};

/** Глубина, на которую контур объекта может заходить в стену без предупреждения (подгонка вплотную), мм. */
export const WALL_OVERLAP_TOL = 30;

/**
 * Мебель, контур которой пересекает тело стены (глубже допуска). Проёмы не учитываются: шкаф в дверном
 * проёме — тоже коллизия со стеной.
 */
export function itemsInWalls(level: Level): { item: Item; wallId: string }[] {
  const g = geomOf(level);
  const polys = g.walls.map((w) => ({ id: w.id.split('~')[0], poly: wallPolygon(w, g.walls) }));
  const out: { item: Item; wallId: string }[] = [];
  for (const it of level.items) {
    if (!collidable(it)) continue;
    const s = itemFootprintSize(it);
    const w = s.w - 2 * WALL_OVERLAP_TOL;
    const d = s.d - 2 * WALL_OVERLAP_TOL;
    if (w <= 0 || d <= 0) continue; // тонкие настенные предметы (картины, зеркала) стену не «пересекают»
    const rect = rectCorners({ x: it.x, y: it.y }, w, d, it.rot);
    const hit = polys.find((p) => convexOverlap(rect, p.poly));
    if (hit) out.push({ item: it, wallId: hit.id });
  }
  return out;
}

/** Проёмы, выходящие за пределы своей стены (после сдвига соседних стен) или потерявшие стену. */
export function openingsOutOfWall(level: Level): Opening[] {
  return level.openings.filter((o) => {
    const w = level.walls.find((x) => x.id === o.wallId);
    if (!w) return true;
    const L = wallLen(w);
    return o.pos - o.width / 2 < -1 || o.pos + o.width / 2 > L + 1;
  });
}

/**
 * Объекты, стоящие вплотную к стене (мебель спинкой или боком, настенные приборы): центр — напротив
 * стены, а ближайшая грань объекта — у грани стены.
 */
export function itemsFlushToWall(level: Level, wall: Pick<Wall, 'a' | 'b' | 'thickness' | 'arc'>): Item[] {
  if (arcInfo(wall as Wall)) return [];
  const dir = norm(sub(wall.b, wall.a));
  const half = wall.thickness / 2;
  return level.items.filter((it) => {
    if (itemDef(it.kind)?.mount === 'ceiling') return false;
    const c = { x: it.x, y: it.y };
    const t = projectT(c, wall.a, wall.b);
    if (t < 0 || t > 1) return false;
    const side = cross(dir, sub(c, wall.a)); // расстояние центра от оси со знаком
    const s = itemFootprintSize(it);
    // ближайшая к оси стены точка контура объекта (со стороны центра)
    let near = Infinity;
    let straddle = false;
    for (const q of rectCorners(c, s.w, s.d, it.rot)) {
      const sd = cross(dir, sub(q, wall.a));
      if (Math.sign(sd) !== Math.sign(side) && Math.abs(sd) > 1) straddle = true;
      near = Math.min(near, Math.abs(sd));
    }
    const gap = near - half;
    // настенные точки (розетки, выключатели) стоят центром на грани стены
    const onFace = Math.abs(Math.abs(side) - half) <= 45;
    return onFace || (!straddle && gap >= -80 && gap <= 40);
  });
}
