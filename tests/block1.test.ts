// Блок 0.2 и блок 1 (итерация 2): режимы и слои, мультивыделение, индикаторы геометрии, дуговые стены.
import { beforeEach, describe, expect, it } from 'vitest';
import '../src/catalog';
import { alignSnap } from '../src/editor2d/align';
import { createProject, createWall, roomDefaults } from '../src/model/defaults';
import { createDemoProject } from '../src/model/demo';
import { alignItems, distributeItems, itemBox, layerOfSel, makeItem, moveEntities, rotateEntities, selsInRect, translateWalls } from '../src/model/ops';
import { rightAngleMark, segRelations } from '../src/model/relations';
import type { Sel } from '../src/model/types';
import { arcInfo, geomOf, syncRooms, wallLen } from '../src/model/walls';
import { deleteSelection, duplicateSelection, nudgeSelection, selectAllInMode, selectWithMode } from '../src/store/actions';
import { useProject } from '../src/store/projectStore';
import { MODE_LAYERS, modeOfLayer, useUi } from '../src/store/uiStore';

const box = (x: number, y: number, w: number, d: number) => {
  const p = createProject('apartment', 't');
  const l = p.levels[0];
  const c = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + d },
    { x, y: y + d },
  ];
  for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 120 }));
  syncRooms(l, roomDefaults());
  return p;
};

describe('0.2 режимы и слои', () => {
  it('каждый слой принадлежит ровно одному режиму', () => {
    const all = Object.values(MODE_LAYERS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(modeOfLayer('walls')).toBe('plan');
    expect(modeOfLayer('furniture')).toBe('furniture');
    expect(modeOfLayer('electrical')).toBe('electrical');
    expect(modeOfLayer('plumbing')).toBe('water');
    expect(modeOfLayer('gas')).toBe('heating');
    expect(modeOfLayer('landscape')).toBe('site');
  });
  it('слой объекта выделения определяется по каталогу', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const cable = l.routes.find((r) => r.kind === 'el-cable')!;
    const sofa = l.items.find((i) => i.kind === 'sofa')!;
    expect(layerOfSel(p, { type: 'route', id: cable.id, scope: l.id })).toBe('electrical');
    expect(layerOfSel(p, { type: 'item', id: sofa.id, scope: l.id })).toBe('furniture');
    expect(layerOfSel(p, { type: 'wall', id: l.walls[0].id, scope: l.id })).toBe('walls');
  });
  it('рамка в режиме «План» берёт только стены, трассы и мебель не попадают', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const all = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };
    const plan = selsInRect(p, l.id, all, MODE_LAYERS.plan, true);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((s) => s.type === 'wall' || s.type === 'dim')).toBe(true);
    const el = selsInRect(p, l.id, all, MODE_LAYERS.electrical, true);
    expect(el.some((s) => s.type === 'route')).toBe(true);
    expect(el.every((s) => layerOfSel(p, s) === 'electrical')).toBe(true);
  });
});

describe('1.1 индикаторы геометрии', () => {
  const p = box(0, 0, 4000, 3000);
  const walls = p.levels[0].walls;
  it('прямой угол в начале отрезка, примыкающего к стене', () => {
    const r = segRelations({ x: 2000, y: 0 }, { x: 2000, y: 1500 }, walls);
    expect(r.right).toHaveLength(1);
    expect(r.right[0].at).toEqual({ x: 2000, y: 0 });
    expect(r.rel).toBe(90);
    expect(r.angle).toBe(90);
  });
  it('параллельность: ближайшая параллельная стена и расстояние до неё', () => {
    const r = segRelations({ x: 1000, y: 500 }, { x: 1000, y: 2500 }, walls);
    expect(r.parallel).not.toBeNull();
    expect(r.parallel!.dist).toBe(1000);
    expect(r.parallel!.wall.a.x).toBe(0);
  });
  it('наклонный отрезок: ни 90°, ни ∥; угол считается', () => {
    const r = segRelations({ x: 2000, y: 0 }, { x: 3000, y: 1000 }, walls);
    expect(r.right).toHaveLength(0);
    expect(r.parallel).toBeNull();
    expect(r.angle).toBe(45);
    expect(r.rel).toBe(45);
  });
  it('допуск: 0,3° ещё считается прямым углом, 2° — уже нет', () => {
    const near = segRelations({ x: 2000, y: 0 }, { x: 2000 + 1500 * Math.tan((0.3 * Math.PI) / 180), y: 1500 }, walls);
    const far = segRelations({ x: 2000, y: 0 }, { x: 2000 + 1500 * Math.tan((2 * Math.PI) / 180), y: 1500 }, walls);
    expect(near.right).toHaveLength(1);
    expect(far.right).toHaveLength(0);
  });
  it('значок прямого угла — три точки квадрата у вершины', () => {
    const r = segRelations({ x: 2000, y: 0 }, { x: 2000, y: 1500 }, walls);
    const m = rightAngleMark(r.right[0], 200);
    expect(m).toHaveLength(3);
    expect(m[1]).toEqual({ x: m[0].x + (m[2].x - 2000), y: m[2].y + (m[0].y - 0) });
  });
  it('выравнивание по краям и центрам соседей с направляющими', () => {
    const a = { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
    const moving = { minX: 1500, maxX: 2100, minY: 20, maxY: 620 };
    const r = alignSnap(moving, [a], 30);
    expect(r.dy).toBe(-20);
    expect(r.dx).toBe(0);
    expect(r.guides).toHaveLength(1);
    expect(alignSnap(moving, [a], 10).guides).toHaveLength(0);
  });
});

describe('1.2 мультивыделение: групповые операции', () => {
  it('три стены сдвигаются вместе, четвёртая тянется за узлами', () => {
    const p = box(0, 0, 4000, 3000);
    const l = p.levels[0];
    const [top, right, bottom, left] = l.walls;
    translateWalls(l, [top.id, right.id, bottom.id], { x: 500, y: 0 });
    expect(top.a).toEqual({ x: 500, y: 0 });
    expect(right.a).toEqual({ x: 4500, y: 0 });
    expect(bottom.b).toEqual({ x: 500, y: 3000 });
    // левая стена не выделена — её концы примыкали к выделенным и уехали следом
    expect(left.a).toEqual({ x: 500, y: 3000 });
    expect(left.b).toEqual({ x: 500, y: 0 });
    syncRooms(l, roomDefaults());
    expect(l.rooms).toHaveLength(1);
  });
  it('сдвиг двух стен из четырёх растягивает соседние (примыкающие узлы)', () => {
    const p = box(0, 0, 4000, 3000);
    const l = p.levels[0];
    const [top, right, bottom, left] = l.walls;
    moveEntities(p, [right, bottom].map((w) => ({ type: 'wall', id: w.id, scope: l.id }) as Sel), { x: 300, y: 200 });
    expect(right.a).toEqual({ x: 4300, y: 200 });
    expect(top.b).toEqual({ x: 4300, y: 200 }); // узел верхней стены потянулся
    expect(top.a).toEqual({ x: 0, y: 0 });
    expect(left.a).toEqual({ x: 300, y: 3200 });
    expect(left.b).toEqual({ x: 0, y: 0 });
  });
  it('группа объектов: перемещение, поворот вокруг общего центра', () => {
    const p = box(0, 0, 6000, 4000);
    const l = p.levels[0];
    const a = makeItem('chair', { x: 1000, y: 1000 }, 0, l);
    const b = makeItem('chair', { x: 2000, y: 1000 }, 0, l);
    l.items.push(a, b);
    const sels: Sel[] = [a, b].map((i) => ({ type: 'item', id: i.id, scope: l.id }));
    moveEntities(p, sels, { x: 100, y: 50 });
    expect([a.x, a.y, b.x, b.y]).toEqual([1100, 1050, 2100, 1050]);
    rotateEntities(p, sels, 90);
    expect([a.x, a.y]).toEqual([1600, 550]);
    expect([b.x, b.y]).toEqual([1600, 1550]);
    expect(a.rot).toBe(90);
  });
  it('выравнивание по левому краю и равномерное распределение', () => {
    const p = box(0, 0, 8000, 5000);
    const l = p.levels[0];
    const its = [1000, 1700, 4000].map((x, i) => makeItem('chair', { x, y: 1000 + i * 700 }, 0, l));
    l.items.push(...its);
    const sels: Sel[] = its.map((i) => ({ type: 'item', id: i.id, scope: l.id }));
    distributeItems(p, sels, 'x');
    const bs = its.map(itemBox);
    expect(Math.abs(bs[1].minX - bs[0].maxX - (bs[2].minX - bs[1].maxX))).toBeLessThanOrEqual(1);
    alignItems(p, sels, 'left');
    const left = its.map((i) => itemBox(i).minX);
    expect(new Set(left).size).toBe(1);
    alignItems(p, sels, 'vcenter');
    expect(new Set(its.map((i) => i.y)).size).toBe(1);
  });
  it('рамка: слева направо — только целиком внутри, справа налево — пересечённые', () => {
    const p = box(0, 0, 4000, 3000);
    const l = p.levels[0];
    const rect = { minX: -200, maxX: 4200, minY: -200, maxY: 1500 };
    const win = selsInRect(p, l.id, rect, ['walls'], true);
    const cross = selsInRect(p, l.id, rect, ['walls'], false);
    expect(win).toHaveLength(1); // только верхняя стена целиком в рамке
    expect(cross).toHaveLength(3); // верхняя и обе боковые
  });
});

describe('1.2 мультивыделение: действия интерфейса', () => {
  beforeEach(() => {
    const p = createDemoProject();
    useProject.getState().setProject(p);
    useUi.setState({ activeLevelId: p.levels[0].id, mode: 'plan', tool: 'select', selection: null, multi: [] });
  });
  const lvl = () => useProject.getState().project.levels[0];
  it('Shift+клик добавляет и убирает объект', () => {
    const l = lvl();
    const s1: Sel = { type: 'wall', id: l.walls[0].id, scope: l.id };
    const s2: Sel = { type: 'wall', id: l.walls[1].id, scope: l.id };
    useUi.getState().select(s1);
    useUi.getState().toggleSelect(s2);
    expect(useUi.getState().multi).toHaveLength(2);
    expect(useUi.getState().selection).toEqual(s2);
    useUi.getState().toggleSelect(s1);
    expect(useUi.getState().multi).toEqual([s2]);
  });
  it('Ctrl+A выбирает всё в активном режиме и ничего лишнего', () => {
    selectAllInMode();
    const p = useProject.getState().project;
    expect(useUi.getState().multi.length).toBe(lvl().walls.length + lvl().dims.length);
    useUi.getState().setMode('furniture');
    expect(useUi.getState().multi).toHaveLength(0); // смена режима сбрасывает выделение
    selectAllInMode();
    const m = useUi.getState().multi;
    expect(m.length).toBeGreaterThan(10);
    expect(m.every((s) => layerOfSel(p, s) === 'furniture')).toBe(true);
  });
  it('выделение объекта другого слоя переключает режим', () => {
    const l = lvl();
    const cable = l.routes.find((r) => r.kind === 'el-cable')!;
    selectWithMode({ type: 'route', id: cable.id, scope: l.id });
    expect(useUi.getState().mode).toBe('electrical');
    expect(useUi.getState().selection?.id).toBe(cable.id);
  });
  it('дублирование, сдвиг и удаление группы — по одной записи undo', () => {
    useUi.getState().setMode('furniture');
    const l = lvl();
    const chairs = l.items.filter((i) => i.kind === 'chair').slice(0, 3);
    expect(chairs).toHaveLength(3);
    useUi.getState().selectMany(chairs.map((i) => ({ type: 'item', id: i.id, scope: l.id })));
    const n0 = l.items.length;
    const past0 = useProject.getState().past.length;
    duplicateSelection();
    expect(lvl().items.length).toBe(n0 + 3);
    expect(useProject.getState().past.length).toBe(past0 + 1);
    expect(useUi.getState().multi).toHaveLength(3);
    const ids = useUi.getState().multi.map((s) => s.id);
    const before = lvl().items.filter((i) => ids.includes(i.id)).map((i) => i.x);
    nudgeSelection(100, 0);
    expect(lvl().items.filter((i) => ids.includes(i.id)).map((i) => i.x)).toEqual(before.map((x) => x + 100));
    deleteSelection();
    expect(lvl().items.length).toBe(n0);
    expect(useUi.getState().multi).toHaveLength(0);
  });
});

describe('1.3 дуговые стены', () => {
  it('дуга: длина больше хорды, помещение с дугой больше прямоугольного', () => {
    const p = box(0, 0, 4000, 3000);
    const l = p.levels[0];
    const area0 = l.rooms[0].area;
    const top = l.walls[0];
    top.arc = -800; // выгиб наружу (вверх)
    expect(wallLen(top)).toBeGreaterThan(4000);
    const info = arcInfo(top)!;
    expect(info.radius).toBeCloseTo((2000 * 2000 + 800 * 800) / (2 * 800), 0);
    syncRooms(l, roomDefaults());
    expect(l.rooms).toHaveLength(1);
    const grow = Math.abs(l.rooms[0].area - area0);
    // площадь сегмента круга ≈ 2/3·хорда·стрела (с поправкой на толщину стены)
    expect(grow).toBeGreaterThan(1.6);
    expect(grow).toBeLessThan(2.6);
    const g = geomOf(l);
    expect(g.walls.length).toBeGreaterThan(4 + 6);
  });
  it('групповой сдвиг сохраняет стрелу дуги', () => {
    const p = box(0, 0, 4000, 3000);
    const l = p.levels[0];
    l.walls[0].arc = 500;
    translateWalls(l, l.walls.map((w) => w.id), { x: 1000, y: 1000 });
    expect(l.walls[0].arc).toBe(500);
    expect(l.walls[0].a).toEqual({ x: 1000, y: 1000 });
  });
});
