// Геометрия стен: стыки, контуры, объединение, детекция помещений, поверхности.
import polygonClipping from 'polygon-clipping';
import type { Level, Opening, Room, Vec2, Wall, WallSide } from './types';
import {
  add,
  cross,
  dist,
  dot,
  eq,
  interiorPoint,
  len,
  lineIntersection,
  mul,
  norm,
  perp,
  pointInPolygon,
  polygonArea,
  polygonPerimeter,
  projectT,
  sub,
  closestOnSegment,
} from './geometry';
import { newId } from './ids';

export type Ring = [number, number][];
export type Poly = Ring[];
export type MultiPoly = Poly[];

export const wallLength = (w: Wall): number => dist(w.a, w.b);
export const wallDir = (w: Wall): Vec2 => norm(sub(w.b, w.a));
/** Нормаль стороны L. */
export const wallNormal = (w: Wall): Vec2 => perp(wallDir(w));

const JOIN_TOL = 1;

interface EndInfo {
  wall: Wall;
  /** Направление тела другой стены от узла. */
  dir: Vec2;
}

function endsAt(p: Vec2, walls: Wall[], self: Wall): EndInfo[] {
  const out: EndInfo[] = [];
  for (const w of walls) {
    if (w === self || w.id === self.id) continue;
    if (eq(w.a, p, JOIN_TOL)) out.push({ wall: w, dir: wallDir(w) });
    else if (eq(w.b, p, JOIN_TOL)) out.push({ wall: w, dir: mul(wallDir(w), -1) });
  }
  return out;
}

/**
 * Контур стены на плане: четырёхугольник [aL, bL, bR, aR] с подрезкой «на ус» в L-углах
 * и удлинением в узлах из 3+ стен.
 */
export function wallPolygon(wall: Wall, walls: Wall[]): Vec2[] {
  const dir = wallDir(wall);
  const n = perp(dir);
  const h = wall.thickness / 2;
  const corner = (p: Vec2, s: number) => add(p, mul(n, s * h));
  let aL = corner(wall.a, 1);
  let aR = corner(wall.a, -1);
  let bL = corner(wall.b, 1);
  let bR = corner(wall.b, -1);
  if (len(sub(wall.b, wall.a)) < 1) return [aL, bL, bR, aR];

  const adjust = (p: Vec2, isB: boolean) => {
    const out = isB ? dir : mul(dir, -1);
    const md = mul(out, -1); // направление тела этой стены от узла
    const others = endsAt(p, walls, wall);
    if (others.length === 0) return;
    const nonCol = others.filter((o) => Math.abs(cross(md, o.dir)) > 0.05);
    if (others.length === 1 && nonCol.length === 1) {
      const o = nonCol[0];
      const ho = o.wall.thickness / 2;
      const pm = perp(md);
      const po = perp(o.dir);
      const limit = 4 * Math.max(h, ho);
      const res: Record<string, Vec2> = {};
      let ok = true;
      for (const s of [1, -1]) {
        const i = lineIntersection(add(p, mul(pm, s * h)), md, add(p, mul(po, -s * ho)), o.dir);
        if (!i || dist(i, p) > limit) {
          ok = false;
          break;
        }
        res[s] = i;
      }
      if (ok) {
        // perp(md): в конце b это -n (сторона R), в конце a это +n (сторона L)
        if (isB) {
          bR = res[1];
          bL = res[-1];
        } else {
          aL = res[1];
          aR = res[-1];
        }
        return;
      }
    }
    if (nonCol.length > 0) {
      const ext = Math.max(...nonCol.map((o) => o.wall.thickness / 2));
      const d = mul(out, ext);
      if (isB) {
        bL = add(bL, d);
        bR = add(bR, d);
      } else {
        aL = add(aL, d);
        aR = add(aR, d);
      }
    }
  };
  adjust(wall.a, false);
  adjust(wall.b, true);
  return [aL, bL, bR, aR];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const toRing = (pts: Vec2[]): Ring => {
  const r: Ring = pts.map((p) => [r3(p.x), r3(p.y)]);
  if (r.length) r.push([r[0][0], r[0][1]]);
  return r;
};
export const fromRing = (r: Ring): Vec2[] => {
  const pts = r.map(([x, y]) => ({ x, y }));
  if (pts.length > 1 && eq(pts[0], pts[pts.length - 1], 1e-9)) pts.pop();
  return pts;
};

/** Объединение полигонов; при сбое библиотеки возвращает исходные полигоны по отдельности. */
export function unionPolys(polys: Vec2[][]): MultiPoly {
  const valid = polys.filter((p) => p.length >= 3 && polygonArea(p) > 1);
  if (valid.length === 0) return [];
  const geoms: Poly[] = valid.map((p) => [toRing(p)]);
  try {
    return polygonClipping.union(geoms[0], ...geoms.slice(1)) as MultiPoly;
  } catch {
    return geoms;
  }
}

export function differencePolys(subject: MultiPoly, clips: Vec2[][]): MultiPoly {
  if (subject.length === 0 || clips.length === 0) return subject;
  try {
    return polygonClipping.difference(subject, ...clips.map((p) => [toRing(p)] as Poly)) as MultiPoly;
  } catch {
    return subject;
  }
}

export function intersectPolys(a: Vec2[], b: Vec2[]): MultiPoly {
  try {
    return polygonClipping.intersection([toRing(a)], [toRing(b)]) as MultiPoly;
  } catch {
    return [];
  }
}

export function multiPolyArea(mp: MultiPoly): number {
  let s = 0;
  for (const poly of mp) {
    poly.forEach((ring, i) => {
      const a = polygonArea(fromRing(ring));
      s += i === 0 ? a : -a;
    });
  }
  return s;
}

/** Объединённый контур всех стен (без вычета проёмов). */
export function wallsUnion(walls: Wall[]): MultiPoly {
  return unionPolys(walls.map((w) => wallPolygon(w, walls)));
}

export interface DetectedRoom {
  polygon: Vec2[];
  /** мм² нетто (за вычетом островов внутри). */
  areaMm2: number;
}

const MIN_ROOM_MM2 = 0.3e6;

/** Помещения = отверстия объединённого контура стен. */
export function detectRooms(walls: Wall[]): { rooms: DetectedRoom[]; outline: Vec2[][] } {
  const mp = wallsUnion(walls);
  const rooms: DetectedRoom[] = [];
  const outline: Vec2[][] = [];
  const outers = mp.map((poly) => fromRing(poly[0]));
  for (const poly of mp) {
    outline.push(fromRing(poly[0]));
    for (let i = 1; i < poly.length; i++) {
      const hole = fromRing(poly[i]);
      let area = polygonArea(hole);
      for (const o of outers) {
        if (o.length && o !== outline[outline.length - 1] && pointInPolygon(o[0], hole)) area -= polygonArea(o);
      }
      if (area >= MIN_ROOM_MM2) rooms.push({ polygon: hole, areaMm2: area });
    }
  }
  return { rooms, outline };
}

export interface RoomDefaults {
  floorFinish: string;
  ceilingFinish: string;
  namePrefix: string;
}

/**
 * Пересчитать level.rooms по стенам, сохранив метаданные (имя, тип, отделку) по seed-точке.
 * Мутирует level (вызывается внутри immer-черновика).
 */
export function syncRooms(level: Level, defaults: RoomDefaults): void {
  const { rooms: detected } = detectRooms(level.walls);
  const prev = level.rooms;
  const used = new Set<string>();
  const next: Room[] = [];
  let counter = prev.length;
  for (const d of detected) {
    let meta = prev.find((r) => !used.has(r.id) && pointInPolygon(r.seed, d.polygon));
    if (!meta) {
      // запасной вариант: ближайший по центру контур с существенным перекрытием
      const c = interiorPoint(d.polygon);
      meta = prev.find((r) => !used.has(r.id) && r.polygon.length > 2 && pointInPolygon(c, r.polygon));
    }
    const seed = interiorPoint(d.polygon);
    const area = Math.round((d.areaMm2 / 1e6) * 100) / 100;
    const perimeter = Math.round((polygonPerimeter(d.polygon) / 1000) * 100) / 100;
    if (meta) {
      used.add(meta.id);
      next.push({ ...meta, seed, polygon: d.polygon, area, perimeter });
    } else {
      counter += 1;
      next.push({
        id: newId('room'),
        name: `${defaults.namePrefix} ${counter}`,
        type: 'other',
        seed,
        polygon: d.polygon,
        area,
        perimeter,
        floorFinish: defaults.floorFinish,
        ceilingFinish: defaults.ceilingFinish,
      });
    }
  }
  level.rooms = next;
}

// ---------- Проёмы ----------

export interface OpeningGeom {
  center: Vec2;
  /** Концы проёма на оси стены. */
  p1: Vec2;
  p2: Vec2;
  dir: Vec2;
  normal: Vec2;
  /** Четырёхугольник проёма в теле стены. */
  quad: Vec2[];
}

export function openingGeom(o: Opening, wall: Wall): OpeningGeom {
  const dir = wallDir(wall);
  const normal = perp(dir);
  const center = add(wall.a, mul(dir, o.pos));
  const p1 = add(center, mul(dir, -o.width / 2));
  const p2 = add(center, mul(dir, o.width / 2));
  const h = wall.thickness / 2 + 1;
  const quad = [add(p1, mul(normal, h)), add(p2, mul(normal, h)), add(p2, mul(normal, -h)), add(p1, mul(normal, -h))];
  return { center, p1, p2, dir, normal, quad };
}

/** Ограничить положение проёма длиной стены. */
export function clampOpeningPos(pos: number, width: number, wall: Wall, margin = 50): number {
  const L = wallLength(wall);
  const lo = width / 2 + margin;
  const hi = L - width / 2 - margin;
  if (hi < lo) return L / 2;
  return Math.max(lo, Math.min(hi, pos));
}

/** Сплошные участки стены (интервалы вдоль оси), свободные от проёмов данного набора. */
export function solidSpans(wall: Wall, openings: Opening[], kinds: Opening['kind'][] = ['door', 'portal']): [number, number][] {
  const L = wallLength(wall);
  const gaps = openings
    .filter((o) => o.wallId === wall.id && kinds.includes(o.kind))
    .map((o) => [Math.max(0, o.pos - o.width / 2), Math.min(L, o.pos + o.width / 2)] as [number, number])
    .sort((p, q) => p[0] - q[0]);
  const spans: [number, number][] = [];
  let cur = 0;
  for (const [g0, g1] of gaps) {
    if (g0 > cur) spans.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < L) spans.push([cur, L]);
  return spans;
}

/** Контуры стен с вырезанными проёмами (для плана). */
export function wallsPlanOutline(walls: Wall[], openings: Opening[]): MultiPoly {
  const u = wallsUnion(walls);
  const byId = new Map(walls.map((w) => [w.id, w]));
  const cuts: Vec2[][] = [];
  for (const o of openings) {
    const w = byId.get(o.wallId);
    if (w) cuts.push(openingGeom(o, w).quad);
  }
  return differencePolys(u, cuts);
}

// ---------- Поиск ----------

/** Ближайшая стена к точке (по оси), в пределах tol. */
export function nearestWall(p: Vec2, walls: Wall[], tol: number): { wall: Wall; t: number; point: Vec2; dist: number } | null {
  let best: { wall: Wall; t: number; point: Vec2; dist: number } | null = null;
  for (const w of walls) {
    const c = closestOnSegment(p, w.a, w.b);
    const d = Math.max(0, c.dist - w.thickness / 2);
    if (d <= tol && (!best || c.dist < best.dist)) best = { wall: w, t: c.t, point: c.point, dist: c.dist };
  }
  return best;
}

// ---------- Поверхности помещения ----------

export interface RoomSurface {
  roomId: string;
  /** Стена, вдоль которой лежит ребро контура (может отсутствовать при сложных стыках). */
  wallId: string | null;
  side: WallSide;
  a: Vec2;
  b: Vec2;
  length: number;
  /** Проёмы, попадающие на ребро: положение от a ребра, размеры. */
  openings: { id: string; kind: Opening['kind']; from: number; to: number; sill: number; height: number }[];
  finishId: string | null;
}

/** Рёбра контура помещения с привязкой к стенам и проёмам. */
export function roomSurfaces(level: Level, room: Room): RoomSurface[] {
  const out: RoomSurface[] = [];
  const poly = room.polygon;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const L = dist(a, b);
    if (L < 1) continue;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const ed = norm(sub(b, a));
    let found: { wall: Wall; side: WallSide } | null = null;
    for (const w of level.walls) {
      const wd = wallDir(w);
      if (Math.abs(cross(wd, ed)) > 0.02) continue;
      const t = projectT(m, w.a, w.b);
      const wl = wallLength(w);
      if (t * wl < -w.thickness || t * wl > wl + w.thickness) continue;
      const off = dot(sub(m, w.a), perp(wd));
      if (Math.abs(Math.abs(off) - w.thickness / 2) < 2) {
        found = { wall: w, side: off > 0 ? 'L' : 'R' };
        break;
      }
    }
    const s: RoomSurface = {
      roomId: room.id,
      wallId: found?.wall.id ?? null,
      side: found?.side ?? 'L',
      a,
      b,
      length: L,
      openings: [],
      finishId: found ? (found.side === 'L' ? found.wall.finishL : found.wall.finishR) : null,
    };
    if (found) {
      const w = found.wall;
      for (const o of level.openings) {
        if (o.wallId !== w.id) continue;
        const g = openingGeom(o, w);
        const t1 = projectT(g.p1, a, b) * L;
        const t2 = projectT(g.p2, a, b) * L;
        const from = Math.max(0, Math.min(t1, t2));
        const to = Math.min(L, Math.max(t1, t2));
        if (to - from > 1) s.openings.push({ id: o.id, kind: o.kind, from, to, sill: o.sill, height: o.height });
      }
    }
    out.push(s);
  }
  return out;
}

/** Площадь поверхности стены нетто (мм²) при высоте h. */
export function surfaceNetArea(s: RoomSurface, h: number): number {
  let a = s.length * h;
  for (const o of s.openings) {
    const oh = Math.max(0, Math.min(h, o.sill + o.height) - o.sill);
    a -= (o.to - o.from) * oh;
  }
  return Math.max(0, a);
}

/** Какое помещение содержит точку. */
export function roomAt(level: Level, p: Vec2): Room | null {
  return level.rooms.find((r) => pointInPolygon(p, r.polygon)) ?? null;
}

/**
 * Точный поворот объекта, стоящего спинкой к стене со стороны точки p: угол берётся из направления стены,
 * а не из вектора «точка → стена», поэтому для осевых стен получается ровно 0/90/180/270.
 */
export function wallFacingRot(wall: Wall, p: Vec2): number {
  const d = sub(wall.b, wall.a);
  // нормаль стороны L = (-dy, dx); объект смотрит от стены в сторону точки
  const side = cross(d, sub(p, wall.a)) >= 0 ? 1 : -1;
  const ux = -d.y * side;
  const uy = d.x * side;
  let deg = (Math.atan2(uy, ux) * 180) / Math.PI - 90;
  deg = ((deg % 360) + 360) % 360;
  const r = Math.round(deg);
  // осевые и почти осевые углы — ровно целое значение; остальные — с точностью 0,01°
  const out = Math.abs(deg - r) < 0.01 ? r : Math.round(deg * 100) / 100;
  return out === 360 ? 0 : out;
}
