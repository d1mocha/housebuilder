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

// ───────── 0.3 Конструктор: шкаф-купе, направление текстуры, раскрой ─────────
import { defaultCabinetCatalog } from '../src/cabinet/catalog';
import { buildCutList } from '../src/cabinet/cutlist';
import { generateCabinet } from '../src/cabinet/generate';
import { freeOffcuts, largestFreeRect, nest, nestCutList } from '../src/cabinet/nesting';
import { BUILTIN_TEMPLATES, autoDrawerCount } from '../src/cabinet/templates';
import { migrateProject } from '../src/model/migrate';

describe('0.3 шаблон «Шафа-купе» — настоящий шкаф-купе', () => {
  const cat = defaultCabinetCatalog();
  const d = BUILTIN_TEMPLATES.find((t) => t.id === 'wardrobe-sliding')!.make();
  const res = generateCabinet(d, cat);
  const rows = buildCutList(res.parts, cat);

  it('габарит 2400×2600×600, раздвижные двери: 3 полотна с перехлёстом', () => {
    expect([d.width, d.height, d.depth, d.facade.type, d.facade.slidingCount]).toEqual([2400, 2600, 600, 'sliding', 3]);
    const infill = res.parts.filter((p) => p.role === 'slidingDoor');
    expect(infill).toHaveLength(3);
    // дверь = (проём + перехлёст × 2) / 3; наполнение уже двери на вычет профиля
    const doorW = (2364 + 2 * 26) / 3;
    expect(infill[0].width).toBeCloseTo(doorW - 36, 1);
    expect(infill[0].length).toBeCloseTo(2494 - 40 - 60, 1);
    // соседние полотна перекрываются, стоят на разных дорожках
    const boxes = infill.map((p) => p.box!);
    expect(boxes[0].x + boxes[0].sx).toBeGreaterThan(boxes[1].x - 30);
    expect(boxes[0].y).not.toBe(boxes[1].y);
  });
  it('профиль дверей: рамка в 3D и позиции в спецификации', () => {
    const prof = res.parts.filter((p) => p.role === 'slidingProfile');
    expect(prof).toHaveLength(12);
    expect(prof.every((p) => p.virtual)).toBe(true);
    const hw = Object.fromEntries(res.hardware.map((h) => [h.id, h.qty]));
    for (const id of ['sliding-door', 'sliding-profile-v', 'sliding-profile-top', 'sliding-profile-bottom', 'sliding-track-top', 'sliding-track-bottom', 'sliding-rollers', 'sliding-brush']) expect(hw[id], id).toBeGreaterThan(0);
    expect(hw['sliding-profile-v']).toBeCloseTo((2 * 3 * 2454) / 1000, 1);
    expect(res.hardware.find((h) => h.id === 'sliding-door')!.name.ru).toContain('перехлёст 26');
  });
  it('штанга, полки и 2 ящика нормальной высоты (а не комод)', () => {
    expect(d.columns.some((c) => c.rod)).toBe(true);
    expect(d.columns.reduce((s, c) => s + c.shelves, 0)).toBeGreaterThanOrEqual(5);
    const drawers = d.columns.reduce((s, c) => s + c.drawers, 0);
    expect(drawers).toBeGreaterThanOrEqual(1);
    expect(drawers).toBeLessThanOrEqual(2);
    const fronts = res.parts.filter((p) => p.role === 'drawerFront');
    for (const f of fronts) {
      expect(f.width).toBeGreaterThanOrEqual(150);
      expect(f.width).toBeLessThanOrEqual(200);
    }
    expect(res.hardware.some((h) => h.id === 'rod')).toBe(true);
  });
  it('шаблон «Комод» остался отдельным изделием с ящиками', () => {
    const chest = BUILTIN_TEMPLATES.find((t) => t.id === 'chest')!;
    expect(chest.name.uk).toContain('Комод');
    const cd = chest.make();
    expect(cd.facade.type).toBe('drawers');
    expect(generateCabinet(cd, cat).parts.filter((p) => p.role === 'drawerFront')).toHaveLength(4);
  });
  it('переключение фасадов на «ящики» не даёт ящиков высотой 770 мм', () => {
    const tall = { ...d, facade: { ...d.facade, type: 'drawers' as const } };
    const n = autoDrawerCount(tall);
    expect(n).toBeGreaterThanOrEqual(8);
    const cols = tall.columns.map((c) => ({ ...c, drawers: Math.max(c.drawers, n) }));
    const r2 = generateCabinet({ ...tall, columns: cols }, cat);
    const fh = Math.max(...r2.parts.filter((p) => p.role === 'drawerFront').map((p) => p.width));
    expect(fh).toBeLessThan(400);
    // а если оставить 3 ящика на всю высоту — есть предупреждение
    const r3 = generateCabinet({ ...tall, columns: tall.columns.map((c) => ({ ...c, drawers: 3 })) }, cat);
    expect(r3.warnings.some((w) => w.ru.includes('слишком высокий'))).toBe(true);
  });
  it('наполнение дверей — ЛДСП 10 мм, попадает в деталировку и раскрой с текстурой вдоль', () => {
    const infill = rows.filter((r) => r.name.ru === 'Наполнение двери-купе');
    expect(infill.reduce((s, r) => s + r.qty, 0)).toBe(3);
    expect(infill[0].materialId).toBe('ldsp10');
    expect(infill[0].grain).toBe('length');
    const n = nestCutList(rows, cat).find((x) => x.materialId === 'ldsp10')!;
    expect(n.unplaced).toHaveLength(0);
    expect(n.sheets.every((sh) => sh.placements.every((p) => !p.rotated && p.l > p.w))).toBe(true);
  });
  it('старые проекты получают ЛДСП 10 мм в каталог', () => {
    const old = { id: 'x', name: 'o', kind: 'apartment', levels: [], cabinetCatalog: { ...cat, boards: cat.boards.filter((b) => b.id !== 'ldsp10') } } as never;
    expect(migrateProject(old).cabinetCatalog.boards.some((b) => b.id === 'ldsp10')).toBe(true);
  });
});

describe('0.3 направление текстуры детали в раскрое', () => {
  const cat = defaultCabinetCatalog();
  const base = BUILTIN_TEMPLATES.find((t) => t.id === 'bookshelf')!.make();
  it('«вдоль» — длина детали по длине листа, «поперёк» — по ширине, «без» — свободный поворот', () => {
    const mk = (grain: 'length' | 'width' | 'none') => {
      const d = { ...base, extraParts: [{ id: 'm', name: 'Тест', materialId: 'ldsp16', length: 1500, width: 300, qty: 1, edges: { l1: null, l2: null, w1: null, w2: null }, grain }] };
      const rows = buildCutList(generateCabinet(d, cat).parts, cat);
      const n = nestCutList(rows, cat).find((x) => x.materialId === 'ldsp16')!;
      const row = rows.find((r) => r.name.ru === 'Тест')!;
      return { p: n.sheets.flatMap((s) => s.placements).find((q) => q.id.startsWith(row.key))!, row };
    };
    const a = mk('length');
    expect([a.p.l, a.p.w, a.p.rotated]).toEqual([1500, 300, false]);
    const b = mk('width');
    expect([b.p.l, b.p.w, b.p.rotated]).toEqual([300, 1500, true]);
    expect(mk('none').row.grain).toBe('none');
  });
  it('переопределение направления для сгенерированной детали', () => {
    const d = { ...base, overrides: { 'side-l': { grain: 'width' as const } } };
    const res = generateCabinet(d, cat);
    expect(res.parts.find((p) => p.key === 'side-l')!.grain).toBe('width');
    // боковина 2000 мм поперёк текстуры ложится по ширине листа 2070
    const n = nestCutList(buildCutList(res.parts, cat), cat).find((x) => x.materialId === 'ldsp16')!;
    expect(n.unplaced).toHaveLength(0);
    const side = n.sheets.flatMap((s) => s.placements).find((p) => p.rotated && p.w > 1900)!;
    expect(side.l).toBeLessThan(400);
  });
  it('материал без текстуры: направление игнорируется, поворот разрешён', () => {
    const r = nest([{ id: 'a', label: '', l: 2040, w: 2700, canRotate: true }], 2800, 2070, 4, 10);
    expect(r.sheets[0].placements[0].rotated).toBe(true);
  });
});

describe('0.3 раскрой: компактнее, с деловыми остатками', () => {
  const cat = defaultCabinetCatalog();
  const run = (id: string, mat: string) => {
    const rows = buildCutList(generateCabinet(BUILTIN_TEMPLATES.find((t) => t.id === id)!.make(), cat).parts, cat);
    return nestCutList(rows, cat).find((x) => x.materialId === mat)!;
  };
  const sheetArea = 2800 * 2070;
  it('наибольший свободный прямоугольник', () => {
    expect(largestFreeRect(1000, 500, [])).toEqual({ x: 0, y: 0, l: 1000, w: 500 });
    expect(largestFreeRect(1000, 500, [{ x: 0, y: 0, l: 400, w: 500 }])).toEqual({ x: 400, y: 0, l: 600, w: 500 });
    // деталь в углу: лучший остаток — полоса справа на всю высоту или снизу на всю длину
    const r = largestFreeRect(1000, 500, [{ x: 0, y: 0, l: 300, w: 200 }])!;
    expect(r.l * r.w).toBe(700 * 500);
    // с учётом пропила
    expect(largestFreeRect(1000, 500, [{ x: 0, y: 0, l: 400, w: 500 }], 4)!.x).toBe(404);
    const two = freeOffcuts(1000, 500, [{ x: 0, y: 0, l: 300, w: 200 }], 0);
    expect(two).toHaveLength(2);
    expect(two[1].l * two[1].w).toBe(300 * 300);
  });
  it('кухонная тумба: детали собраны в углу, остаток — больше половины листа (было: размазано на 2590 мм)', () => {
    const n = run('kitchen-base', 'ldsp16');
    expect(n.sheets).toHaveLength(1);
    const off = n.sheets[0].offcut!;
    expect((off.l * off.w) / sheetArea).toBeGreaterThan(0.6);
    expect(n.waste).toBeLessThan(0.3);
  });
  it('шкаф-купе: 3 листа ЛДСП 18, на последнем — остаток не меньше 40 % листа (было ≤ 15 %)', () => {
    const n = run('wardrobe-sliding', 'ldsp18');
    expect(n.sheets).toHaveLength(3);
    const off = n.sheets[2].offcut!;
    expect((off.l * off.w) / sheetArea).toBeGreaterThan(0.4);
    expect(n.waste).toBeLessThan(0.2);
  });
  it('типовые изделия: отходы без деловых остатков заметно ниже прежних', () => {
    // прежний алгоритм: доля листа, занятая до крайней детали (остальное — единственный остаток)
    const before: Record<string, number> = { 'wardrobe-hinged': 0.533, chest: 0.534, bookshelf: 0.547, 'kitchen-drawers': 0.593 };
    for (const [id, old] of Object.entries(before)) {
      const mat = id === 'wardrobe-hinged' ? 'ldsp18' : 'ldsp16';
      const n = run(id, mat);
      expect(n.waste, id).toBeLessThan(old * 0.5);
      expect(n.unplaced, id).toHaveLength(0);
    }
  });
  it('остатки не пересекаются с деталями и между собой, лежат в пределах листа', () => {
    for (const id of ['wardrobe-sliding', 'chest', 'kitchen-drawers']) {
      for (const n of nestCutList(buildCutList(generateCabinet(BUILTIN_TEMPLATES.find((t) => t.id === id)!.make(), cat).parts, cat), cat)) {
        for (const sh of n.sheets) {
          const rects = [...sh.placements, ...sh.offcuts];
          for (const o of sh.offcuts) {
            expect(o.x).toBeGreaterThanOrEqual(10 - 1e-6);
            expect(o.x + o.l).toBeLessThanOrEqual(n.sheetL - 10 + 1e-6);
            expect(o.y + o.w).toBeLessThanOrEqual(n.sheetW - 10 + 1e-6);
          }
          for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
              if (i < sh.placements.length && j < sh.placements.length) continue;
              const a = rects[i];
              const b = rects[j];
              const sep = a.x + a.l <= b.x + 1e-6 || b.x + b.l <= a.x + 1e-6 || a.y + a.w <= b.y + 1e-6 || b.y + b.w <= a.y + 1e-6;
              expect(sep, `${id} ${n.materialId}`).toBe(true);
            }
          }
        }
      }
    }
  });
  it('время раскроя шкафа-купе — в пределах 300 мс', () => {
    const rows = buildCutList(generateCabinet(BUILTIN_TEMPLATES.find((t) => t.id === 'wardrobe-sliding')!.make(), cat).parts, cat);
    const t0 = performance.now();
    nestCutList(rows, cat);
    expect(performance.now() - t0).toBeLessThan(300);
  });
});

// ───────── 0.7 Статусы «существующее / демонтаж / новое» и смета ─────────
import { buildEstimate } from '../src/calc/estimate';
import { createOpening, createProject, defaultWallStatus, roomDefaults } from '../src/model/defaults';
import { snapshotBaseline } from '../src/model/demo';
import { arcInfo, arcMid, baseWallId, detectRooms, geomOf, locateOnWall, pointAlong, roomSurfaces, syncRooms, wallLen } from '../src/model/walls';
import { validateProject } from '../src/rules/validate';
import { collisionSegments } from '../src/view3d/build';

describe('0.7 смета по статусам', () => {
  it('в демо-квартире все стены существующие — материалы кладки не считаются', () => {
    const p = createDemoProject();
    expect(p.levels[0].walls.every((w) => w.status === 'existing')).toBe(true);
    const lines = buildEstimate(p);
    expect(lines.filter((l) => l.category === 'walls')).toEqual([]);
    expect(lines.filter((l) => l.category === 'demolition')).toEqual([]);
    // отделка и новые сети считаются
    expect(lines.some((l) => l.category === 'paint')).toBe(true);
    expect(lines.some((l) => l.category === 'cable')).toBe(true);
    // существующие радиаторы не закупаются, новые розетки — да
    expect(lines.some((l) => l.key === 'dev.ht-radiator')).toBe(false);
    expect(lines.some((l) => l.key === 'dev.el-socket')).toBe(true);
  });
  it('новая перегородка попадает в «Стены», демонтируемая — в «Демонтаж»', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const part = l.walls.find((w) => !w.loadBearing && w.thickness === 120)!;
    const area0 = (wallLen(part) * l.height - l.openings.filter((o) => o.wallId === part.id).reduce((s, o) => s + o.width * o.height, 0)) / 1e6;
    part.status = 'demolish';
    l.walls.push({ ...createWall({ x: 1000, y: 150 }, { x: 1000, y: 3800 }, { thickness: 100, material: 'gkl' }), status: 'new' });
    const lines = buildEstimate(p);
    const demo = lines.filter((x) => x.category === 'demolition');
    expect(demo.find((x) => x.key === `demo.wall.brick.120`)!.qty).toBeCloseTo(area0, 2);
    expect(demo.find((x) => x.key === 'demo.waste')!.qty).toBeCloseTo(area0 * 0.12 * 1.3, 2);
    const walls = lines.filter((x) => x.category === 'gkl');
    expect(walls.find((x) => x.key === 'gkl.sheet')!.qty).toBeCloseTo((3.65 * 2.6 * 2) / 3, 1);
    expect(lines.some((x) => x.key === 'wall.brick')).toBe(false);
    // демонтаж прибора
    l.items.find((i) => i.kind === 'ht-radiator')!.status = 'demolish';
    expect(buildEstimate(p).find((x) => x.key === 'demo.item.ht-radiator')!.qty).toBe(1);
  });
  it('статус новой стены по умолчанию: обводка квартиры — существующее, после фиксации и в доме — новое', () => {
    const apt = createProject('apartment', 'a');
    expect(defaultWallStatus(apt)).toBe('existing');
    apt.baseline = snapshotBaseline(apt);
    expect(defaultWallStatus(apt)).toBe('new');
    expect(defaultWallStatus(createProject('house', 'h'))).toBe('new');
  });
  it('старый проект без статусов: стены квартиры из техпаспорта — существующие, добавленные позже — новые', () => {
    const p = createDemoProject();
    const raw = JSON.parse(JSON.stringify(p));
    raw.schema = 1;
    for (const w of raw.levels[0].walls) delete w.status;
    raw.levels[0].walls.push({ ...createWall({ x: 1000, y: 150 }, { x: 1000, y: 3800 }), status: undefined });
    const m = migrateProject(raw);
    const st = m.levels[0].walls.map((w) => w.status);
    expect(st.filter((s) => s === 'existing')).toHaveLength(p.levels[0].walls.length);
    expect(st[st.length - 1]).toBe('new');
  });
});

describe('0.7 демонтируемая стена исключается из геометрии', () => {
  it('помещения объединяются, стена не строится в 3D и не мешает прогулке, перепланировка отмечена', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const cross = l.walls.find((w) => w.a.x === 4600 && w.b.x === 4600 && w.a.y === 0)!; // несущая между гостиной и спальней
    cross.status = 'demolish';
    syncRooms(l, roomDefaults());
    expect(l.rooms).toHaveLength(5);
    expect(geomOf(l).walls.some((w) => w.id === cross.id)).toBe(false);
    expect(geomOf(l).demolished.map((w) => w.id)).toEqual([cross.id]);
    expect(collisionSegments(l).some((s) => s.a.x === 4600 && s.b.x === 4600 && Math.min(s.a.y, s.b.y) < 3000)).toBe(false);
    const issues = validateProject(p).filter((i) => i.ruleId === 'apt.redevelopment');
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });
});

// ───────── Дуговые стены (основа для блока 1.3) ─────────
describe('дуговые стены: геометрия', () => {
  const arcWall = { ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { thickness: 200 }), arc: -1000 };
  it('длина дуги, радиус, середина', () => {
    const ai = arcInfo(arcWall)!;
    // хорда 4000, стрела 1000 → R = 4000²/(8·1000) + 500 = 2500
    expect(ai.radius).toBeCloseTo(2500, 6);
    expect(ai.length).toBeCloseTo(2 * 2500 * Math.asin(2000 / 2500), 3);
    expect(wallLen(arcWall)).toBeCloseTo(ai.length, 6);
    const m = arcMid(arcWall);
    expect(m.x).toBeCloseTo(2000, 3);
    expect(m.y).toBeCloseTo(-1000, 3); // сторона L у стены вдоль +x — это +y; стрела −1000 → выгиб в −y
    expect(pointAlong(arcWall, 0)).toEqual({ x: expect.closeTo(0, 6), y: expect.closeTo(0, 6) });
    expect(pointAlong(arcWall, ai.length).x).toBeCloseTo(4000, 4);
    expect(arcInfo({ ...arcWall, arc: 0 })).toBeNull();
    expect(wallLen({ ...arcWall, arc: undefined })).toBe(4000);
  });
  it('комната с дуговой стеной: помещение замкнуто, площадь больше прямоугольника на сегмент круга', () => {
    const l = createDemoProject().levels[0];
    l.walls = [arcWall, createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { thickness: 200 }), createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, { thickness: 200 }), createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, { thickness: 200 })];
    l.openings = [];
    l.items = [];
    const g = geomOf(l);
    expect(g.walls.length).toBeGreaterThan(8);
    expect(g.walls.filter((w) => baseWallId(w.id) === arcWall.id).length).toBe(g.walls.length - 3);
    const { rooms } = detectRooms(g.walls);
    expect(rooms).toHaveLength(1);
    const rect = 3.8 * 2.8;
    // сегмент круга R=2500 (ось), хорда 4000: площадь ≈ R²·(φ − sin φ)/2
    const phi = 2 * Math.asin(2000 / 2500);
    const seg = (2.5 * 2.5 * (phi - Math.sin(phi))) / 2;
    expect(rooms[0].areaMm2 / 1e6).toBeGreaterThan(rect + seg * 0.8);
    expect(rooms[0].areaMm2 / 1e6).toBeLessThan(rect + seg * 1.1);
  });
  it('проём на дуге занимает ровно один сегмент; поверхности помещения ссылаются на исходную стену', () => {
    const l = createDemoProject().levels[0];
    l.walls = [arcWall, createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, { thickness: 200 }), createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }, { thickness: 200 }), createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }, { thickness: 200 })];
    l.items = [];
    l.openings = [createOpening(arcWall.id, 'window', wallLen(arcWall) / 2, { width: 1200 })];
    const g = geomOf(l);
    expect(g.openings).toHaveLength(1);
    const seg = g.walls.find((w) => w.id === g.openings[0].wallId)!;
    const chord = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
    expect(g.openings[0].width).toBeCloseTo(chord, 6);
    expect(chord).toBeGreaterThan(1150);
    expect(chord).toBeLessThanOrEqual(1200);
    syncRooms(l, roomDefaults());
    const surf = roomSurfaces(l, l.rooms[0]);
    expect(surf.filter((s) => s.wallId === arcWall.id).length).toBeGreaterThan(4);
    expect(surf.filter((s) => s.openings.length === 1)).toHaveLength(1);
  });
  it('поиск стены под точкой возвращает исходную стену и положение вдоль дуги', () => {
    const l = { walls: [arcWall], openings: [] };
    const hit = locateOnWall(l, { x: 2000, y: -950 }, 200)!;
    expect(hit.wall.id).toBe(arcWall.id);
    expect(Math.abs(hit.pos - wallLen(arcWall) / 2)).toBeLessThan(25);
    expect(locateOnWall(l, { x: 2000, y: 0 }, 200)).toBeNull();
  });
  it('без дуг и демонтажа геометрия — те же массивы (ничего не копируется)', () => {
    const l = createDemoProject().levels[0];
    const g = geomOf(l);
    expect(g.walls).toBe(l.walls);
    expect(g.openings).toBe(l.openings);
    expect(geomOf(l)).toBe(g);
  });
});

// ───────── 0.8 Чертежи: внешние цепочки, марки проёмов, размеры без дублей ─────────
import { openingMarks, outerDimChains, roomDimPrims } from '../src/draw2d/plan';
import { buildSheet } from '../src/drawings/sheet';

describe('0.8 чертежи', () => {
  const demo = createDemoProject();
  const l = demo.levels[0];
  const sheet = buildSheet(demo, { kind: 'measure', levelId: l.id, paper: 'A3', landscape: true, scale: 0 });
  const texts = sheet.prims.filter((p) => p.t === 'text') as Extract<(typeof sheet.prims)[number], { t: 'text' }>[];

  it('внешние размерные цепочки: до трёх уровней на сторону (проёмы → оси → габарит)', () => {
    const res = outerDimChains(l.walls, l.openings)!;
    expect(res.bbox).toEqual({ minX: -150, minY: -150, maxX: 9150, maxY: 6950 });
    const top = res.chains.filter((c) => c.side === 'top');
    expect(top.map((c) => c.level)).toEqual([1, 2, 3]);
    // уровень 1: края двух окон верхней стены
    expect(top[0].ticks).toEqual([-150, 1400, 3200, 6050, 7550, 9150]);
    // уровень 2: ось поперечной несущей стены
    expect(top[1].ticks).toEqual([-150, 4600, 9150]);
    // уровень 3: габарит
    expect(top[2].ticks).toEqual([-150, 9150]);
    const right = res.chains.filter((c) => c.side === 'right');
    expect(right.map((c) => c.level)).toEqual([2, 3]); // на правой стене проёмов нет
    expect(right[0].ticks).toEqual([-150, 3900, 5700, 6950]);
  });
  it('на обмерном плане есть габаритные размеры и сумма звеньев цепочки равна габариту', () => {
    const vals = texts.map((t) => t.text);
    expect(vals).toContain('9300');
    expect(vals).toContain('7100');
    expect(vals).toContain('1550'); // простенок до первого окна
    expect(vals).toContain('1800'); // окно гостиной
    const res = outerDimChains(l.walls, l.openings)!;
    for (const c of res.chains) expect(c.ticks[c.ticks.length - 1] - c.ticks[0]).toBe(c.side === 'top' || c.side === 'bottom' ? 9300 : 7100);
  });
  it('размеры читаемы: шрифт размерных чисел не меньше 2 мм на бумаге', () => {
    const dims = texts.filter((t) => /^\d{3,5}$/.test(t.text));
    expect(dims.length).toBeGreaterThan(20);
    const small = dims.filter((t) => t.size < 2);
    expect(small.length / dims.length).toBeLessThan(0.15);
    expect(Math.min(...dims.map((t) => t.size))).toBeGreaterThanOrEqual(1.6);
  });
  it('внутренние размеры помещений без дублей: у прямоугольной комнаты — два размера', () => {
    const living = l.rooms.find((r) => r.type === 'living')!;
    const prims = roomDimPrims({ ...l, rooms: [living] }, 50);
    const nums = prims.filter((p) => p.t === 'text').map((p) => (p as { text: string }).text);
    expect(nums.sort()).toEqual(['3650', '4350']);
    // раньше размер ставился на каждое ребро контура
    const all = roomDimPrims(l, 50).filter((p) => p.t === 'text').length;
    const edges = l.rooms.reduce((s, r) => s + r.polygon.length, 0);
    expect(all).toBeLessThan(edges * 0.6);
  });
  it('марки окон и дверей: одинаковые проёмы — одна марка; ведомость на листе', () => {
    const { byId, schedule } = openingMarks(l.openings);
    expect(byId.size).toBe(l.openings.length);
    const marks = schedule.map((s) => s.mark);
    expect(marks).toEqual(expect.arrayContaining(['В-1', 'В-2', 'В-3', 'Д-1', 'Д-2', 'Д-3', 'ПР-1']));
    // две межкомнатные двери 800×2000 и две двери санузлов 700×2000
    expect(schedule.find((s) => s.kind === 'door' && s.width === 800)!.qty).toBe(2);
    expect(schedule.find((s) => s.kind === 'door' && s.width === 700)!.qty).toBe(2);
    expect(schedule.reduce((s, r) => s + r.qty, 0)).toBe(l.openings.length);
    const vals = texts.map((t) => t.text);
    expect(vals).toContain('Відомість прорізів');
    const m800 = schedule.find((s) => s.kind === 'door' && s.width === 800)!.mark;
    expect(vals.filter((v) => v === m800).length).toBe(3); // 2 на плане + строка ведомости
    expect(vals).toContain('1800×1500');
  });
  it('на обмерном плане нет мебели и её размеров; масштаб из стандартного ряда', () => {
    expect([50, 75, 100]).toContain(sheet.scale);
    const furn = buildSheet(demo, { kind: 'furniture', levelId: l.id, paper: 'A3', landscape: true, scale: 0 });
    // у плана мебели нет внешних цепочек и ведомости проёмов, у обмерного — нет контуров мебели
    expect(furn.prims.filter((p) => p.t === 'text').map((p) => (p as { text: string }).text)).not.toContain('Відомість прорізів');
    expect(sheet.prims.length).toBeLessThan(furn.prims.length + 400);
    expect(sheet.prims.filter((p) => p.t === 'circle').length).toBe(l.openings.length);
  });
});
