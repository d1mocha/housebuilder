// Блок 0 (итерация 2): регрессионные тесты на исправленные баги.
import { describe, expect, it } from 'vitest';
import '../src/catalog';
import { itemDef } from '../src/catalog/registry';
import { itemSize } from '../src/draw2d/plan';
import { snapItemToWalls } from '../src/editor2d/itemSnap';
import { itemsOutsideRooms } from '../src/model/checks';
import { createWall } from '../src/model/defaults';
import { createDemoProject } from '../src/model/demo';
import { centroid, pointInPolygon, rectCorners } from '../src/model/geometry';
import { wallFacingRot } from '../src/model/walls';
import { walkStart } from '../src/view3d/walk';

describe('0.1 демо: мебель внутри помещений', () => {
  const p = createDemoProject();
  const l = p.levels[0];
  it('нет объектов вне контура помещений', () => {
    expect(itemsOutsideRooms(l)).toEqual([]);
    expect(l.items.length).toBeGreaterThan(60);
  });
  it('контур каждого предмета мебели целиком лежит в одном помещении', () => {
    const bad: string[] = [];
    for (const it of l.items) {
      if ((itemDef(it.kind)?.layer ?? 'furniture') !== 'furniture') continue;
      const s = itemSize(it);
      // углы контура, втянутые на 15 мм (мебель стоит вплотную к стенам)
      const cs = rectCorners({ x: it.x, y: it.y }, Math.max(10, s.w - 30), Math.max(10, s.d - 30), it.rot);
      const room = l.rooms.find((r) => cs.every((c) => pointInPolygon(c, r.polygon)));
      if (!room) bad.push(`${it.kind} @ ${it.x},${it.y}`);
    }
    expect(bad).toEqual([]);
  });
  it('проверка действительно находит вынесенный наружу объект', () => {
    const q = createDemoProject();
    q.levels[0].items[0].x = -5000;
    expect(itemsOutsideRooms(q.levels[0])).toHaveLength(1);
  });
});

describe('0.4 поворот мебели у стены — точное значение', () => {
  const box = [createWall({ x: 0, y: 0 }, { x: 5000, y: 0 }, { thickness: 200 }), createWall({ x: 5000, y: 0 }, { x: 5000, y: 4000 }, { thickness: 200 }), createWall({ x: 5000, y: 4000 }, { x: 0, y: 4000 }, { thickness: 200 }), createWall({ x: 0, y: 4000 }, { x: 0, y: 0 }, { thickness: 200 })];
  it('у осевых стен получаются ровно 0/90/180/270', () => {
    expect(snapItemToWalls({ x: 2500, y: 430 }, 800, 600, 37, box, 200).rot).toBe(0);
    expect(snapItemToWalls({ x: 4570, y: 2000 }, 800, 600, 37, box, 200).rot).toBe(90);
    expect(snapItemToWalls({ x: 2500, y: 3570 }, 800, 600, 37, box, 200).rot).toBe(180);
    expect(snapItemToWalls({ x: 430, y: 2000 }, 800, 600, 37, box, 200).rot).toBe(270);
  });
  it('направление стены a→b или b→a не влияет', () => {
    const w1 = createWall({ x: 0, y: 4000 }, { x: 0, y: 0 });
    const w2 = createWall({ x: 0, y: 0 }, { x: 0, y: 4000 });
    for (const w of [w1, w2]) {
      expect(wallFacingRot(w, { x: 300, y: 2000 })).toBe(270);
      expect(wallFacingRot(w, { x: -300, y: 2000 })).toBe(90);
    }
  });
  it('слегка перекошенная стена даёт её точный угол, а не 269°', () => {
    // стена отклонена на 20 мм на 4 м (≈0,29°)
    const w = createWall({ x: 0, y: 0 }, { x: 20, y: 4000 });
    const rot = wallFacingRot(w, { x: 400, y: 2000 });
    expect(rot).toBeCloseTo(270 - (Math.atan2(20, 4000) * 180) / Math.PI, 2);
    expect(rot).not.toBe(269);
    // точка вдали от стены и почти на её продолжении тоже даёт тот же угол
    expect(wallFacingRot(w, { x: 400, y: 3990 })).toBe(rot);
  });
  it('длинные дробные координаты не дают 269,999…', () => {
    const w = createWall({ x: 1234, y: 987 }, { x: 1234, y: 6543 });
    expect(wallFacingRot(w, { x: 1500.333, y: 2000.777 })).toBe(270);
  });
});

describe('0.5 старт прогулки', () => {
  const p = createDemoProject();
  const l = p.levels[0];
  const obstacles = l.items
    .filter((it) => (itemDef(it.kind)?.layer ?? 'furniture') === 'furniture')
    .map((it) => ({ it, s: itemSize(it) }))
    .filter(({ it, s }) => s.h >= 250 && it.z <= 1700)
    .map(({ it, s }) => rectCorners({ x: it.x, y: it.y }, s.w, s.d, it.rot));
  const st = walkStart(l, obstacles);
  const room = [...l.rooms].sort((a, b) => b.area - a.area)[0];
  it('точка внутри самого большого помещения и не внутри мебели', () => {
    expect(pointInPolygon(st.pos, room.polygon)).toBe(true);
    expect(obstacles.some((o) => pointInPolygon(st.pos, o))).toBe(false);
    expect(st.clearance).toBeGreaterThan(350);
  });
  it('взгляд направлен к центру помещения', () => {
    const c = centroid(room.polygon);
    const fwd = { x: -Math.sin(st.yaw), y: -Math.cos(st.yaw) };
    const to = { x: c.x - st.pos.x, y: c.y - st.pos.y };
    const len = Math.hypot(to.x, to.y);
    if (len >= 400) expect((fwd.x * to.x + fwd.y * to.y) / len).toBeGreaterThan(0.99);
  });
  it('в пустой комнате — центр, без мебели и стен — без падения', () => {
    const q = createDemoProject();
    q.levels[0].items = [];
    const s2 = walkStart(q.levels[0], []);
    expect(pointInPolygon(s2.pos, room.polygon)).toBe(true);
    expect(walkStart({ ...q.levels[0], rooms: [], walls: [] }, []).pos).toEqual({ x: 0, y: 0 });
  });
});
