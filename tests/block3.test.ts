// Блок 3 (итерация 2): UX — постановка объектов из каталога, избранное, подсказки, настройки 3D.
import { beforeEach, describe, expect, it } from 'vitest';
import '../src/catalog';
import { allItemDefs, itemDef } from '../src/catalog/registry';
import { poseNewItem } from '../src/editor2d/place';
import { createDemoProject } from '../src/model/demo';
import { pointInPolygon } from '../src/model/geometry';
import { useUi } from '../src/store/uiStore';

describe('3.2 постановка объекта из каталога (клик, перетаскивание на план и в 3D)', () => {
  const p = createDemoProject();
  const l = p.levels[0];
  const living = l.rooms.find((r) => r.type === 'living')!;
  it('в свободном месте объект встаёт по сетке в точку под курсором', () => {
    const it0 = poseNewItem(l, 'armchair', { x: 2412, y: 1987 }, {}, { grid: 50 });
    expect([it0.x, it0.y, it0.rot]).toEqual([2400, 2000, 0]);
    expect(pointInPolygon({ x: it0.x, y: it0.y }, living.polygon)).toBe(true);
    expect(it0.params).toEqual(itemDef('armchair')!.defaults);
  });
  it('у стены мебель прилипает спинкой, угол поворота точный', () => {
    // верхняя наружная стена гостиной: внутренняя грань y ≈ 200 (стена 400 мм по оси y = 0)
    const it1 = poseNewItem(l, 'wardrobe', { x: 2000, y: 480 }, {}, { grid: 50 });
    const d = itemDef('wardrobe')!.size(it1.params).d;
    expect(it1.rot).toBe(0);
    expect(Math.abs(it1.y - d / 2 - (l.walls[0].thickness / 2)) < 2).toBe(true);
  });
  it('инженерная точка прилипает к грани стены, объект участка — нет', () => {
    const sock = poseNewItem(l, 'el-socket', { x: 2000, y: 260 }, {}, { grid: 50 });
    expect(sock.y).toBe(l.walls[0].thickness / 2);
    expect(Number.isInteger(sock.rot)).toBe(true);
    const tree = poseNewItem(l, 'tree', { x: 2010, y: 260 }, {}, { grid: 50, site: true });
    expect([tree.x, tree.y]).toEqual([2000, 250]);
  });
  it('параметры из карточки (изделие конструктора) попадают в объект', () => {
    const it2 = poseNewItem(l, 'cabinet', { x: 2400, y: 2000 }, { designId: 'abc', w: 1800, d: 600, h: 2400 }, { grid: 50 });
    expect(it2.params).toMatchObject({ designId: 'abc', w: 1800 });
  });
  it('у объектов мебели и участка есть 3D-модель для миниатюры', () => {
    const noModel = allItemDefs().filter((d) => !d.hidden && (d.layer === 'furniture' || d.layer === 'landscape') && !d.parts);
    expect(noModel.map((d) => d.kind)).toEqual([]);
    expect(allItemDefs().filter((d) => d.layer === 'furniture' && !d.hidden).length).toBeGreaterThanOrEqual(60);
  });
});

describe('3.2–3.4 состояние интерфейса', () => {
  beforeEach(() => {
    useUi.setState({ favorites: [], hintsOff: false, hintsSeen: [] });
  });
  it('избранное: переключение', () => {
    useUi.getState().toggleFavorite('sofa');
    useUi.getState().toggleFavorite('el-socket');
    expect(useUi.getState().favorites).toEqual(['sofa', 'el-socket']);
    useUi.getState().toggleFavorite('sofa');
    expect(useUi.getState().favorites).toEqual(['el-socket']);
  });
  it('подсказки: «не показувати більше» и отметка просмотренных', () => {
    useUi.getState().markHint('wall');
    useUi.getState().markHint('wall');
    expect(useUi.getState().hintsSeen).toEqual(['wall']);
    useUi.getState().setHintsOff(true);
    expect(useUi.getState().hintsOff).toBe(true);
  });
  it('3D по умолчанию: инженерные сети скрыты, тени включены, рулетка выключена', () => {
    const s = useUi.getState();
    expect(s.show3dNetworks).toBe(false);
    expect(s.shadows3d).toBe(true);
    expect(s.measure3d).toBe(false);
  });
});
