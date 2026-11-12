// Участок и ландшафт: растения, сооружения, дорожки, заборы, покрытия.
import { circle, line, poly, rect, text } from '../draw2d/prims';
import type { Prim2, Style } from '../draw2d/prims';
import { L, P_COLOR, num, pColor, pNum, pSel, registerItems, registerRoutes, registerZones, str } from './registry';
import type { ItemDef, Prim3, RouteDef, ZoneDef } from './registry';

const st = (c: string, w = 0.35, fill?: string): Style => ({ stroke: c, w, fill });
const GREEN = '#15803d';

const items: ItemDef[] = [
  {
    kind: 'tree',
    layer: 'landscape',
    group: 'plants',
    scope: 'site',
    name: L('Дерево', 'Дерево'),
    params: [pNum('h', L('Висота', 'Высота'), 500, 30000, 100), pNum('crown', L('Діаметр крони', 'Диаметр кроны'), 300, 15000, 100), pSel('type', L('Тип', 'Тип'), [['deciduous', L('Листяне', 'Лиственное')], ['conifer', L('Хвойне', 'Хвойное')], ['fruit', L('Плодове', 'Плодовое')]])],
    defaults: { h: 6000, crown: 4000, type: 'deciduous' },
    size: (p) => ({ w: num(p, 'crown', 4000), d: num(p, 'crown', 4000), h: num(p, 'h', 6000) }),
    symbol: (p, s) => {
      const r = s.w / 2;
      const out: Prim2[] = [circle(0, 0, r, { stroke: GREEN, w: 0.35, fill: '#86efac', opacity: 0.55 }), circle(0, 0, Math.min(150, r * 0.2), st('#713f12', 0.25, '#a16207'))];
      if (str(p, 'type') === 'conifer') for (let i = 0; i < 8; i++) out.push(line(0, 0, Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r, st(GREEN, 0.13)));
      return out;
    },
    parts: (p, s) => {
      const r = s.w / 2;
      const trunk: Prim3 = { t: 'cyl', x: r, y: r, z: 0, r: Math.max(60, s.h * 0.025), h: s.h * 0.45, c: '#7c5a3a' };
      if (str(p, 'type') === 'conifer') return [trunk, { t: 'cyl', x: r, y: r, z: s.h * 0.18, r, h: s.h * 0.82, c: '#2f6b3a', m: 'leaf', r2: 20 }];
      return [trunk, { t: 'sphere', x: r, y: r, z: s.h * 0.68, r: Math.min(r, s.h * 0.4), c: str(p, 'type') === 'fruit' ? '#6aa84f' : '#4f8a4b', m: 'leaf' }];
    },
  },
  {
    kind: 'bush',
    layer: 'landscape',
    group: 'plants',
    scope: 'site',
    name: L('Кущ', 'Куст'),
    params: [pNum('h', L('Висота', 'Высота'), 200, 4000, 50), pNum('crown', L('Діаметр', 'Диаметр'), 200, 5000, 50)],
    defaults: { h: 1200, crown: 1200 },
    size: (p) => ({ w: num(p, 'crown', 1200), d: num(p, 'crown', 1200), h: num(p, 'h', 1200) }),
    symbol: (_p, s) => [circle(0, 0, s.w / 2, { stroke: GREEN, w: 0.25, fill: '#bbf7d0', opacity: 0.7, dash: [1, 0.6] })],
    parts: (_p, s) => [{ t: 'sphere', x: s.w / 2, y: s.w / 2, z: s.h * 0.5, r: Math.min(s.w / 2, s.h * 0.55), c: '#5f9a55', m: 'leaf' }],
  },
  {
    kind: 'septic',
    layer: 'landscape',
    group: 'siteobj',
    scope: 'site',
    name: L('Септик', 'Септик'),
    params: [pNum('dia', L('Діаметр', 'Диаметр'), 500, 4000, 50)],
    defaults: { dia: 1500 },
    size: (p) => ({ w: num(p, 'dia', 1500), d: num(p, 'dia', 1500), h: 200 }),
    symbol: (_p, s) => [circle(0, 0, s.w / 2, st('#78350f', 0.5, '#fde68a')), circle(0, 0, 300, st('#78350f', 0.25)), text(0, 0, 'Септик', 1.8, { color: '#78350f', bold: true })],
    parts: (_p, s) => [{ t: 'cyl', x: s.w / 2, y: s.w / 2, z: 0, r: s.w / 2, h: 60, c: '#9ca3af' }, { t: 'cyl', x: s.w / 2, y: s.w / 2, z: 60, r: 320, h: 120, c: '#4b5563' }],
  },
  {
    kind: 'well',
    layer: 'landscape',
    group: 'siteobj',
    scope: 'site',
    name: L('Колодязь', 'Колодец'),
    params: [pNum('dia', L('Діаметр', 'Диаметр'), 500, 3000, 50)],
    defaults: { dia: 1200 },
    size: (p) => ({ w: num(p, 'dia', 1200), d: num(p, 'dia', 1200), h: 900 }),
    symbol: (_p, s) => [circle(0, 0, s.w / 2, st('#1d4ed8', 0.5, '#dbeafe')), circle(0, 0, s.w / 2 - 120, st('#1d4ed8', 0.25, '#93c5fd')), text(0, s.w / 2 + 200, 'Колодязь', 1.6, { color: '#1d4ed8' })],
    parts: (_p, s) => [{ t: 'cyl', x: s.w / 2, y: s.w / 2, z: 0, r: s.w / 2, h: 800, c: '#a8a29e' }, { t: 'cyl', x: s.w / 2, y: s.w / 2, z: 800, r: s.w / 2 + 60, h: 60, c: '#78716c' }],
  },
  {
    kind: 'borehole',
    layer: 'landscape',
    group: 'siteobj',
    scope: 'site',
    name: L('Свердловина', 'Скважина'),
    params: [],
    defaults: {},
    size: () => ({ w: 600, d: 600, h: 400 }),
    symbol: () => [circle(0, 0, 300, st('#1d4ed8', 0.5, '#dbeafe')), line(-300, 0, 300, 0, st('#1d4ed8', 0.25)), line(0, -300, 0, 300, st('#1d4ed8', 0.25)), text(0, 520, 'Свердл.', 1.6, { color: '#1d4ed8' })],
    parts: () => [{ t: 'cyl', x: 300, y: 300, z: 0, r: 300, h: 80, c: '#9ca3af' }, { t: 'cyl', x: 300, y: 300, z: 80, r: 90, h: 320, c: '#3b82f6', m: 'metal' }],
  },
  {
    kind: 'gate',
    layer: 'landscape',
    group: 'fence',
    scope: 'site',
    name: L('Ворота', 'Ворота'),
    params: [pNum('w', L('Ширина', 'Ширина'), 2000, 8000, 50), pNum('h', L('Висота', 'Высота'), 800, 3000, 50), P_COLOR],
    defaults: { w: 3500, h: 1800, color: '#57534e' },
    size: (p) => ({ w: num(p, 'w', 3500), d: 120, h: num(p, 'h', 1800) }),
    symbol: (_p, s) => [rect(-s.w / 2, -60, s.w, 120, st('#44403c', 0.5, '#e7e5e4')), line(0, -60, 0, 60, st('#44403c', 0.25)), text(0, 260, 'Ворота', 1.6, { color: '#44403c' })],
    parts: (p, s) => [{ t: 'box', x: 0, y: 30, z: 80, w: s.w / 2 - 15, d: 50, h: s.h - 80, c: str(p, 'color', '#57534e'), m: 'metal' }, { t: 'box', x: s.w / 2 + 15, y: 30, z: 80, w: s.w / 2 - 15, d: 50, h: s.h - 80, c: str(p, 'color', '#57534e'), m: 'metal' }, { t: 'box', x: -60, y: 0, z: 0, w: 120, d: 120, h: s.h + 100, c: '#78716c' }, { t: 'box', x: s.w - 60, y: 0, z: 0, w: 120, d: 120, h: s.h + 100, c: '#78716c' }],
  },
  {
    kind: 'wicket',
    layer: 'landscape',
    group: 'fence',
    scope: 'site',
    name: L('Хвіртка', 'Калитка'),
    params: [pNum('w', L('Ширина', 'Ширина'), 700, 1500, 50), pNum('h', L('Висота', 'Высота'), 800, 3000, 50), P_COLOR],
    defaults: { w: 1000, h: 1800, color: '#57534e' },
    size: (p) => ({ w: num(p, 'w', 1000), d: 100, h: num(p, 'h', 1800) }),
    symbol: (_p, s) => [rect(-s.w / 2, -50, s.w, 100, st('#44403c', 0.5, '#e7e5e4')), text(0, 240, 'Хвіртка', 1.5, { color: '#44403c' })],
    parts: (p, s) => [{ t: 'box', x: 0, y: 25, z: 80, w: s.w, d: 50, h: s.h - 80, c: str(p, 'color', '#57534e'), m: 'metal' }],
  },
  {
    kind: 'gazebo',
    layer: 'landscape',
    group: 'siteobj',
    scope: 'site',
    name: L('Альтанка', 'Беседка'),
    params: [pNum('w', L('Ширина', 'Ширина'), 1500, 8000, 100), pNum('d', L('Глибина', 'Глубина'), 1500, 8000, 100), pNum('h', L('Висота', 'Высота'), 2000, 4000, 100)],
    defaults: { w: 3000, d: 3000, h: 2700 },
    size: (p) => ({ w: num(p, 'w', 3000), d: num(p, 'd', 3000), h: num(p, 'h', 2700) }),
    symbol: (_p, s) => [rect(-s.w / 2, -s.d / 2, s.w, s.d, st('#92400e', 0.5, '#fef3c7')), line(-s.w / 2, -s.d / 2, s.w / 2, s.d / 2, st('#92400e', 0.13)), line(s.w / 2, -s.d / 2, -s.w / 2, s.d / 2, st('#92400e', 0.13)), text(0, 0, 'Альтанка', 1.8, { color: '#92400e', halo: true })],
    parts: (_p, s) => [
      ...[[0, 0], [s.w - 120, 0], [0, s.d - 120], [s.w - 120, s.d - 120]].map(([x, y]): Prim3 => ({ t: 'box', x, y, z: 0, w: 120, d: 120, h: s.h - 500, c: '#a16207', m: 'wood' })),
      { t: 'box', x: -200, y: -200, z: s.h - 500, w: s.w + 400, d: s.d + 400, h: 80, c: '#92400e', m: 'wood' },
      { t: 'cyl', x: s.w / 2, y: s.d / 2, z: s.h - 420, r: Math.max(s.w, s.d) * 0.72, h: 420, c: '#7a3b2e', r2: 60 },
      { t: 'box', x: 0, y: 0, z: 0, w: s.w, d: s.d, h: 60, c: '#d6b48a', m: 'wood' },
    ],
  },
  {
    kind: 'outbuilding',
    layer: 'landscape',
    group: 'siteobj',
    scope: 'site',
    name: L('Господарська будівля / гараж', 'Хозпостройка / гараж'),
    params: [pNum('w', L('Ширина', 'Ширина'), 1500, 12000, 100), pNum('d', L('Глибина', 'Глубина'), 1500, 12000, 100), pNum('h', L('Висота', 'Высота'), 2000, 5000, 100), P_COLOR],
    defaults: { w: 4000, d: 6000, h: 2800, color: '#d6d3d1' },
    size: (p) => ({ w: num(p, 'w', 4000), d: num(p, 'd', 6000), h: num(p, 'h', 2800) }),
    symbol: (_p, s) => [rect(-s.w / 2, -s.d / 2, s.w, s.d, st('#44403c', 0.5, '#e7e5e4')), text(0, 0, 'Госп. будівля', 1.8, { color: '#44403c' })],
    parts: (p, s) => [{ t: 'box', x: 0, y: 0, z: 0, w: s.w, d: s.d, h: s.h, c: str(p, 'color', '#d6d3d1') }, { t: 'box', x: -150, y: -150, z: s.h, w: s.w + 300, d: s.d + 300, h: 120, c: '#57534e' }],
  },
  {
    kind: 'carport',
    layer: 'landscape',
    group: 'siteobj',
    scope: 'site',
    name: L('Навіс для авто', 'Навес для авто'),
    params: [pNum('w', L('Ширина', 'Ширина'), 2500, 8000, 100), pNum('d', L('Глибина', 'Глубина'), 4000, 8000, 100), pNum('h', L('Висота', 'Высота'), 2000, 3500, 100)],
    defaults: { w: 3000, d: 5500, h: 2400 },
    size: (p) => ({ w: num(p, 'w', 3000), d: num(p, 'd', 5500), h: num(p, 'h', 2400) }),
    symbol: (_p, s) => [rect(-s.w / 2, -s.d / 2, s.w, s.d, { stroke: '#44403c', w: 0.35, dash: [3, 1.5], fill: '#f5f5f4' }), text(0, 0, 'Навіс', 1.8, { color: '#44403c' })],
    parts: (_p, s) => [
      ...[[0, 0], [s.w - 100, 0], [0, s.d - 100], [s.w - 100, s.d - 100]].map(([x, y]): Prim3 => ({ t: 'box', x, y, z: 0, w: 100, d: 100, h: s.h, c: '#57534e', m: 'metal' })),
      { t: 'box', x: -150, y: -150, z: s.h, w: s.w + 300, d: s.d + 300, h: 60, c: '#94a3b8', m: 'glass' },
    ],
  },
  {
    kind: 'bbq',
    layer: 'landscape',
    group: 'siteobj',
    scope: 'site',
    name: L('Мангал / барбекю', 'Мангал / барбекю'),
    params: [],
    defaults: {},
    size: () => ({ w: 1200, d: 600, h: 900 }),
    symbol: () => [rect(-600, -300, 1200, 600, st('#7f1d1d', 0.35, '#fecaca')), text(0, 0, 'BBQ', 1.6, { color: '#7f1d1d' })],
    parts: () => [{ t: 'box', x: 0, y: 0, z: 0, w: 1200, d: 600, h: 800, c: '#a8a29e' }, { t: 'box', x: 100, y: 80, z: 800, w: 1000, d: 440, h: 100, c: '#292524', m: 'metal' }],
  },
  {
    kind: 'bench',
    layer: 'landscape',
    group: 'siteobj',
    scope: 'site',
    name: L('Лава садова', 'Скамья садовая'),
    params: [],
    defaults: {},
    size: () => ({ w: 1600, d: 550, h: 850 }),
    parts: () => [{ t: 'box', x: 0, y: 150, z: 400, w: 1600, d: 400, h: 50, c: '#a16207', m: 'wood' }, { t: 'box', x: 0, y: 100, z: 450, w: 1600, d: 50, h: 400, c: '#a16207', m: 'wood' }, { t: 'box', x: 100, y: 150, z: 0, w: 80, d: 400, h: 400, c: '#44403c' }, { t: 'box', x: 1420, y: 150, z: 0, w: 80, d: 400, h: 400, c: '#44403c' }],
  },
];

const routes: RouteDef[] = [
  {
    kind: 'path',
    layer: 'landscape',
    group: 'paving',
    scope: 'site',
    name: L('Доріжка', 'Дорожка'),
    params: [pNum('width', L('Ширина', 'Ширина'), 300, 6000, 50), pSel('material', L('Покриття', 'Покрытие'), [['tile', L('Тротуарна плитка', 'Тротуарная плитка')], ['gravel', L('Гравій', 'Гравий')], ['concrete', L('Бетон', 'Бетон')], ['wood', L('Дерев’яний настил', 'Деревянный настил')]])],
    defaults: { width: 1000, material: 'tile' },
    color: (p) => (str(p, 'material') === 'gravel' ? '#a8a29e' : str(p, 'material') === 'wood' ? '#b45309' : '#78716c'),
    width: (p) => num(p, 'width', 1000),
  },
  {
    kind: 'fence',
    layer: 'landscape',
    group: 'fence',
    scope: 'site',
    name: L('Паркан', 'Забор'),
    params: [pNum('h', L('Висота', 'Высота'), 300, 3500, 50), pSel('type', L('Тип', 'Тип'), [['profile', L('Профнастил', 'Профнастил')], ['wood', L('Дерев’яний', 'Деревянный')], ['mesh', L('Сітка', 'Сетка')], ['brick', L('Цегляний', 'Кирпичный')], ['euro', L('Єврозабор', 'Еврозабор')]]), pColor('color', L('Колір', 'Цвет'))],
    defaults: { h: 1800, type: 'profile', color: '#6b4f3a' },
    color: (p) => str(p, 'color', '#6b4f3a'),
    tag: (p) => `h=${(num(p, 'h', 1800) / 1000).toFixed(1).replace('.', ',')} м`,
  },
];

const zones: ZoneDef[] = [
  { kind: 'lawn', layer: 'landscape', group: 'paving', scope: 'site', name: L('Газон', 'Газон'), params: [], defaults: {}, color: '#86efac' },
  { kind: 'paving', layer: 'landscape', group: 'paving', scope: 'site', name: L('Мощення', 'Мощение'), params: [pSel('material', L('Покриття', 'Покрытие'), [['tile', L('Тротуарна плитка', 'Тротуарная плитка')], ['concrete', L('Бетон', 'Бетон')], ['asphalt', L('Асфальт', 'Асфальт')], ['gravel', L('Гравій', 'Гравий')]])], defaults: { material: 'tile' }, color: '#a8a29e' },
  { kind: 'terrace', layer: 'landscape', group: 'paving', scope: 'site', name: L('Тераса', 'Терраса'), params: [pNum('h', L('Висота настилу', 'Высота настила'), 0, 1500, 10)], defaults: { h: 150 }, color: '#d6a36a' },
  { kind: 'pool', layer: 'landscape', group: 'siteobj', scope: 'site', name: L('Басейн', 'Бассейн'), params: [pNum('depth', L('Глибина', 'Глубина'), 300, 3000, 50)], defaults: { depth: 1500 }, color: '#7dd3fc' },
  { kind: 'flowerbed', layer: 'landscape', group: 'plants', scope: 'site', name: L('Клумба / квітник', 'Клумба / цветник'), params: [], defaults: {}, color: '#f9a8d4' },
  { kind: 'garden', layer: 'landscape', group: 'plants', scope: 'site', name: L('Город', 'Огород'), params: [], defaults: {}, color: '#bef264' },
];

registerItems(items);
registerRoutes(routes);
registerZones(zones);
void poly;
