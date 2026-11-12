// Инженерные системы: точки (Item), трассы (Route), зоны (Zone) — каждая система на своём слое.
import { arc, circle, line, poly, rect, text } from '../draw2d/prims';
import type { Prim2, Style } from '../draw2d/prims';
import type { LayerId, Params } from '../model/types';
import { L, bool, num, pBool, pNum, pSel, registerItems, registerRoutes, registerZones, str } from './registry';
import type { ItemDef, ParamDef, Prim3, RouteDef, ZoneDef } from './registry';

const EL = '#dc2626';
const COLD = '#2563eb';
const HOT = '#e11d48';
const SEWER = '#92400e';
const HEAT = '#ea580c';
const GAS = '#ca8a04';
const VENT = '#0891b2';

const st = (c: string, w = 0.35, fill?: string): Style => ({ stroke: c, w, fill });
const P_Z = pNum('zInfo', L('Висота встановлення — у полі «Висота від підлоги»', 'Высота установки — в поле «Высота от пола»'), 0, 0);
void P_Z;
const P_GROUP: ParamDef = { key: 'group', label: L('Група', 'Группа'), type: 'group' };

function point(
  kind: string,
  layer: LayerId,
  name: [string, string],
  size: [number, number, number],
  z: number,
  symbol: (p: Params) => Prim2[],
  parts: (p: Params) => Prim3[],
  extra: Partial<ItemDef> & { xp?: ParamDef[]; xd?: Params } = {},
): ItemDef {
  const { xp = [], xd = {}, ...rest } = extra;
  return {
    kind,
    layer,
    group: layer,
    name: L(name[0], name[1]),
    params: xp,
    defaults: xd,
    size: () => ({ w: size[0], d: size[1], h: size[2] }),
    symbol: (p) => symbol(p),
    parts: (p) => parts(p),
    z,
    ...rest,
  };
}

const plate = (c: string, w = 80, h = 80): Prim3[] => [{ t: 'box', x: 0, y: 0, z: 0, w, d: 12, h, c }];
const label = (s: string, c: string, y = 0, size = 1.7): Prim2 => text(0, y, s, size, { color: c, bold: true });

const items: ItemDef[] = [
  // ───── Электрика ─────
  point('el-socket', 'electrical', ['Розетка', 'Розетка'], [80, 12, 80], 300, (p) => {
    const n = Math.max(1, num(p, 'count', 1));
    const out: Prim2[] = [arc(0, 0, 90, 0, 180, st(EL)), line(-90, 0, 90, 0, st(EL))];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 50;
      out.push(line(x, 88, x, 160, st(EL)));
    }
    if (bool(p, 'ip44')) out.push(label('IP44', EL, 220, 1.4));
    return out;
  }, (p) => plate('#f5f5f4', 80 * Math.max(1, num(p, 'count', 1))), {
    xp: [pNum('count', L('Кількість у блоці', 'Количество в блоке'), 1, 5, 1, 'шт'), pBool('ip44', L('Вологозахищена (IP44)', 'Влагозащищённая (IP44)')), P_GROUP, pNum('power', L('Потужність споживача', 'Мощность потребителя'), 0, 10000, 100, 'Вт')],
    xd: { count: 1, ip44: false, group: 'g-sockets', power: 0 },
  }),
  point('el-switch', 'electrical', ['Вимикач', 'Выключатель'], [80, 12, 80], 900, (p) => {
    const n = Math.max(1, num(p, 'gangs', 1));
    const out: Prim2[] = [circle(0, 50, 40, st(EL, 0.35, '#ffffff'))];
    for (let i = 0; i < n; i++) {
      const a = ((50 + i * 35) * Math.PI) / 180;
      const ex = Math.cos(a) * 170;
      const ey = 50 + Math.sin(a) * 170;
      out.push(line(Math.cos(a) * 40, 50 + Math.sin(a) * 40, ex, ey, st(EL)));
      out.push(line(ex, ey, ex - Math.sin(a) * 50, ey + Math.cos(a) * 50, st(EL)));
    }
    return out;
  }, () => plate('#f5f5f4'), { xp: [pNum('gangs', L('Клавіш', 'Клавиш'), 1, 3, 1, 'шт'), P_GROUP], xd: { gangs: 1, group: 'g-light' } }),
  point('el-light', 'electrical', ['Вивід під світильник', 'Вывод под светильник'], [120, 120, 30], 2570, () => [circle(0, 0, 110, st(EL, 0.35, '#ffffff')), line(-78, -78, 78, 78, st(EL)), line(78, -78, -78, 78, st(EL))], () => [{ t: 'cyl', x: 60, y: 60, z: 0, r: 50, h: 30, c: '#fff6dc', m: 'light' }], {
    xp: [P_GROUP, pNum('power', L('Потужність', 'Мощность'), 0, 2000, 5, 'Вт')],
    xd: { group: 'g-light', power: 15 },
    mount: 'ceiling',
  }),
  point('el-panel', 'electrical', ['Щиток розподільний', 'Щиток распределительный'], [300, 100, 400], 1400, () => [rect(-150, 0, 300, 100, st(EL, 0.5, '#ffffff')), poly([{ x: -150, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 100 }], true, { fill: EL, stroke: EL, w: 0.18 }), label('ЩР', EL, 190)], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 300, d: 100, h: 400, c: '#e7e5e4' }, { t: 'box', x: 20, y: 100, z: 60, w: 260, d: 6, h: 280, c: '#57534e', m: 'glass' }], {
    xp: [pNum('modules', L('Модулів', 'Модулей'), 4, 72, 2, 'шт')],
    xd: { modules: 24 },
  }),
  point('el-junction', 'electrical', ['Розподільна коробка', 'Распределительная коробка'], [90, 30, 90], 2400, () => [circle(0, 50, 55, st(EL, 0.35, '#ffffff')), circle(0, 50, 12, { fill: EL, stroke: EL })], () => plate('#d6d3d1', 90, 90)),
  point('el-cooker', 'electrical', ['Вивід під варильну поверхню', 'Вывод под варочную поверхность'], [100, 12, 100], 100, () => [rect(-70, 0, 140, 140, st(EL, 0.35, '#ffffff')), label('ВП', EL, 70)], () => plate('#f5f5f4', 100, 100), {
    xp: [P_GROUP, pNum('power', L('Потужність', 'Мощность'), 0, 12000, 100, 'Вт')],
    xd: { group: 'g-cooker', power: 7000 },
  }),

  // ───── Водопровод и канализация ─────
  point('pl-cold', 'plumbing', ['Вивід холодної води', 'Вывод холодной воды'], [60, 30, 60], 550, () => [circle(0, 50, 55, st(COLD, 0.35, '#ffffff')), label('В1', COLD, 50)], () => [{ t: 'cyl', x: 30, y: 0, z: 30, r: 14, h: 40, c: COLD, axis: 'y' }]),
  point('pl-hot', 'plumbing', ['Вивід гарячої води', 'Вывод горячей воды'], [60, 30, 60], 550, () => [circle(0, 50, 55, st(HOT, 0.35, '#ffffff')), label('Т3', HOT, 50)], () => [{ t: 'cyl', x: 30, y: 0, z: 30, r: 14, h: 40, c: HOT, axis: 'y' }]),
  point('pl-drain', 'plumbing', ['Вивід каналізації', 'Вывод канализации'], [110, 60, 110], 50, (p) => [circle(0, 60, 65, st(SEWER, 0.5, '#ffffff')), label('К1', SEWER, 60), label(`Ø${num(p, 'dia', 50)}`, SEWER, 160, 1.4)], (p) => [{ t: 'cyl', x: 55, y: 0, z: 55, r: num(p, 'dia', 50) / 2, h: 60, c: '#78716c', axis: 'y' }], {
    xp: [pSel('dia', L('Діаметр', 'Диаметр'), [['40', L('40 мм', '40 мм')], ['50', L('50 мм', '50 мм')], ['110', L('110 мм', '110 мм')]])],
    xd: { dia: 50 },
  }),
  point('pl-riser', 'plumbing', ['Стояк', 'Стояк'], [160, 160, 2600], 0, (p) => {
    const c = str(p, 'type', 'sewer') === 'sewer' ? SEWER : str(p, 'type') === 'hot' ? HOT : COLD;
    return [circle(0, 0, 80, st(c, 0.5, '#ffffff')), circle(0, 0, 45, st(c, 0.35)), label(str(p, 'type', 'sewer') === 'sewer' ? 'Ст.К' : str(p, 'type') === 'hot' ? 'Ст.Т3' : 'Ст.В1', c, 150, 1.5)];
  }, (p) => [{ t: 'cyl', x: 80, y: 80, z: 0, r: str(p, 'type', 'sewer') === 'sewer' ? 55 : 16, h: 2600, c: str(p, 'type', 'sewer') === 'sewer' ? '#78716c' : str(p, 'type') === 'hot' ? HOT : COLD }], {
    xp: [pSel('type', L('Тип', 'Тип'), [['sewer', L('Каналізація', 'Канализация')], ['cold', L('Холодна вода', 'Холодная вода')], ['hot', L('Гаряча вода', 'Горячая вода')]])],
    xd: { type: 'sewer' },
  }),
  point('pl-meter', 'plumbing', ['Вузол обліку води', 'Узел учёта воды'], [200, 80, 120], 400, () => [rect(-100, 0, 200, 90, st(COLD, 0.35, '#ffffff')), circle(0, 45, 30, st(COLD)), label('ЛВ', COLD, 150, 1.5)], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 200, d: 80, h: 120, c: '#93c5fd' }]),
  point('pl-manifold', 'plumbing', ['Колектор водопостачання', 'Коллектор водоснабжения'], [400, 90, 300], 500, () => [rect(-200, 0, 400, 90, st(COLD, 0.35, '#ffffff')), ...[-150, -75, 0, 75, 150].map((x) => line(x, 90, x, 150, st(COLD))), label('Кол.', COLD, 45, 1.5)], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 400, d: 90, h: 300, c: '#e5e7eb' }]),

  // ───── Отопление ─────
  point('ht-boiler', 'heating', ['Котел', 'Котёл'], [440, 300, 720], 1000, (p) => [rect(-220, 0, 440, 300, st(HEAT, 0.5, '#fff7ed')), label('К', HEAT, 120, 2.6), label(`${num(p, 'power', 24)} кВт`, HEAT, 230, 1.4)], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 440, d: 300, h: 720, c: '#f5f5f4' }, { t: 'cyl', x: 220, y: 150, z: 720, r: 50, h: 300, c: '#a8a29e', m: 'metal' }], {
    xp: [pSel('fuel', L('Тип', 'Тип'), [['gas', L('Газовий', 'Газовый')], ['electric', L('Електричний', 'Электрический')], ['solid', L('Твердопаливний', 'Твердотопливный')], ['heatpump', L('Тепловий насос', 'Тепловой насос')]]), pNum('power', L('Потужність', 'Мощность'), 1, 200, 1, 'кВт')],
    xd: { fuel: 'gas', power: 24 },
    mount: 'wall',
  }),
  point('ht-itp', 'heating', ['ІТП / вузол обліку тепла', 'ИТП / узел учёта тепла'], [500, 200, 600], 400, () => [rect(-250, 0, 500, 200, st(HEAT, 0.5, '#fff7ed')), label('ІТП', HEAT, 100, 2.2)], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 500, d: 200, h: 600, c: '#e7e5e4' }]),
  {
    kind: 'ht-radiator',
    layer: 'heating',
    group: 'heating',
    name: L('Радіатор', 'Радиатор'),
    params: [pNum('sections', L('Секцій', 'Секций'), 2, 30, 1, 'шт'), pNum('h', L('Висота', 'Высота'), 200, 2000, 10), pNum('sectionPower', L('Потужність секції', 'Мощность секции'), 50, 300, 5, 'Вт')],
    defaults: { sections: 8, h: 560, sectionPower: 150 },
    size: (p) => ({ w: num(p, 'sections', 8) * 80, d: 90, h: num(p, 'h', 560) }),
    symbol: (p, s) => {
      const out: Prim2[] = [rect(-s.w / 2, -45, s.w, 90, st(HEAT, 0.35, '#fff7ed'))];
      const n = Math.max(2, num(p, 'sections', 8));
      for (let i = 1; i < n; i++) out.push(line(-s.w / 2 + (s.w * i) / n, -45, -s.w / 2 + (s.w * i) / n, 45, st(HEAT, 0.13)));
      return out;
    },
    parts: (p, s) => {
      const out: Prim3[] = [];
      const n = Math.max(2, num(p, 'sections', 8));
      for (let i = 0; i < n; i++) out.push({ t: 'box', x: i * 80 + 6, y: 30, z: 0, w: 68, d: 60, h: s.h, c: '#fafaf9', m: 'ceramic' });
      return out;
    },
    z: 120,
    mount: 'wall',
  },
  point('ht-manifold', 'heating', ['Колектор опалення / теплої підлоги', 'Коллектор отопления / тёплого пола'], [600, 120, 500], 300, () => [rect(-300, 0, 600, 120, st(HEAT, 0.35, '#fff7ed')), ...[-225, -150, -75, 0, 75, 150, 225].map((x) => line(x, 120, x, 180, st(HEAT))), label('Кол.ТП', HEAT, 60, 1.5)], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 600, d: 120, h: 500, c: '#e5e7eb' }]),

  // ───── Газ (только отображение) ─────
  point('gas-meter', 'gas', ['Газовий лічильник', 'Газовый счётчик'], [220, 170, 250], 1600, () => [rect(-110, 0, 220, 170, st(GAS, 0.5, '#fefce8')), label('ЛГ', GAS, 85, 2)], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 220, d: 170, h: 250, c: '#fde68a' }]),
  point('gas-point', 'gas', ['Точка підключення газового приладу', 'Точка подключения газового прибора'], [80, 40, 80], 800, () => [poly([{ x: 0, y: 0 }, { x: 80, y: 130 }, { x: -80, y: 130 }], true, st(GAS, 0.5, '#fefce8')), label('Г', GAS, 90, 1.8)], () => [{ t: 'cyl', x: 40, y: 0, z: 40, r: 14, h: 50, c: '#eab308', axis: 'y' }], {
    xp: [pSel('appliance', L('Прилад', 'Прибор'), [['stove', L('Плита', 'Плита')], ['boiler', L('Котел', 'Котёл')], ['heater', L('Колонка', 'Колонка')]])],
    xd: { appliance: 'stove' },
  }),
  point('gas-riser', 'gas', ['Газовий стояк', 'Газовый стояк'], [80, 80, 2600], 0, () => [circle(0, 0, 60, st(GAS, 0.5, '#fefce8')), label('Ст.Г', GAS, 130, 1.5)], () => [{ t: 'cyl', x: 40, y: 40, z: 0, r: 16, h: 2600, c: '#eab308' }]),

  // ───── Вентиляция ─────
  point('vt-exhaust', 'ventilation', ['Витяжна решітка', 'Вытяжная решётка'], [200, 30, 200], 2300, () => [rect(-100, 0, 200, 60, st(VENT, 0.35, '#ecfeff')), line(-100, 0, 100, 60, st(VENT, 0.18)), line(100, 0, -100, 60, st(VENT, 0.18)), label('ВЕ', VENT, 130, 1.5)], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 200, d: 20, h: 200, c: '#f5f5f4' }]),
  point('vt-fan', 'ventilation', ['Витяжний вентилятор', 'Вытяжной вентилятор'], [180, 80, 180], 2300, (p) => [circle(0, 60, 70, st(VENT, 0.35, '#ecfeff')), line(-50, 10, 50, 110, st(VENT)), line(50, 10, -50, 110, st(VENT)), label(`Ø${num(p, 'dia', 100)}`, VENT, 180, 1.4)], () => [{ t: 'cyl', x: 90, y: 0, z: 90, r: 85, h: 60, c: '#f5f5f4', axis: 'y' }], {
    xp: [pSel('dia', L('Діаметр', 'Диаметр'), [['100', L('100 мм', '100 мм')], ['125', L('125 мм', '125 мм')], ['150', L('150 мм', '150 мм')]]), P_GROUP],
    xd: { dia: 100, group: 'g-light' },
  }),
  point('vt-supply', 'ventilation', ['Припливний клапан', 'Приточный клапан'], [150, 60, 150], 2000, () => [rect(-75, 0, 150, 70, st(VENT, 0.35, '#ecfeff')), poly([{ x: -30, y: 110 }, { x: 0, y: 75 }, { x: 30, y: 110 }], false, st(VENT)), label('ПК', VENT, 170, 1.5)], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 150, d: 50, h: 150, c: '#f5f5f4' }]),
  point('vt-shaft', 'ventilation', ['Вентканал (шахта)', 'Вентканал (шахта)'], [270, 270, 2600], 0, () => [rect(-135, -135, 270, 270, st(VENT, 0.5, '#ecfeff')), line(-135, -135, 135, 135, st(VENT, 0.18)), line(135, -135, -135, 135, st(VENT, 0.18))], () => [{ t: 'box', x: 0, y: 0, z: 0, w: 270, d: 270, h: 2600, c: '#d6d3d1' }]),
];

const P_ROUTE_Z = pNum('z', L('Висота прокладання', 'Высота прокладки'), 0, 4000, 10);
const P_CHASE = pBool('chase', L('У штробі', 'В штробе'));
const P_CHASE_D = pNum('chaseDepth', L('Глибина штроби', 'Глубина штробы'), 0, 100, 5);
const P_CHASE_W = pNum('chaseWidth', L('Ширина штроби', 'Ширина штробы'), 0, 200, 5);
const selNum = (key: string, label: [string, string], values: number[], unit: string): ParamDef => pSel(key, L(label[0], label[1]), values.map((v) => [String(v), L(`${String(v).replace('.', ',')} ${unit}`, `${String(v).replace('.', ',')} ${unit}`)]));

const routes: RouteDef[] = [
  {
    kind: 'el-cable',
    layer: 'electrical',
    group: 'electrical',
    name: L('Кабельна траса', 'Кабельная трасса'),
    params: [P_GROUP, selNum('section', ['Переріз', 'Сечение'], [1.5, 2.5, 4, 6, 10], 'мм²'), selNum('cores', ['Жил', 'Жил'], [2, 3, 5], ''), P_ROUTE_Z, P_CHASE, P_CHASE_D, P_CHASE_W],
    defaults: { group: 'g-sockets', section: 2.5, cores: 3, z: 2500, chase: true, chaseDepth: 20, chaseWidth: 20 },
    color: EL,
    dash: [3, 1],
    tag: (p) => `${num(p, 'cores', 3)}×${String(num(p, 'section', 2.5)).replace('.', ',')}`,
  },
  {
    kind: 'pl-pipe-cold',
    layer: 'plumbing',
    group: 'plumbing',
    name: L('Труба холодної води', 'Труба холодной воды'),
    params: [selNum('dia', ['Діаметр', 'Диаметр'], [16, 20, 25, 32], 'мм'), P_ROUTE_Z, P_CHASE, P_CHASE_D],
    defaults: { dia: 20, z: 300, chase: true, chaseDepth: 40 },
    color: COLD,
    tag: (p) => `В1 Ø${num(p, 'dia', 20)}`,
  },
  {
    kind: 'pl-pipe-hot',
    layer: 'plumbing',
    group: 'plumbing',
    name: L('Труба гарячої води', 'Труба горячей воды'),
    params: [selNum('dia', ['Діаметр', 'Диаметр'], [16, 20, 25, 32], 'мм'), P_ROUTE_Z, P_CHASE, P_CHASE_D],
    defaults: { dia: 20, z: 400, chase: true, chaseDepth: 40 },
    color: HOT,
    tag: (p) => `Т3 Ø${num(p, 'dia', 20)}`,
  },
  {
    kind: 'pl-sewer',
    layer: 'plumbing',
    group: 'plumbing',
    name: L('Каналізаційна труба', 'Канализационная труба'),
    params: [selNum('dia', ['Діаметр', 'Диаметр'], [40, 50, 110], 'мм'), pNum('slope', L('Ухил', 'Уклон'), 0, 200, 1, 'мм/м'), pNum('z', L('Висота початку (осі)', 'Высота начала (оси)'), -500, 2000, 10)],
    defaults: { dia: 50, slope: 30, z: 150 },
    color: SEWER,
    dash: [6, 1.5],
    tag: (p) => `К1 Ø${num(p, 'dia', 50)} i=${(num(p, 'slope', 30) / 1000).toFixed(3).replace('.', ',')}`,
  },
  {
    kind: 'ht-pipe-supply',
    layer: 'heating',
    group: 'heating',
    name: L('Труба опалення — подача', 'Труба отопления — подача'),
    params: [selNum('dia', ['Діаметр', 'Диаметр'], [16, 20, 25, 32], 'мм'), P_ROUTE_Z, P_CHASE, P_CHASE_D],
    defaults: { dia: 20, z: 80, chase: false, chaseDepth: 40 },
    color: '#dc2626',
    tag: (p) => `Т1 Ø${num(p, 'dia', 20)}`,
  },
  {
    kind: 'ht-pipe-return',
    layer: 'heating',
    group: 'heating',
    name: L('Труба опалення — зворотка', 'Труба отопления — обратка'),
    params: [selNum('dia', ['Діаметр', 'Диаметр'], [16, 20, 25, 32], 'мм'), P_ROUTE_Z, P_CHASE, P_CHASE_D],
    defaults: { dia: 20, z: 40, chase: false, chaseDepth: 40 },
    color: '#2563eb',
    dash: [4, 1.5],
    tag: (p) => `Т2 Ø${num(p, 'dia', 20)}`,
  },
  {
    kind: 'vt-duct',
    layer: 'ventilation',
    group: 'ventilation',
    name: L('Повітропровід', 'Воздуховод'),
    params: [selNum('dia', ['Діаметр', 'Диаметр'], [100, 125, 150, 200], 'мм'), P_ROUTE_Z],
    defaults: { dia: 125, z: 2450 },
    color: VENT,
    tag: (p) => `Ø${num(p, 'dia', 125)}`,
  },
];

const zones: ZoneDef[] = [
  {
    kind: 'ht-floor',
    layer: 'heating',
    group: 'heating',
    name: L('Тепла підлога (водяна)', 'Тёплый пол (водяной)'),
    params: [
      pNum('pitch', L('Крок укладання', 'Шаг укладки'), 50, 400, 10),
      selNum('dia', ['Труба', 'Труба'], [16, 20], 'мм'),
      pNum('offset', L('Відступ від краю', 'Отступ от края'), 0, 500, 10),
      pSel('layout', L('Розкладка', 'Раскладка'), [['snake', L('Змійка', 'Змейка')], ['spiral', L('Равлик', 'Улитка')]]),
      pNum('feed', L('Підведення до колектора', 'Подводка к коллектору'), 0, 50000, 100),
    ],
    defaults: { pitch: 150, dia: 16, offset: 100, layout: 'snake', feed: 3000 },
    color: '#fdba74',
  },
];

registerItems(items);
registerRoutes(routes);
registerZones(zones);

export const ENG_LAYERS: LayerId[] = ['electrical', 'plumbing', 'heating', 'gas', 'ventilation'];
