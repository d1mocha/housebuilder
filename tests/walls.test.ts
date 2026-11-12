import { describe, expect, it } from 'vitest';
import { createLevel, createOpening, createWall, roomDefaults } from '../src/model/defaults';
import { createDemoProject } from '../src/model/demo';
import { flipWall, splitWall, translateWall } from '../src/model/ops';
import type { Level } from '../src/model/types';
import { detectRooms, openingGeom, roomSurfaces, solidSpans, surfaceNetArea, syncRooms, wallPolygon } from '../src/model/walls';
import { collisionSegments, wallPieces } from '../src/view3d/build';
import { resolveCollisions } from '../src/view3d/walk';

function box(w: number, h: number, t = 200): Level {
  const l = createLevel('t');
  const c = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: t }));
  return l;
}

describe('стены и помещения', () => {
  it('площадь помещения — по внутреннему контуру (за вычетом толщины стен)', () => {
    const l = box(5000, 4000, 200);
    const { rooms, outline } = detectRooms(l.walls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaMm2).toBeCloseTo(4800 * 3800, 0);
    // наружный контур — с учётом подрезки углов «на ус»
    expect(outline).toHaveLength(1);
    const xs = outline[0].map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-100, 3);
    expect(Math.max(...xs)).toBeCloseTo(5100, 3);
  });

  it('перегородка делит помещение на два, Т-примыкание герметично', () => {
    const l = box(6000, 4000, 200);
    l.walls.push(createWall({ x: 2500, y: 0 }, { x: 2500, y: 4000 }, { thickness: 100 }));
    const { rooms } = detectRooms(l.walls);
    expect(rooms).toHaveLength(2);
    const areas = rooms.map((r) => r.areaMm2 / 1e6).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo((2500 - 100 - 50) * 3800 / 1e6, 3);
    expect(areas[1]).toBeCloseTo((3500 - 100 - 50) * 3800 / 1e6, 3);
  });

  it('незамкнутый контур не даёт помещения', () => {
    const l = box(5000, 4000);
    l.walls.pop();
    expect(detectRooms(l.walls).rooms).toHaveLength(0);
  });

  it('метаданные помещения сохраняются при сдвиге стены', () => {
    const l = box(5000, 4000);
    syncRooms(l, roomDefaults());
    l.rooms[0].name = 'Кухня';
    l.rooms[0].floorFinish = 'tile-floor-grey';
    const id = l.rooms[0].id;
    translateWall(l, l.walls[1].id, { x: 1000, y: 0 });
    syncRooms(l, roomDefaults());
    expect(l.rooms).toHaveLength(1);
    expect(l.rooms[0].id).toBe(id);
    expect(l.rooms[0].name).toBe('Кухня');
    expect(l.rooms[0].area).toBeCloseTo(5.8 * 3.8, 2);
  });

  it('контур стены: L-угол подрезается «на ус»', () => {
    const l = box(5000, 4000, 200);
    const pg = wallPolygon(l.walls[0], l.walls);
    // стена (0,0)→(5000,0); сторона L (внутренняя, +y) короче наружной
    const ys = pg.map((p) => Math.round(p.y));
    expect(ys).toEqual([100, 100, -100, -100]);
    expect(pg[0].x).toBeCloseTo(100);
    expect(pg[1].x).toBeCloseTo(4900);
    expect(pg[2].x).toBeCloseTo(5100);
    expect(pg[3].x).toBeCloseTo(-100);
  });

  it('проёмы: геометрия, сплошные участки, призмы стены', () => {
    const l = box(5000, 4000);
    const w = l.walls[0];
    const door = createOpening(w.id, 'door', 1000, { width: 800, height: 2000 });
    const win = createOpening(w.id, 'window', 3000, { width: 1200, height: 1400, sill: 800 });
    l.openings.push(door, win);
    const g = openingGeom(door, w);
    expect(g.p1.x).toBe(600);
    expect(g.p2.x).toBe(1400);
    expect(solidSpans(w, l.openings)).toEqual([[0, 600], [1400, 5000]]);
    const pieces = wallPieces(w, l.openings, 2700);
    // сплошные: 0–600, 1400–2400, 3600–5000; над дверью; под и над окном
    expect(pieces).toHaveLength(6);
    const vol = pieces.reduce((s, p) => s + (p.s1 - p.s0) * (p.z1 - p.z0), 0);
    expect(vol).toBe(5000 * 2700 - 800 * 2000 - 1200 * 1400);
    // коллизии: окно непроходимо, дверь — проход
    const segs = collisionSegments(l).filter((s) => s.a.y === 0 && s.b.y === 0);
    expect(segs).toHaveLength(2);
  });

  it('поверхности помещения и площадь стен за вычетом проёмов', () => {
    const l = box(5000, 4000, 200);
    l.openings.push(createOpening(l.walls[0].id, 'window', 2500, { width: 1000, height: 1500, sill: 800 }));
    syncRooms(l, roomDefaults());
    const s = roomSurfaces(l, l.rooms[0]);
    expect(s).toHaveLength(4);
    expect(s.every((x) => x.wallId)).toBe(true);
    const total = s.reduce((a, x) => a + surfaceNetArea(x, 2700), 0);
    expect(total).toBeCloseTo((2 * (4800 + 3800)) * 2700 - 1000 * 1500, 0);
    const top = s.find((x) => x.wallId === l.walls[0].id)!;
    expect(top.side).toBe('L');
    expect(top.openings).toHaveLength(1);
  });

  it('разделение и разворот стены сохраняют проёмы', () => {
    const l = box(5000, 4000);
    const w = l.walls[0];
    l.openings.push(createOpening(w.id, 'door', 4000, { width: 800 }));
    const id2 = splitWall(l, w.id, { x: 2000, y: 0 });
    expect(id2).toBeTruthy();
    expect(l.walls).toHaveLength(5);
    expect(l.openings[0].wallId).toBe(id2);
    expect(l.openings[0].pos).toBe(2000);
    const before = openingGeom(l.openings[0], l.walls[4]).center;
    flipWall(l, id2!);
    const after = openingGeom(l.openings[0], l.walls[4]).center;
    expect(after.x).toBeCloseTo(before.x);
    expect(detectRooms(l.walls).rooms).toHaveLength(1);
  });

  it('прогулка: игрок не проходит сквозь стену, но проходит в дверь', () => {
    const l = box(5000, 4000, 200);
    l.openings.push(createOpening(l.walls[0].id, 'door', 2500, { width: 900 }));
    const segs = collisionSegments(l);
    const blocked = resolveCollisions({ x: 1000, y: 150 }, segs, 220);
    expect(blocked.y).toBeGreaterThanOrEqual(319.9);
    const free = resolveCollisions({ x: 2500, y: 0 }, segs, 220);
    expect(free).toEqual({ x: 2500, y: 0 });
  });

  it('демо-квартира: 6 помещений, ~53–56 м², есть мебель и исходное состояние', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    expect(l.rooms).toHaveLength(6);
    const total = l.rooms.reduce((s, r) => s + r.area, 0);
    expect(total).toBeGreaterThan(52);
    expect(total).toBeLessThan(57);
    expect(l.rooms.map((r) => r.type).sort()).toEqual(['bathroom', 'bedroom', 'hall', 'kitchen', 'living', 'toilet']);
    expect(l.items.length).toBeGreaterThan(40);
    expect(p.baseline?.length).toBe(l.walls.length);
  });
});
