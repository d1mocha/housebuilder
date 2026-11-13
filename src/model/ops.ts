// Операции над моделью. Функции мутируют переданный объект (вызываются внутри immer-черновика).
import { itemDef } from '../catalog/registry';
import { add, closestOnSegment, dist, eq, projectT, sub } from './geometry';
import { newId } from './ids';
import type { Item, Level, Project, Route, Sel, Site, Vec2, Wall, Zone } from './types';
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
