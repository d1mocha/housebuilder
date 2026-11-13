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
