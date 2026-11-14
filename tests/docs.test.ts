import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RESERVE, buildEstimate, estimateTotal, wallNetArea } from '../src/calc/estimate';
import '../src/catalog';
import type { Prim2 } from '../src/draw2d/prims';
import { toDxf } from '../src/drawings/dxf';
import { sheetsToPdf } from '../src/drawings/pdf';
import { buildSheet, defaultSheetSpecs } from '../src/drawings/sheet';
import { planDxfLayers } from '../src/export/exports';
import { toCsv } from '../src/export/csv';
import { createLevel, createOpening, createProject, createWall, roomDefaults } from '../src/model/defaults';
import { createDemoProject } from '../src/model/demo';
import { migrateProject } from '../src/model/migrate';
import { syncRooms } from '../src/model/walls';
import { projectFromFile, projectToFile } from '../src/store/persistence';
import { applyRecipe, useProject } from '../src/store/projectStore';
import { snapPoint } from '../src/editor2d/snapping';
import { snapItemToWalls } from '../src/editor2d/itemSnap';

function finite(prims: Prim2[]): boolean {
  const ok = (n: number) => Number.isFinite(n);
  return prims.every((p) => {
    switch (p.t) {
      case 'line':
        return ok(p.x1) && ok(p.y1) && ok(p.x2) && ok(p.y2);
      case 'poly':
        return p.pts.every((q) => ok(q.x) && ok(q.y));
      case 'path':
        return p.rings.every((r) => r.every((q) => ok(q.x) && ok(q.y)));
      case 'circle':
      case 'arc':
        return ok(p.cx) && ok(p.cy) && ok(p.r);
      case 'text':
        return ok(p.x) && ok(p.y) && p.text !== undefined;
    }
  });
}

function houseProject() {
  const p = createProject('house', 'Будинок');
  const l = p.levels[0];
  const c = [{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 7000 }, { x: 0, y: 7000 }];
  for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 400, material: 'aerated', exterior: true, loadBearing: true }));
  l.walls.push(createWall({ x: 4000, y: 0 }, { x: 4000, y: 7000 }, { thickness: 100, material: 'gkl' }));
  l.openings.push(createOpening(l.walls[0].id, 'window', 2000, { width: 1500 }));
  l.openings.push(createOpening(l.walls[2].id, 'door', 2000, { width: 1000, style: 'entrance' }));
  syncRooms(l, roomDefaults());
  const l2 = createLevel('2 поверх', 3000, 2700);
  l2.walls = l.walls.slice(0, 4).map((w, i) => ({ ...w, id: `u${i}` }));
  syncRooms(l2, roomDefaults());
  p.levels.push(l2);
  return p;
}

describe('чертежи', () => {
  const demo = createDemoProject();
  it('набор листов по умолчанию для квартиры: планы по слоям, развёртки по помещениям, разрезы', () => {
    const specs = defaultSheetSpecs(demo);
    const kinds = specs.map((s) => s.kind);
    for (const k of ['measure', 'furniture', 'electrical', 'plumbing', 'heating', 'section']) expect(kinds).toContain(k);
    expect(kinds.filter((k) => k === 'elevations')).toHaveLength(6);
    expect(kinds).not.toContain('facades');
  });
  it('каждый лист строится: рамка, штамп, содержимое в пределах листа, масштаб из стандартного ряда', () => {
    for (const [i, spec] of defaultSheetSpecs(demo).entries()) {
      const sh = buildSheet(demo, spec, 'uk', i + 1);
      expect(sh.w).toBe(420);
      expect(sh.h).toBe(297);
      expect(sh.prims.length, spec.kind).toBeGreaterThan(30);
      expect(finite(sh.prims), spec.kind).toBe(true);
      expect([10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 1000]).toContain(sh.scale);
      const texts = sh.prims.filter((p) => p.t === 'text').map((p) => (p as { text: string }).text);
      expect(texts.some((t) => t.startsWith('Масштаб 1:'))).toBe(true);
      expect(texts.some((t) => t.startsWith('Аркуш'))).toBe(true);
    }
  });
  it('обмерный план содержит размеры помещений и площади; план электрики — условные обозначения', () => {
    const m = buildSheet(demo, { kind: 'measure', levelId: demo.levels[0].id, paper: 'A3', landscape: true, scale: 0 });
    const texts = m.prims.filter((p) => p.t === 'text').map((p) => (p as { text: string }).text);
    expect(texts).toContain('Вітальня');
    expect(texts.some((t) => /м²$/.test(t))).toBe(true);
    expect(texts).toContain('4350'); // внутренний размер гостиной
    expect(m.scale).toBe(75); // с внешними размерными цепочками и ведомостью проёмов
    const e = buildSheet(demo, { kind: 'electrical', levelId: demo.levels[0].id, paper: 'A3', landscape: true, scale: 0 }, 'ru');
    const et = e.prims.filter((p) => p.t === 'text').map((p) => (p as { text: string }).text);
    expect(et).toContain('Условные обозначения');
    expect(et).toContain('Розетка');
    expect(et).toContain('Кабельная трасса');
  });
  it('дом: фасады, разрез с отметками этажей, план участка', () => {
    const p = houseProject();
    const kinds = defaultSheetSpecs(p).map((s) => s.kind);
    expect(kinds).toContain('facades');
    expect(kinds).toContain('site');
    const f = buildSheet(p, { kind: 'facades', levelId: p.levels[0].id, paper: 'A3', landscape: true, scale: 0 });
    const ft = f.prims.filter((q) => q.t === 'text').map((q) => (q as { text: string }).text);
    expect(ft.filter((t) => /^Фасад [А-Г] /.test(t))).toHaveLength(4);
    const s = buildSheet(p, { kind: 'section', levelId: p.levels[0].id, paper: 'A3', landscape: true, scale: 0, sectionAxis: 'y', sectionPos: 0.5 });
    const st = s.prims.filter((q) => q.t === 'text').map((q) => (q as { text: string }).text);
    expect(st).toContain('+0,000');
    expect(st).toContain('+3,000');
    expect(st).toContain('+5,700');
    expect(finite(f.prims) && finite(s.prims)).toBe(true);
  });
  it('PDF: многостраничный документ с кириллическим шрифтом', () => {
    const fonts = {
      regular: readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf').toString('base64'),
      bold: readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf').toString('base64'),
    };
    const specs = defaultSheetSpecs(demo).slice(0, 4);
    const doc = sheetsToPdf(specs.map((s, i) => buildSheet(demo, s, 'uk', i + 1)), fonts);
    expect(doc.getNumberOfPages()).toBe(4);
    const bytes = Buffer.from(doc.output('arraybuffer'));
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(50_000);
    expect(bytes.includes(Buffer.from('DejaVu'))).toBe(true);
  });
  it('DXF: слои, сущности, кириллица через \\U+XXXX, корректное завершение', () => {
    const dxf = toDxf(planDxfLayers(demo, demo.levels[0]), 50);
    expect(dxf.startsWith('0\nSECTION')).toBe(true);
    expect(dxf.endsWith('ENDSEC\n0\nEOF')).toBe(true);
    for (const layer of ['WALLS', 'OPENINGS', 'FURNITURE', 'ELECTRICAL', 'ROOMS', 'DIMENSIONS']) expect(dxf).toContain(`\n8\n${layer}\n`);
    expect(dxf).toContain('\\U+0412'); // «В» из «Вітальня»
    expect(/[^\x00-\x7F]/.test(dxf)).toBe(false);
    expect((dxf.match(/\n0\nLINE\n/g) ?? []).length).toBeGreaterThan(500);
  });
});

describe('смета', () => {
  it('площадь стены нетто вычитает проёмы', () => {
    const p = houseProject();
    const l = p.levels[0];
    expect(wallNetArea(l, l.walls[0].id)).toBe(9000 * 2800 - 1500 * 1400);
  });
  it('газоблок: количество по объёму, запас округляет вверх', () => {
    const p = houseProject();
    p.levels.pop();
    const lines = buildEstimate(p);
    const blocks = lines.find((x) => x.key === 'wall.aerated.400')!;
    const l = p.levels[0];
    const vol = l.walls.slice(0, 4).reduce((s, w) => s + wallNetArea(l, w.id), 0) / 1e6 * 0.4;
    expect(blocks.qty).toBeCloseTo(vol / (0.6 * 0.2 * 0.4), 1);
    expect(blocks.reservePct).toBe(DEFAULT_RESERVE.walls);
    expect(blocks.total).toBe(Math.ceil(blocks.qty * 1.05 - 1e-9));
    // утеплитель фасада и ГКЛ-перегородка
    expect(lines.find((x) => x.key === 'insulation.facade')!.qty).toBeCloseTo(vol / 0.4, 1);
    const gkl = lines.find((x) => x.key === 'gkl.sheet')!;
    expect(gkl.qty).toBeCloseTo((7 * 2.8 * 2) / 3, 1);
    expect(lines.find((x) => x.key === 'gkl.uw')!.qty).toBe(14);
  });
  it('цены и запас пользователя дают сумму', () => {
    const p = createDemoProject();
    let lines = buildEstimate(p);
    expect(estimateTotal(lines)).toBe(0);
    const cable = lines.find((x) => x.key === 'cable.3×2,5')!;
    expect(cable.qty).toBeGreaterThan(10);
    p.prices[cable.key] = 40;
    p.reserves.cable = 20;
    lines = buildEstimate(p);
    const c2 = lines.find((x) => x.key === cable.key)!;
    expect(c2.total).toBe(Math.ceil(cable.qty * 1.2 - 1e-9));
    expect(c2.sum).toBe(c2.total * 40);
    expect(estimateTotal(lines)).toBe(c2.sum);
    // демо содержит ожидаемые разделы
    const cats = new Set(lines.map((x) => x.category));
    for (const c of ['paint', 'tile', 'flooring', 'ceiling', 'cable', 'pipes', 'devices', 'furniture']) expect(cats.has(c as never), c).toBe(true);
    expect(lines.find((x) => x.key === 'furn.board.ldsp18')!.qty).toBeGreaterThanOrEqual(2);
  });
  it('CSV: BOM, «;», экранирование, десятичная запятая', () => {
    const csv = toCsv([['a;b', 1.5, 'x"y'], ['к', 2, '']]);
    expect(csv).toBe('﻿"a;b";1,5;"x""y"\r\nк;2;');
  });
});

describe('хранилище и файл проекта', () => {
  it('undo/redo и транзакции: перетаскивание даёт одну запись истории', () => {
    const st = useProject.getState();
    st.setProject(createProject('apartment', 'u'));
    const id = useProject.getState().project.levels[0].id;
    useProject.getState().update((d) => void d.levels[0].walls.push(createWall({ x: 0, y: 0 }, { x: 3000, y: 0 })));
    expect(useProject.getState().past).toHaveLength(1);
    useProject.getState().begin();
    for (let i = 1; i <= 5; i++) useProject.getState().transient((d) => void (d.levels[0].walls[0].b.x = 3000 + i * 100));
    expect(useProject.getState().past).toHaveLength(1);
    useProject.getState().commit();
    expect(useProject.getState().past).toHaveLength(2);
    expect(useProject.getState().project.levels[0].walls[0].b.x).toBe(3500);
    useProject.getState().undo();
    expect(useProject.getState().project.levels[0].walls[0].b.x).toBe(3000);
    useProject.getState().undo();
    expect(useProject.getState().project.levels[0].walls).toHaveLength(0);
    useProject.getState().redo();
    useProject.getState().redo();
    expect(useProject.getState().project.levels[0].walls[0].b.x).toBe(3500);
    useProject.getState().begin();
    useProject.getState().transient((d) => void (d.levels[0].walls[0].b.x = 9999));
    useProject.getState().cancel();
    expect(useProject.getState().project.levels[0].walls[0].b.x).toBe(3500);
    expect(useProject.getState().project.levels[0].id).toBe(id);
  });
  it('помещения пересчитываются автоматически при изменении стен', () => {
    const base = createProject('apartment', 'r');
    const next = applyRecipe(base, (d) => {
      const c = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
      for (let i = 0; i < 4; i++) d.levels[0].walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 200 }));
    });
    expect(next.levels[0].rooms).toHaveLength(1);
    expect(next.levels[0].rooms[0].area).toBeCloseTo(3.8 * 2.8, 2);
    expect(base.levels[0].rooms).toHaveLength(0);
  });
  it('файл проекта: экспорт → импорт без потерь; миграция дозаполняет поля', () => {
    const p = createDemoProject();
    const back = projectFromFile(projectToFile(p));
    expect(back).toEqual(p);
    const old = { id: 'x', name: 'old', kind: 'apartment', levels: [{ id: 'l', name: 'L', elevation: 0, height: 2600, walls: [] }] } as never;
    const m = migrateProject(old);
    expect(m.finishes.length).toBeGreaterThan(5);
    expect(m.levels[0].items).toEqual([]);
    expect(m.cabinetCatalog.kerf).toBe(4);
    expect(() => projectFromFile('{"foo":1}')).toThrow();
  });
});

describe('привязки', () => {
  const walls = [createWall({ x: 0, y: 0 }, { x: 5000, y: 0 }), createWall({ x: 5000, y: 0 }, { x: 5000, y: 4000 })];
  it('узел важнее всего', () => {
    const r = snapPoint({ x: 4960, y: 30 }, { walls, grid: 100, angle: true, tol: 100 });
    expect(r.kind).toBe('node');
    expect(r.point).toEqual({ x: 5000, y: 0 });
  });
  it('проекция на ось стены', () => {
    const r = snapPoint({ x: 2030, y: 40 }, { walls, grid: 100, angle: true, tol: 100 });
    expect(r.kind).toBe('wall');
    expect(r.point.x).toBeCloseTo(2030);
    expect(r.point.y).toBeCloseTo(0);
  });
  it('угол 90° от предыдущей точки и длина по сетке', () => {
    const r = snapPoint({ x: 1010, y: 2480 }, { walls: [], grid: 100, angle: true, tol: 60, from: { x: 1000, y: 1000 } });
    expect(r.kind).toBe('angle');
    expect(r.point.x).toBeCloseTo(1000);
    expect(r.point.y).toBeCloseTo(2500);
  });
  it('луч пересекается с осью стены', () => {
    const r = snapPoint({ x: 2000, y: 60 }, { walls, grid: 100, angle: true, tol: 100, from: { x: 2000, y: 3000 } });
    expect(r.point.x).toBeCloseTo(2000);
    expect(r.point.y).toBeCloseTo(0);
  });
  it('сетка, когда рядом ничего нет', () => {
    const r = snapPoint({ x: 2540, y: 2260 }, { walls, grid: 100, angle: false, tol: 30 });
    expect(r.kind).toBe('grid');
    expect(r.point).toEqual({ x: 2500, y: 2300 });
  });
  it('мебель прилипает спинкой к стене и боком к перпендикулярной', () => {
    const w2 = [createWall({ x: 0, y: 0 }, { x: 5000, y: 0 }, { thickness: 200 }), createWall({ x: 0, y: 0 }, { x: 0, y: 4000 }, { thickness: 200 })];
    const r = snapItemToWalls({ x: 520, y: 480 }, 800, 600, 0, w2, 200);
    expect(r.snapped).toBe(true);
    expect(r.rot).toBe(0);
    expect(r.y).toBe(100 + 300);
    expect(r.x).toBe(100 + 400);
  });
});

describe('хранилище: устойчивость рецептов', () => {
  it('рецепт-выражение, возвращающий значение, не ломает изменение', () => {
    const base = createProject('house', 's');
    const next = applyRecipe(base, (d) => (d.sun.enabled = true) as unknown as void);
    expect(next.sun.enabled).toBe(true);
  });
});
