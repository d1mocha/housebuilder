// Операции над моделью. Функции мутируют переданный объект (вызываются внутри immer-черновика).
import { itemDef, routeDef, zoneDef } from '../catalog/registry';
import { add, closestOnSegment, dist, eq, projectT, sub } from './geometry';
import { newId } from './ids';
import type { Item, LayerId, Level, Project, Route, Sel, Site, Vec2, Wall, Zone } from './types';
import { clampOpeningPos, wallLength } from './walls';
import { createWall } from './defaults';

export interface Container {
  items: Item[];
  routes: Route[];
  zones: Zone[];
}

export const getLevel = (p: Project, id: string): Level | undefined => p.levels.find((l) => l.id === id);

/** Контейнер объектов: этаж или участок. */
export function getContainer(p: Project, scope: string): Container | undefined {
  if (scope === 'site') return p.site ?? undefined;
  return getLevel(p, scope);
}

export function findWall(p: Project, sel: Sel): Wall | undefined {
  return getLevel(p, sel.scope)?.walls.find((w) => w.id === sel.id);
}

/** Найти сущность по ссылке. */
export function findEntity(p: Project, sel: Sel | null): unknown {
  if (!sel) return undefined;
  const lvl = sel.scope === 'site' ? undefined : getLevel(p, sel.scope);
  const c = getContainer(p, sel.scope);
  switch (sel.type) {
    case 'wall':
      return lvl?.walls.find((w) => w.id === sel.id);
    case 'opening':
      return lvl?.openings.find((o) => o.id === sel.id);
    case 'room':
      return lvl?.rooms.find((r) => r.id === sel.id);
    case 'dim':
      return lvl?.dims.find((d) => d.id === sel.id);
    case 'item':
      return c?.items.find((i) => i.id === sel.id);
    case 'route':
      return c?.routes.find((r) => r.id === sel.id);
    case 'zone':
      return c?.zones.find((z) => z.id === sel.id);
    case 'site':
      return p.site ?? undefined;
    case 'underlay':
      return lvl?.underlay ?? undefined;
  }
}

export function removeEntity(p: Project, sel: Sel): void {
  const lvl = sel.scope === 'site' ? undefined : getLevel(p, sel.scope);
  const c = getContainer(p, sel.scope);
  const drop = <T extends { id: string }>(arr: T[] | undefined) => {
    if (!arr) return;
    const i = arr.findIndex((e) => e.id === sel.id);
    if (i >= 0) arr.splice(i, 1);
  };
  switch (sel.type) {
    case 'wall':
      if (lvl) {
        drop(lvl.walls);
        lvl.openings = lvl.openings.filter((o) => o.wallId !== sel.id);
      }
      break;
    case 'opening':
      drop(lvl?.openings);
      break;
    case 'dim':
      drop(lvl?.dims);
      break;
    case 'item':
      drop(c?.items);
      break;
    case 'route':
      drop(c?.routes);
      break;
    case 'zone':
      drop(c?.zones);
      break;
    case 'underlay':
      if (lvl) lvl.underlay = null;
      break;
    default:
      break;
  }
}

export function duplicateEntity(p: Project, sel: Sel, offset: Vec2 = { x: 300, y: 300 }): Sel | null {
  const lvl = sel.scope === 'site' ? undefined : getLevel(p, sel.scope);
  const c = getContainer(p, sel.scope);
  const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
  switch (sel.type) {
    case 'item': {
      const src = c?.items.find((i) => i.id === sel.id);
      if (!src || !c) return null;
      const n = { ...clone(src), id: newId('it'), x: src.x + offset.x, y: src.y + offset.y };
      c.items.push(n);
      return { ...sel, id: n.id };
    }
    case 'route': {
      const src = c?.routes.find((i) => i.id === sel.id);
      if (!src || !c) return null;
      const n = { ...clone(src), id: newId('rt'), points: src.points.map((q) => add(q, offset)) };
      c.routes.push(n);
      return { ...sel, id: n.id };
    }
    case 'zone': {
      const src = c?.zones.find((i) => i.id === sel.id);
      if (!src || !c) return null;
      const n = { ...clone(src), id: newId('zn'), points: src.points.map((q) => add(q, offset)) };
      c.zones.push(n);
      return { ...sel, id: n.id };
    }
    case 'opening': {
      const src = lvl?.openings.find((o) => o.id === sel.id);
      const wall = lvl?.walls.find((w) => w.id === src?.wallId);
      if (!src || !lvl || !wall) return null;
      const n = { ...clone(src), id: newId('o'), pos: clampOpeningPos(src.pos + src.width + 200, src.width, wall) };
      lvl.openings.push(n);
      return { ...sel, id: n.id };
    }
    case 'wall': {
      const src = lvl?.walls.find((w) => w.id === sel.id);
      if (!src || !lvl) return null;
      const n = { ...clone(src), id: newId('w'), a: add(src.a, offset), b: add(src.b, offset) };
      lvl.walls.push(n);
      return { ...sel, id: n.id };
    }
    default:
      return null;
  }
}

/** Сдвинуть узел: все концы стен в точке from переезжают в to. */
export function moveNode(level: Level, from: Vec2, to: Vec2): void {
  for (const w of level.walls) {
    if (eq(w.a, from, 1)) w.a = { x: to.x, y: to.y };
    if (eq(w.b, from, 1)) w.b = { x: to.x, y: to.y };
  }
}

/**
 * Сдвинуть стену на delta: её концы, концы примыкающих в узлах стен и концы стен,
 * упирающихся в её тело (Т-примыкания), двигаются вместе с ней.
 */
export function translateWall(level: Level, wallId: string, delta: Vec2): void {
  const wall = level.walls.find((w) => w.id === wallId);
  if (!wall) return;
  const a0 = { ...wall.a };
  const b0 = { ...wall.b };
  for (const w of level.walls) {
    if (w.id === wallId) continue;
    for (const key of ['a', 'b'] as const) {
      const p = w[key];
      if (eq(p, a0, 1) || eq(p, b0, 1)) {
        w[key] = add(p, delta);
      } else {
        const c = closestOnSegment(p, a0, b0);
        if (c.dist < 1 && c.t > 0 && c.t < 1) w[key] = add(p, delta);
      }
    }
  }
  wall.a = add(a0, delta);
  wall.b = add(b0, delta);
}

/** Разделить стену в точке (проекция на ось). Проёмы распределяются по половинам. */
export function splitWall(level: Level, wallId: string, at: Vec2): string | null {
  const wall = level.walls.find((w) => w.id === wallId);
  if (!wall || wall.arc) return null; // дуговые стены не делятся
  const L = wallLength(wall);
  const t = projectT(at, wall.a, wall.b);
  const cut = Math.round(t * L);
  if (cut < 100 || cut > L - 100) return null;
  const dir = sub(wall.b, wall.a);
  const pt = { x: Math.round(wall.a.x + (dir.x * cut) / L), y: Math.round(wall.a.y + (dir.y * cut) / L) };
  const second: Wall = { ...createWall(pt, wall.b), thickness: wall.thickness, material: wall.material, loadBearing: wall.loadBearing, exterior: wall.exterior, finishL: wall.finishL, finishR: wall.finishR, ...(wall.status ? { status: wall.status } : {}) };
  if (wall.height) second.height = wall.height;
  wall.b = pt;
  level.walls.push(second);
  for (const o of level.openings) {
    if (o.wallId !== wallId) continue;
    if (o.pos > cut) {
      o.wallId = second.id;
      o.pos -= cut;
    }
  }
  return second.id;
}

/** Развернуть направление стены (меняет местами стороны L/R), сохраняя геометрию проёмов. */
export function flipWall(level: Level, wallId: string): void {
  const wall = level.walls.find((w) => w.id === wallId);
  if (!wall) return;
  const L = wallLength(wall);
  [wall.a, wall.b] = [wall.b, wall.a];
  [wall.finishL, wall.finishR] = [wall.finishR, wall.finishL];
  if (wall.arc) wall.arc = -wall.arc;
  for (const o of level.openings) {
    if (o.wallId !== wallId) continue;
    o.pos = L - o.pos;
    o.hinge = o.hinge === 'a' ? 'b' : 'a';
    o.swing = o.swing === 'L' ? 'R' : 'L';
  }
}

/** Создать объект библиотеки. */
export function makeItem(kind: string, pos: Vec2, rot = 0, level?: Level, params: Item['params'] = {}): Item {
  const def = itemDef(kind);
  const merged = { ...(def?.defaults ?? {}), ...params };
  let z = def?.z ?? 0;
  if (def?.mount === 'ceiling' && level) {
    const h = def.size(merged).h;
    z = Math.max(0, level.height - h);
  }
  return { id: newId('it'), kind, x: Math.round(pos.x), y: Math.round(pos.y), rot, z, params: merged };
}

/** Все узлы (концы стен) уровня без повторов. */
export function wallNodes(level: Level): Vec2[] {
  const out: Vec2[] = [];
  for (const w of level.walls) {
    for (const p of [w.a, w.b]) if (!out.some((q) => eq(q, p, 1))) out.push(p);
  }
  return out;
}

/** Удалить стены нулевой длины и дубликаты. */
export function cleanupWalls(level: Level): void {
  level.walls = level.walls.filter((w, i) => {
    if (dist(w.a, w.b) < 10) return false;
    return !level.walls.some((o, j) => j < i && ((eq(o.a, w.a, 1) && eq(o.b, w.b, 1)) || (eq(o.a, w.b, 1) && eq(o.b, w.a, 1))));
  });
  const ids = new Set(level.walls.map((w) => w.id));
  level.openings = level.openings.filter((o) => ids.has(o.wallId));
}

export const siteOf = (p: Project): Site | null => p.site;

// ───────── Групповые операции (мультивыделение) ─────────

/** Слой объекта выделения. */
export function layerOfSel(p: Project, sel: Sel): LayerId {
  switch (sel.type) {
    case 'wall':
    case 'opening':
      return 'walls';
    case 'room':
      return 'rooms';
    case 'dim':
      return 'dimensions';
    case 'site':
      return 'landscape';
    case 'underlay':
      return 'underlay';
    case 'item': {
      const it = getContainer(p, sel.scope)?.items.find((i) => i.id === sel.id);
      return itemDef(it?.kind ?? '')?.layer ?? 'furniture';
    }
    case 'route': {
      const r = getContainer(p, sel.scope)?.routes.find((i) => i.id === sel.id);
      return routeDef(r?.kind ?? '')?.layer ?? 'electrical';
    }
    case 'zone': {
      const z = getContainer(p, sel.scope)?.zones.find((i) => i.id === sel.id);
      return zoneDef(z?.kind ?? '')?.layer ?? 'heating';
    }
  }
}

/**
 * Сдвинуть несколько стен: их концы двигаются вместе, а концы невыделенных стен, примыкающие к ним
 * (в узлах и к телу), тянутся следом.
 */
export function translateWalls(level: Level, ids: string[], delta: Vec2): void {
  const set = new Set(ids);
  const moving = level.walls.filter((w) => set.has(w.id));
  if (!moving.length) return;
  const orig = moving.map((w) => ({ a: { ...w.a }, b: { ...w.b } }));
  for (const w of level.walls) {
    if (set.has(w.id)) continue;
    for (const key of ['a', 'b'] as const) {
      const pt = w[key];
      const attached = orig.some((o) => {
        if (eq(pt, o.a, 1) || eq(pt, o.b, 1)) return true;
        const c = closestOnSegment(pt, o.a, o.b);
        return c.dist < 1 && c.t > 0 && c.t < 1;
      });
      if (attached) w[key] = add(pt, delta);
    }
  }
  for (const w of moving) {
    w.a = add(w.a, delta);
    w.b = add(w.b, delta);
  }
}

/** Сдвинуть группу объектов. Проёмы едут вместе со своими стенами. */
export function moveEntities(p: Project, sels: Sel[], delta: Vec2): void {
  const wallsByLevel = new Map<string, string[]>();
  for (const sel of sels) {
    const c = getContainer(p, sel.scope);
    const lvl = sel.scope === 'site' ? undefined : getLevel(p, sel.scope);
    switch (sel.type) {
      case 'wall':
        wallsByLevel.set(sel.scope, [...(wallsByLevel.get(sel.scope) ?? []), sel.id]);
        break;
      case 'item': {
        const it = c?.items.find((i) => i.id === sel.id);
        if (it) {
          it.x += delta.x;
          it.y += delta.y;
        }
        break;
      }
      case 'route': {
        const r = c?.routes.find((i) => i.id === sel.id);
        if (r) r.points = r.points.map((q) => add(q, delta));
        break;
      }
      case 'zone': {
        const z = c?.zones.find((i) => i.id === sel.id);
        if (z) z.points = z.points.map((q) => add(q, delta));
        break;
      }
      case 'dim': {
        const d = lvl?.dims.find((i) => i.id === sel.id);
        if (d) {
          d.a = add(d.a, delta);
          d.b = add(d.b, delta);
        }
        break;
      }
      default:
        break;
    }
  }
  for (const [scope, ids] of wallsByLevel) {
    const lvl = getLevel(p, scope);
    if (lvl) translateWalls(lvl, ids, delta);
  }
}

const itemsOf = (p: Project, sels: Sel[]): Item[] => sels.filter((s) => s.type === 'item').map((s) => getContainer(p, s.scope)?.items.find((i) => i.id === s.id)).filter((x): x is Item => !!x);

function itemBox(it: Item): { minX: number; minY: number; maxX: number; maxY: number } {
  const def = itemDef(it.kind);
  const sz = def ? def.size(it.params) : { w: Number(it.params.w) || 600, d: Number(it.params.d) || 600, h: 0 };
  const r = (it.rot * Math.PI) / 180;
  const hw = (Math.abs(Math.cos(r)) * sz.w + Math.abs(Math.sin(r)) * sz.d) / 2;
  const hd = (Math.abs(Math.sin(r)) * sz.w + Math.abs(Math.cos(r)) * sz.d) / 2;
  return { minX: it.x - hw, maxX: it.x + hw, minY: it.y - hd, maxY: it.y + hd };
}
export { itemBox };

/** Повернуть группу объектов вокруг общего центра на deg (объекты поворачиваются и сами). */
export function rotateEntities(p: Project, sels: Sel[], deg: number): void {
  const its = itemsOf(p, sels);
  if (!its.length) return;
  const cx = its.reduce((s, i) => s + i.x, 0) / its.length;
  const cy = its.reduce((s, i) => s + i.y, 0) / its.length;
  const r = (deg * Math.PI) / 180;
  for (const it of its) {
    const dx = it.x - cx;
    const dy = it.y - cy;
    if (its.length > 1) {
      it.x = Math.round(cx + dx * Math.cos(r) - dy * Math.sin(r));
      it.y = Math.round(cy + dx * Math.sin(r) + dy * Math.cos(r));
    }
    it.rot = (((it.rot + deg) % 360) + 360) % 360;
  }
}

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter';

/** Выровнять объекты по краю/центру их общего габарита. */
export function alignItems(p: Project, sels: Sel[], mode: AlignMode): void {
  const its = itemsOf(p, sels);
  if (its.length < 2) return;
  const boxes = its.map(itemBox);
  const minX = Math.min(...boxes.map((b) => b.minX));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  its.forEach((it, i) => {
    const b = boxes[i];
    if (mode === 'left') it.x += minX - b.minX;
    else if (mode === 'right') it.x += maxX - b.maxX;
    else if (mode === 'top') it.y += minY - b.minY;
    else if (mode === 'bottom') it.y += maxY - b.maxY;
    else if (mode === 'hcenter') it.x += (minX + maxX) / 2 - (b.minX + b.maxX) / 2;
    else it.y += (minY + maxY) / 2 - (b.minY + b.maxY) / 2;
    it.x = Math.round(it.x);
    it.y = Math.round(it.y);
  });
}

/** Распределить объекты равномерно (равные промежутки между габаритами) по оси. */
export function distributeItems(p: Project, sels: Sel[], axis: 'x' | 'y'): void {
  const its = itemsOf(p, sels);
  if (its.length < 3) return;
  const lo = axis === 'x' ? 'minX' : 'minY';
  const hi = axis === 'x' ? 'maxX' : 'maxY';
  const list = its.map((it) => ({ it, b: itemBox(it) })).sort((m, n) => m.b[lo] - n.b[lo]);
  const total = list.reduce((s, e) => s + (e.b[hi] - e.b[lo]), 0);
  const span = list[list.length - 1].b[hi] - list[0].b[lo];
  const gap = (span - total) / (list.length - 1);
  let cur = list[0].b[lo];
  for (const e of list) {
    const shift = cur - e.b[lo];
    if (axis === 'x') e.it.x = Math.round(e.it.x + shift);
    else e.it.y = Math.round(e.it.y + shift);
    cur += e.b[hi] - e.b[lo] + gap;
  }
}

/** Габарит объекта выделения на плане (для рамки выделения). */
export function selBBox(p: Project, sel: Sel): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const c = getContainer(p, sel.scope);
  const lvl = sel.scope === 'site' ? undefined : getLevel(p, sel.scope);
  const ofPts = (pts: Vec2[], pad = 0) => (pts.length ? { minX: Math.min(...pts.map((q) => q.x)) - pad, maxX: Math.max(...pts.map((q) => q.x)) + pad, minY: Math.min(...pts.map((q) => q.y)) - pad, maxY: Math.max(...pts.map((q) => q.y)) + pad } : null);
  switch (sel.type) {
    case 'wall': {
      const w = lvl?.walls.find((x) => x.id === sel.id);
      return w ? ofPts([w.a, w.b]) : null;
    }
    case 'item': {
      const it = c?.items.find((i) => i.id === sel.id);
      return it ? itemBox(it) : null;
    }
    case 'route':
      return ofPts(c?.routes.find((i) => i.id === sel.id)?.points ?? []);
    case 'zone':
      return ofPts(c?.zones.find((i) => i.id === sel.id)?.points ?? []);
    case 'dim': {
      const d = lvl?.dims.find((i) => i.id === sel.id);
      return d ? ofPts([d.a, d.b]) : null;
    }
    default:
      return null;
  }
}

/**
 * Объекты заданных слоёв, попавшие в рамку. window = true — только целиком внутри рамки,
 * иначе — все, чей габарит пересекает рамку.
 */
export function selsInRect(p: Project, levelId: string, rect: { minX: number; minY: number; maxX: number; maxY: number }, layers: LayerId[], window: boolean): Sel[] {
  const out: Sel[] = [];
  const test = (sel: Sel) => {
    if (!layers.includes(layerOfSel(p, sel))) return;
    const b = selBBox(p, sel);
    if (!b) return;
    const inside = b.minX >= rect.minX && b.maxX <= rect.maxX && b.minY >= rect.minY && b.maxY <= rect.maxY;
    const cross = b.minX <= rect.maxX && b.maxX >= rect.minX && b.minY <= rect.maxY && b.maxY >= rect.minY;
    if (window ? inside : cross) out.push(sel);
  };
  const lvl = getLevel(p, levelId);
  if (lvl) {
    for (const w of lvl.walls) test({ type: 'wall', id: w.id, scope: levelId });
    for (const it of lvl.items) test({ type: 'item', id: it.id, scope: levelId });
    for (const r of lvl.routes) test({ type: 'route', id: r.id, scope: levelId });
    for (const z of lvl.zones) test({ type: 'zone', id: z.id, scope: levelId });
    for (const d of lvl.dims) test({ type: 'dim', id: d.id, scope: levelId });
  }
  if (p.site) {
    for (const it of p.site.items) test({ type: 'item', id: it.id, scope: 'site' });
    for (const r of p.site.routes) test({ type: 'route', id: r.id, scope: 'site' });
    for (const z of p.site.zones) test({ type: 'zone', id: z.id, scope: 'site' });
  }
  return out;
}

export const sameSel = (a: Sel | null | undefined, b: Sel | null | undefined): boolean => !!a && !!b && a.type === b.type && a.id === b.id && a.scope === b.scope;
