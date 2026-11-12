// Параметрическая библиотека типовых объектов (обобщённые формы, не копии брендов).
// Размеры по умолчанию — типичные для украинского рынка.
import type { Params } from '../model/types';
import { L, P_COLOR, P_D, P_H, P_W, bool, num, pBool, pColor, pNum, pSel, registerItems, str } from './registry';
import type { ItemDef, Mat3, ParamDef, Prim3, Size3 } from './registry';

const B = (x: number, y: number, z: number, w: number, d: number, h: number, c: string, m?: Mat3): Prim3 => ({ t: 'box', x, y, z, w, d, h, c, m });
const C = (x: number, y: number, z: number, r: number, h: number, c: string, m?: Mat3, axis?: 'x' | 'y' | 'z', r2?: number): Prim3 => ({
  t: 'cyl',
  x,
  y,
  z,
  r,
  h,
  c,
  m,
  axis,
  r2,
});
const S = (x: number, y: number, z: number, r: number, c: string, m?: Mat3): Prim3 => ({ t: 'sphere', x, y, z, r, c, m });

const WOOD = '#c8a877';
const WHITE = '#f3f3f0';
const DARK = '#3f4650';
const STEEL = '#b8bcc2';
const FABRIC = '#8b9bb0';
const CERAMIC = '#fafaf8';
const TOP = '#5b5f66';
const GLASS = '#bfe3f2';

type PartsFn = (p: Params, s: Size3, c: string) => Prim3[];

function def(
  kind: string,
  group: string,
  name: [string, string],
  w: number,
  d: number,
  h: number,
  color: string,
  parts: PartsFn,
  extra: Partial<ItemDef> & { xp?: ParamDef[]; xd?: Params } = {},
): ItemDef {
  const { xp = [], xd = {}, ...rest } = extra;
  return {
    kind,
    layer: 'furniture',
    group,
    name: L(name[0], name[1]),
    params: [P_W, P_D, P_H, P_COLOR, ...xp],
    defaults: { w, d, h, color, ...xd },
    size: (p) => ({ w: num(p, 'w', w), d: num(p, 'd', d), h: num(p, 'h', h) }),
    parts: (p, s) => parts(p, s, str(p, 'color', color)),
    ...rest,
  };
}

const P_TOP = pColor('top', L('Стільниця', 'Столешница'));
const P_DOORS = pNum('doors', L('Дверей', 'Дверей'), 1, 6, 1, 'шт');
const P_DRAWERS = pNum('drawers', L('Шухляд', 'Ящиков'), 1, 8, 1, 'шт');

/** Ряд вертикальных фасадов с зазором. */
function doorRow(x0: number, y: number, z0: number, w: number, h: number, n: number, c: string, t = 18, gap = 3): Prim3[] {
  const out: Prim3[] = [];
  const dw = (w - gap * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + gap + i * (dw + gap);
    out.push(B(x, y, z0 + gap, dw, t, h - 2 * gap, c));
    out.push(B(x + (i % 2 === 0 ? dw - 40 : 20), y + t, z0 + h / 2 - 60, 12, 20, 120, STEEL, 'metal'));
  }
  return out;
}

/** Столбец фасадов ящиков. */
function drawerCol(x0: number, y: number, z0: number, w: number, h: number, n: number, c: string, t = 18, gap = 3): Prim3[] {
  const out: Prim3[] = [];
  const dh = (h - gap * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const z = z0 + gap + i * (dh + gap);
    out.push(B(x0 + gap, y, z, w - 2 * gap, t, dh, c));
    out.push(B(x0 + w / 2 - 60, y + t, z + dh / 2 - 6, 120, 20, 12, STEEL, 'metal'));
  }
  return out;
}

/** Нижний кухонный модуль: цоколь, корпус, столешница. Возвращает высоту корпуса и глубину. */
function kitchenBase(s: Size3, top: string): { parts: Prim3[]; bodyD: number; z0: number; bh: number } {
  const plinth = 100;
  const topT = 38;
  const bodyD = s.d - 40;
  const bh = s.h - plinth - topT;
  return {
    parts: [B(0, 0, 0, s.w, bodyD - 50, plinth, DARK), B(0, 0, plinth, s.w, bodyD - 18, bh, WHITE), B(0, 0, s.h - topT, s.w, s.d, topT, top)],
    bodyD,
    z0: plinth,
    bh,
  };
}

const legs4 = (s: Size3, hl: number, r: number, c: string, inset = 40): Prim3[] => [
  C(inset, inset, 0, r, hl, c),
  C(s.w - inset, inset, 0, r, hl, c),
  C(inset, s.d - inset, 0, r, hl, c),
  C(s.w - inset, s.d - inset, 0, r, hl, c),
];

const defs: ItemDef[] = [
  // ───────── Кухня ─────────
  def('k-base', 'kitchen', ['Нижній модуль з дверцятами', 'Нижний модуль с дверцами'], 600, 600, 850, WHITE, (p, s, c) => {
    const k = kitchenBase(s, str(p, 'top', TOP));
    return [...k.parts, ...doorRow(0, k.bodyD - 18, k.z0, s.w, k.bh, Math.max(1, num(p, 'doors', 1)), c)];
  }, { xp: [P_DOORS, P_TOP], xd: { doors: 1, top: TOP }, mount: 'wall' }),
  def('k-drawers', 'kitchen', ['Нижній модуль із шухлядами', 'Нижний модуль с ящиками'], 600, 600, 850, WHITE, (p, s, c) => {
    const k = kitchenBase(s, str(p, 'top', TOP));
    return [...k.parts, ...drawerCol(0, k.bodyD - 18, k.z0, s.w, k.bh, Math.max(1, num(p, 'drawers', 3)), c)];
  }, { xp: [P_DRAWERS, P_TOP], xd: { drawers: 3, top: TOP }, mount: 'wall' }),
  def('k-sink', 'kitchen', ['Модуль під мийку', 'Модуль под мойку'], 800, 600, 850, WHITE, (p, s, c) => {
    const k = kitchenBase(s, str(p, 'top', TOP));
    const bw = Math.min(500, s.w - 160);
    return [
      ...k.parts,
      ...doorRow(0, k.bodyD - 18, k.z0, s.w, k.bh, 2, c),
      B((s.w - bw) / 2, 110, s.h - 1, bw, 400, 3, STEEL, 'metal'),
      B((s.w - bw) / 2 + 30, 140, s.h + 1, bw - 60, 340, 2, '#7d838a', 'metal'),
      C(s.w / 2, 70, s.h, 14, 220, STEEL, 'metal'),
      C(s.w / 2, 70, s.h + 220, 11, 160, STEEL, 'metal', 'y'),
    ];
  }, { xp: [P_TOP], xd: { top: TOP }, mount: 'wall' }),
  def('k-hob', 'kitchen', ['Модуль з варильною поверхнею та духовкою', 'Модуль с варочной поверхностью и духовкой'], 600, 600, 850, WHITE, (p, s) => {
    const k = kitchenBase(s, str(p, 'top', TOP));
    return [
      ...k.parts,
      B(3, k.bodyD - 18, k.z0 + 120, s.w - 6, 20, k.bh - 123, '#22262b', 'glass'),
      B(3, k.bodyD - 18, k.z0 + 3, s.w - 6, 18, 114, WHITE),
      B(60, k.bodyD + 2, k.z0 + k.bh - 60, s.w - 120, 25, 14, STEEL, 'metal'),
      B(20, 50, s.h, s.w - 40, 510, 6, '#15171a', 'glass'),
      C(s.w * 0.3, 190, s.h + 6, 80, 2, '#3a3f45'),
      C(s.w * 0.7, 190, s.h + 6, 100, 2, '#3a3f45'),
      C(s.w * 0.3, 420, s.h + 6, 100, 2, '#3a3f45'),
      C(s.w * 0.7, 420, s.h + 6, 80, 2, '#3a3f45'),
    ];
  }, { xp: [P_TOP], xd: { top: TOP }, mount: 'wall' }),
  def('k-corner', 'kitchen', ['Кутовий нижній модуль', 'Угловой нижний модуль'], 900, 900, 850, WHITE, (p, s, c) => {
    const top = str(p, 'top', TOP);
    const dd = 600;
    return [
      B(0, 0, 100, s.w, dd - 58, s.h - 138, WHITE),
      B(0, dd - 58, 100, dd - 58, s.d - dd + 58, s.h - 138, WHITE),
      B(0, 0, 0, s.w - 50, dd - 110, 100, DARK),
      B(0, 0, s.h - 38, s.w, dd, 38, top),
      B(0, dd, s.h - 38, dd, s.d - dd, 38, top),
      B(dd - 58, dd - 58, 103, s.w - dd + 55, 18, s.h - 144, c),
      B(dd - 58, dd - 40, 103, 18, s.d - dd + 37, s.h - 144, c),
    ];
  }, { xp: [P_TOP], xd: { top: TOP }, mount: 'wall' }),
  def('k-wall', 'kitchen', ['Верхній навісний модуль', 'Верхний навесной модуль'], 600, 320, 720, WHITE, (p, s, c) => [
    B(0, 0, 0, s.w, s.d - 18, s.h, WHITE),
    ...doorRow(0, s.d - 18, 0, s.w, s.h, Math.max(1, num(p, 'doors', 1)), c),
  ], { xp: [P_DOORS], xd: { doors: 1 }, z: 1400, mount: 'wall' }),
  def('k-tall', 'kitchen', ['Пенал кухонний', 'Пенал кухонный'], 600, 580, 2130, WHITE, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d - 70, 100, DARK),
    B(0, 0, 100, s.w, s.d - 18, s.h - 100, WHITE),
    ...doorRow(0, s.d - 18, 100, s.w, (s.h - 100) * 0.62, 1, c),
    ...doorRow(0, s.d - 18, 100 + (s.h - 100) * 0.62, s.w, (s.h - 100) * 0.38, 1, c),
  ], { mount: 'wall' }),
  def('k-island', 'kitchen', ['Кухонний острів', 'Кухонный остров'], 1400, 900, 900, WHITE, (p, s, c) => [
    B(40, 40, 0, s.w - 80, s.d - 80, 100, DARK),
    B(20, 20, 100, s.w - 40, s.d - 40, s.h - 138, c),
    B(0, 0, s.h - 38, s.w, s.d, 38, str(p, 'top', TOP)),
  ], { xp: [P_TOP], xd: { top: TOP } }),
  def('k-hood', 'kitchen', ['Витяжка кухонна', 'Вытяжка кухонная'], 600, 480, 600, STEEL, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d, 60, c, 'metal'),
    B(s.w / 2 - 130, 0, 60, 260, 280, s.h - 60, c, 'metal'),
  ], { z: 1550, mount: 'wall' }),
  def('k-top', 'kitchen', ['Стільниця (сегмент)', 'Столешница (сегмент)'], 1200, 600, 38, TOP, (_p, s, c) => [B(0, 0, 0, s.w, s.d, s.h, c)], { z: 812, mount: 'wall' }),

  // ───────── Техника ─────────
  def('fridge', 'appliance', ['Холодильник', 'Холодильник'], 600, 650, 1900, '#d9dcdf', (_p, s, c) => [
    B(0, 0, 0, s.w, s.d - 40, s.h, c, 'metal'),
    B(2, s.d - 40, 4, s.w - 4, 40, s.h * 0.36, c, 'metal'),
    B(2, s.d - 40, s.h * 0.36 + 10, s.w - 4, 40, s.h * 0.64 - 14, c, 'metal'),
    B(30, s.d, s.h * 0.36 - 260, 14, 22, 220, DARK),
    B(30, s.d, s.h * 0.36 + 60, 14, 22, 300, DARK),
  ], { mount: 'wall' }),
  def('stove', 'appliance', ['Плита окремостояча', 'Плита отдельностоящая'], 500, 600, 850, WHITE, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d - 20, s.h, c),
    B(20, s.d - 20, 120, s.w - 40, 20, s.h - 320, '#22262b', 'glass'),
    B(0, s.d - 20, s.h - 150, s.w, 24, 110, '#e3e3e0'),
    B(0, 0, s.h, s.w, s.d - 10, 8, '#22262b'),
    C(s.w * 0.28, 170, s.h + 8, 75, 6, '#55595e'),
    C(s.w * 0.72, 170, s.h + 8, 75, 6, '#55595e'),
    C(s.w * 0.28, 410, s.h + 8, 75, 6, '#55595e'),
    C(s.w * 0.72, 410, s.h + 8, 75, 6, '#55595e'),
  ], { mount: 'wall' }),
  def('dishwasher', 'appliance', ['Посудомийна машина', 'Посудомоечная машина'], 450, 570, 820, '#e5e7ea', (_p, s, c) => [
    B(0, 0, 0, s.w, s.d - 20, s.h, c, 'metal'),
    B(2, s.d - 20, 100, s.w - 4, 20, s.h - 104, c, 'metal'),
    B(40, s.d, s.h - 70, s.w - 80, 20, 14, DARK),
  ], { mount: 'wall' }),
  def('washer', 'appliance', ['Пральна машина', 'Стиральная машина'], 600, 450, 850, WHITE, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d, s.h, c),
    C(s.w / 2, s.d, s.h * 0.48, 180, 14, '#30353b', 'glass', 'y'),
    B(20, s.d, s.h - 110, s.w - 40, 6, 80, '#d6d8db'),
  ], { mount: 'wall' }),
  def('microwave', 'appliance', ['Мікрохвильова піч', 'Микроволновая печь'], 480, 360, 280, '#d0d3d6', (_p, s, c) => [
    B(0, 0, 0, s.w, s.d, s.h, c, 'metal'),
    B(15, s.d, 20, s.w * 0.68, 4, s.h - 40, '#1d2024', 'glass'),
  ], { z: 900 }),
  def('boiler', 'appliance', ['Бойлер (водонагрівач) 80 л', 'Бойлер (водонагреватель) 80 л'], 450, 470, 800, WHITE, (_p, s, c) => [
    C(s.w / 2, s.d / 2 + 10, 0, s.w / 2, s.h, c, 'ceramic'),
    B(s.w / 2 - 100, 0, s.h * 0.2, 200, 20, s.h * 0.6, STEEL, 'metal'),
  ], { z: 1300, mount: 'wall' }),
  def('tv', 'appliance', ['Телевізор', 'Телевизор'], 1230, 60, 720, '#101214', (_p, s, c) => [
    B(0, 0, 0, s.w, s.d * 0.6, s.h, c),
    B(12, s.d * 0.6, 12, s.w - 24, 3, s.h - 24, '#1c2330', 'glass'),
  ], { z: 1000, mount: 'wall' }),
  def('ac', 'appliance', ['Кондиціонер (внутрішній блок)', 'Кондиционер (внутренний блок)'], 800, 200, 290, WHITE, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d, s.h, c),
    B(30, s.d - 30, 10, s.w - 60, 32, 40, '#d5d7da'),
  ], { z: 2200, mount: 'wall' }),
  def('oven-tower', 'appliance', ['Пенал з духовкою та НВЧ', 'Пенал с духовкой и СВЧ'], 600, 580, 2130, WHITE, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d - 70, 100, DARK),
    B(0, 0, 100, s.w, s.d - 18, s.h - 100, WHITE),
    B(3, s.d - 18, 103, s.w - 6, 18, 560, c),
    B(3, s.d - 18, 670, s.w - 6, 20, 590, '#22262b', 'glass'),
    B(3, s.d - 18, 1266, s.w - 6, 20, 380, '#2a2f35', 'glass'),
    B(3, s.d - 18, 1652, s.w - 6, 18, s.h - 1655, c),
  ], { mount: 'wall' }),

  // ───────── Хранение ─────────
  def('wardrobe-sliding', 'storage', ['Шафа-купе', 'Шкаф-купе'], 1800, 600, 2400, WOOD, (p, s, c) => {
    const n = Math.max(2, num(p, 'doors', 2));
    const out: Prim3[] = [B(0, 0, 0, s.w, s.d - 40, s.h, c, 'wood'), B(0, s.d - 40, 0, 18, 40, s.h, c, 'wood'), B(s.w - 18, s.d - 40, 0, 18, 40, s.h, c, 'wood'), B(0, s.d - 40, s.h - 18, s.w, 40, 18, c, 'wood'), B(0, s.d - 40, 0, s.w, 40, 70, c, 'wood')];
    const iw = s.w - 36;
    const dw = (iw + 26 * (n - 1)) / n;
    const mirror = bool(p, 'mirror', true);
    for (let i = 0; i < n; i++) {
      const x = 18 + i * (dw - 26);
      const y = s.d - 36 + (i % 2) * 16;
      out.push(B(x, y, 72, dw, 12, s.h - 92, mirror && i % 2 === 1 ? '#cfd9e0' : c, mirror && i % 2 === 1 ? 'mirror' : 'wood'));
      out.push(B(x, y, 72, 22, 14, s.h - 92, STEEL, 'metal'));
      out.push(B(x + dw - 22, y, 72, 22, 14, s.h - 92, STEEL, 'metal'));
    }
    return out;
  }, { xp: [P_DOORS, pBool('mirror', L('Дзеркальні двері', 'Зеркальные двери'))], xd: { doors: 2, mirror: true }, mount: 'wall' }),
  def('wardrobe', 'storage', ['Шафа розпашна', 'Шкаф распашной'], 1000, 550, 2100, WOOD, (p, s, c) => [
    B(0, 0, 0, s.w, s.d - 18, s.h, c, 'wood'),
    ...doorRow(0, s.d - 18, 80, s.w, s.h - 80, Math.max(1, num(p, 'doors', 2)), c),
  ], { xp: [P_DOORS], xd: { doors: 2 }, mount: 'wall' }),
  def('chest', 'storage', ['Комод', 'Комод'], 900, 450, 850, WOOD, (p, s, c) => [
    B(0, 0, 60, s.w, s.d - 18, s.h - 60, c, 'wood'),
    ...legs4({ ...s, d: s.d - 18 }, 60, 18, DARK),
    ...drawerCol(0, s.d - 18, 60, s.w, s.h - 60, Math.max(1, num(p, 'drawers', 4)), c),
  ], { xp: [P_DRAWERS], xd: { drawers: 4 }, mount: 'wall' }),
  def('bookshelf', 'storage', ['Стелаж / книжкова шафа', 'Стеллаж / книжный шкаф'], 800, 300, 2000, WOOD, (p, s, c) => {
    const n = Math.max(1, num(p, 'shelves', 5));
    const out: Prim3[] = [B(0, 0, 0, 18, s.d, s.h, c, 'wood'), B(s.w - 18, 0, 0, 18, s.d, s.h, c, 'wood'), B(18, 0, 0, s.w - 36, 4, s.h, c, 'wood'), B(18, 0, s.h - 18, s.w - 36, s.d, 18, c, 'wood'), B(18, 0, 60, s.w - 36, s.d, 18, c, 'wood')];
    for (let i = 1; i < n; i++) out.push(B(18, 0, 60 + ((s.h - 78) * i) / n, s.w - 36, s.d - 5, 18, c, 'wood'));
    return out;
  }, { xp: [pNum('shelves', L('Полиць', 'Полок'), 1, 12, 1, 'шт')], xd: { shelves: 5 }, mount: 'wall' }),
  def('tv-stand', 'storage', ['Тумба під ТВ', 'Тумба под ТВ'], 1600, 400, 450, WOOD, (_p, s, c) => [
    B(0, 0, 80, s.w, s.d - 18, s.h - 80, c, 'wood'),
    ...legs4({ ...s, d: s.d - 18 }, 80, 16, DARK, 60),
    ...doorRow(0, s.d - 18, 80, s.w, s.h - 80, 3, c),
  ], { mount: 'wall' }),
  def('shoe-cabinet', 'storage', ['Тумба для взуття', 'Тумба для обуви'], 800, 300, 1000, WHITE, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d - 18, s.h, c),
    ...drawerCol(0, s.d - 18, 0, s.w, s.h, 3, c),
  ], { mount: 'wall' }),
  def('nightstand', 'storage', ['Тумба приліжкова', 'Тумба прикроватная'], 450, 400, 500, WOOD, (_p, s, c) => [
    B(0, 0, 100, s.w, s.d - 18, s.h - 100, c, 'wood'),
    ...legs4({ ...s, d: s.d - 18 }, 100, 14, DARK, 35),
    ...drawerCol(0, s.d - 18, 100, s.w, s.h - 100, 2, c),
  ], { mount: 'wall' }),
  def('hallway', 'storage', ['Передпокій (вішалка з лавою)', 'Прихожая (вешалка со скамьёй)'], 1000, 350, 2000, WOOD, (_p, s, c) => [
    B(0, 0, 0, s.w, 18, s.h, c, 'wood'),
    B(0, 18, 0, s.w, s.d - 18, 430, c, 'wood'),
    B(0, 18, 430, s.w, s.d - 18, 40, FABRIC, 'fabric'),
    B(0, 18, s.h - 250, s.w, s.d - 60, 18, c, 'wood'),
    ...[0.15, 0.38, 0.62, 0.85].map((k) => C(s.w * k, 18, 1650, 10, 60, STEEL, 'metal', 'y')),
  ], { mount: 'wall' }),
  def('wall-shelf', 'storage', ['Полиця навісна', 'Полка навесная'], 800, 220, 30, WOOD, (_p, s, c) => [B(0, 0, 0, s.w, s.d, s.h, c, 'wood')], { z: 1500, mount: 'wall' }),

  // ───────── Кровати ─────────
  def('bed-double', 'bed', ['Ліжко двоспальне 160×200', 'Кровать двуспальная 160×200'], 1680, 2100, 950, '#7c8794', (_p, s, c) => [
    B(0, 0, 0, s.w, 80, s.h, c, 'fabric'),
    B(0, 80, 120, s.w, s.d - 80, 200, c, 'fabric'),
    ...legs4(s, 120, 25, DARK, 60),
    B(40, 90, 320, s.w - 80, s.d - 130, 200, '#f1efe9', 'fabric'),
    B(90, 120, 520, s.w / 2 - 130, 420, 110, WHITE, 'fabric'),
    B(s.w / 2 + 40, 120, 520, s.w / 2 - 130, 420, 110, WHITE, 'fabric'),
    B(40, s.d * 0.42, 522, s.w - 80, s.d * 0.58 - 42, 40, '#a9b6c2', 'fabric'),
  ], { mount: 'wall' }),
  def('bed-single', 'bed', ['Ліжко односпальне 90×200', 'Кровать односпальная 90×200'], 980, 2100, 850, WOOD, (_p, s, c) => [
    B(0, 0, 0, s.w, 60, s.h, c, 'wood'),
    B(0, 60, 150, s.w, s.d - 60, 150, c, 'wood'),
    ...legs4(s, 150, 22, DARK, 50),
    B(40, 70, 300, s.w - 80, s.d - 110, 180, '#f1efe9', 'fabric'),
    B(120, 100, 480, s.w - 240, 400, 100, WHITE, 'fabric'),
    B(40, s.d * 0.45, 482, s.w - 80, s.d * 0.55 - 42, 40, '#b7c4a8', 'fabric'),
  ], { mount: 'wall' }),
  def('bed-bunk', 'bed', ['Ліжко двоярусне', 'Кровать двухъярусная'], 980, 2060, 1700, WOOD, (_p, s, c) => [
    ...[0, s.w - 60].flatMap((x) => [B(x, 0, 0, 60, 60, s.h, c, 'wood'), B(x, s.d - 60, 0, 60, 60, s.h, c, 'wood')]),
    B(0, 0, 250, s.w, s.d, 120, c, 'wood'),
    B(30, 30, 370, s.w - 60, s.d - 60, 140, '#f1efe9', 'fabric'),
    B(0, 0, 1200, s.w, s.d, 120, c, 'wood'),
    B(30, 30, 1320, s.w - 60, s.d - 60, 140, '#f1efe9', 'fabric'),
    B(0, 0, 1460, s.w, 30, 200, c, 'wood'),
    B(0, 0, 1460, 30, s.d, 200, c, 'wood'),
    B(s.w - 30, 0, 1460, 30, s.d * 0.6, 200, c, 'wood'),
  ], { mount: 'wall' }),
  def('crib', 'bed', ['Ліжечко дитяче', 'Кроватка детская'], 660, 1260, 950, WHITE, (_p, s, c) => [
    ...legs4(s, s.h, 20, c, 20),
    B(0, 0, 350, s.w, s.d, 60, c),
    B(20, 20, 410, s.w - 40, s.d - 40, 90, '#f6f1e6', 'fabric'),
    B(0, 0, s.h - 40, s.w, 30, 40, c),
    B(0, s.d - 30, s.h - 40, s.w, 30, 40, c),
    B(0, 0, s.h - 40, 30, s.d, 40, c),
    B(s.w - 30, 0, s.h - 40, 30, s.d, 40, c),
  ]),

  // ───────── Диваны ─────────
  def('sofa', 'sofa', ['Диван прямий', 'Диван прямой'], 2200, 950, 850, FABRIC, (_p, s, c) => [
    B(0, 0, 60, s.w, s.d, 340, c, 'fabric'),
    B(0, 0, 400, s.w, 240, s.h - 400, c, 'fabric'),
    B(0, 240, 400, 200, s.d - 240, 200, c, 'fabric'),
    B(s.w - 200, 240, 400, 200, s.d - 240, 200, c, 'fabric'),
    B(210, 250, 400, (s.w - 430) / 2, s.d - 260, 110, '#9daec2', 'fabric'),
    B(220 + (s.w - 430) / 2, 250, 400, (s.w - 430) / 2, s.d - 260, 110, '#9daec2', 'fabric'),
    ...legs4(s, 60, 22, DARK, 60),
  ], { mount: 'wall' }),
  def('sofa-corner', 'sofa', ['Диван кутовий', 'Диван угловой'], 2600, 1700, 850, FABRIC, (_p, s, c) => {
    const sd = 950;
    return [
      B(0, 0, 60, s.w, sd, 340, c, 'fabric'),
      B(0, sd, 60, sd, s.d - sd, 340, c, 'fabric'),
      B(0, 0, 400, s.w, 240, s.h - 400, c, 'fabric'),
      B(0, 240, 400, 240, s.d - 240, s.h - 400, c, 'fabric'),
      B(s.w - 200, 240, 400, 200, sd - 240, 200, c, 'fabric'),
      B(250, 250, 400, s.w - 460, sd - 260, 110, '#9daec2', 'fabric'),
      B(250, sd, 400, sd - 260, s.d - sd - 10, 110, '#9daec2', 'fabric'),
    ];
  }, { mount: 'wall' }),
  def('armchair', 'sofa', ['Крісло', 'Кресло'], 850, 850, 850, FABRIC, (_p, s, c) => [
    B(0, 0, 80, s.w, s.d, 300, c, 'fabric'),
    B(0, 0, 380, s.w, 200, s.h - 380, c, 'fabric'),
    B(0, 200, 380, 160, s.d - 200, 200, c, 'fabric'),
    B(s.w - 160, 200, 380, 160, s.d - 200, 200, c, 'fabric'),
    B(170, 210, 380, s.w - 340, s.d - 220, 100, '#9daec2', 'fabric'),
    ...legs4(s, 80, 20, DARK, 60),
  ]),
  def('pouf', 'sofa', ['Пуф', 'Пуф'], 500, 500, 420, '#b59f8a', (_p, s, c) => [C(s.w / 2, s.d / 2, 0, Math.min(s.w, s.d) / 2, s.h, c, 'fabric')]),

  // ───────── Столы и стулья ─────────
  def('table-dining', 'table', ['Стіл обідній', 'Стол обеденный'], 1400, 800, 750, WOOD, (_p, s, c) => [
    B(0, 0, s.h - 30, s.w, s.d, 30, c, 'wood'),
    ...[
      [50, 50],
      [s.w - 110, 50],
      [50, s.d - 110],
      [s.w - 110, s.d - 110],
    ].map(([x, y]) => B(x, y, 0, 60, 60, s.h - 30, c, 'wood')),
  ]),
  def('table-round', 'table', ['Стіл круглий', 'Стол круглый'], 1000, 1000, 750, WOOD, (_p, s, c) => [
    C(s.w / 2, s.d / 2, s.h - 30, s.w / 2, 30, c, 'wood'),
    C(s.w / 2, s.d / 2, 30, 50, s.h - 60, DARK),
    C(s.w / 2, s.d / 2, 0, s.w * 0.28, 30, DARK),
  ]),
  def('desk', 'table', ['Стіл письмовий', 'Стол письменный'], 1200, 600, 750, WOOD, (_p, s, c) => [
    B(0, 0, s.h - 25, s.w, s.d, 25, c, 'wood'),
    B(0, 30, 0, 25, s.d - 60, s.h - 25, c, 'wood'),
    B(s.w - 25, 30, 0, 25, s.d - 60, s.h - 25, c, 'wood'),
    B(25, 40, s.h - 400, s.w - 50, 18, 375, c, 'wood'),
    B(s.w - 425, 60, s.h - 465, 400, s.d - 100, 440, c, 'wood'),
  ], { mount: 'wall' }),
  def('table-coffee', 'table', ['Стіл журнальний', 'Стол журнальный'], 1000, 600, 450, WOOD, (_p, s, c) => [
    B(0, 0, s.h - 30, s.w, s.d, 30, c, 'wood'),
    B(60, 60, 150, s.w - 120, s.d - 120, 20, c, 'wood'),
    ...legs4(s, s.h - 30, 20, DARK, 50),
  ]),
  def('chair', 'table', ['Стілець', 'Стул'], 450, 500, 900, '#6b7785', (_p, s, c) => [
    ...legs4(s, 440, 16, DARK, 30),
    B(0, 0, 440, s.w, s.d, 50, c, 'fabric'),
    B(0, 0, 490, s.w, 40, s.h - 490, c, 'fabric'),
  ]),
  def('chair-office', 'table', ['Крісло офісне', 'Кресло офисное'], 600, 600, 1150, '#2f343a', (_p, s, c) => [
    C(s.w / 2, s.d / 2, 0, s.w * 0.45, 50, DARK),
    C(s.w / 2, s.d / 2, 50, 25, 380, STEEL, 'metal'),
    B(60, 80, 430, s.w - 120, s.d - 140, 80, c, 'fabric'),
    B(80, 60, 520, s.w - 160, 60, s.h - 520, c, 'fabric'),
  ]),
  def('stool-bar', 'table', ['Стілець барний', 'Стул барный'], 400, 400, 750, '#6b7785', (_p, s, c) => [
    C(s.w / 2, s.d / 2, 0, s.w * 0.45, 20, STEEL, 'metal'),
    C(s.w / 2, s.d / 2, 20, 22, s.h - 70, STEEL, 'metal'),
    C(s.w / 2, s.d / 2, s.h - 50, s.w * 0.42, 50, c, 'fabric'),
  ]),

  // ───────── Сантехника ─────────
  def('toilet', 'sanitary', ['Унітаз підлоговий', 'Унитаз напольный'], 370, 650, 780, CERAMIC, (_p, s, c) => [
    B(0, 0, 380, s.w, 190, s.h - 380, c, 'ceramic'),
    B(s.w / 2 - 110, 60, 0, 220, 300, 380, c, 'ceramic'),
    C(s.w / 2, 430, 180, s.w / 2 - 5, 220, c, 'ceramic', 'z', s.w / 2),
    B(5, 190, 360, s.w - 10, 240, 40, c, 'ceramic'),
    C(s.w / 2, 440, 400, s.w / 2 - 2, 22, '#eef0f0', 'ceramic'),
  ], { mount: 'wall' }),
  def('toilet-hung', 'sanitary', ['Унітаз підвісний з інсталяцією', 'Унитаз подвесной с инсталляцией'], 500, 690, 1150, CERAMIC, (_p, s, c) => [
    B(0, 0, 0, s.w, 150, s.h, '#e8e6e0'),
    B(s.w / 2 - 120, 150, 830, 240, 12, 160, STEEL, 'metal'),
    B(s.w / 2 - 175, 150, 220, 350, 220, 200, c, 'ceramic'),
    C(s.w / 2, 440, 220, 175, 200, c, 'ceramic', 'z', 178),
    C(s.w / 2, 440, 420, 180, 22, '#eef0f0', 'ceramic'),
  ], { mount: 'wall' }),
  def('bidet', 'sanitary', ['Біде', 'Биде'], 370, 560, 400, CERAMIC, (_p, s, c) => [
    B(s.w / 2 - 120, 0, 0, 240, 280, s.h, c, 'ceramic'),
    C(s.w / 2, 380, 150, s.w / 2 - 5, s.h - 150, c, 'ceramic', 'z', s.w / 2),
    C(s.w / 2, 120, s.h, 12, 120, STEEL, 'metal'),
  ], { mount: 'wall' }),
  def('vanity', 'sanitary', ['Умивальник з тумбою', 'Умывальник с тумбой'], 600, 460, 850, WHITE, (_p, s, c) => [
    B(0, 0, 250, s.w, s.d - 18, s.h - 300, c),
    ...doorRow(0, s.d - 18, 250, s.w, s.h - 300, 2, c),
    B(-5, 0, s.h - 50, s.w + 10, s.d + 10, 50, CERAMIC, 'ceramic'),
    B(60, 110, s.h - 2, s.w - 120, s.d - 170, 4, '#dfe6e8', 'ceramic'),
    C(s.w / 2, 60, s.h, 13, 140, STEEL, 'metal'),
    C(s.w / 2, 60, s.h + 140, 10, 130, STEEL, 'metal', 'y'),
  ], { mount: 'wall' }),
  def('sink-pedestal', 'sanitary', ['Умивальник «тюльпан»', 'Умывальник «тюльпан»'], 550, 450, 850, CERAMIC, (_p, s, c) => [
    C(s.w / 2, 170, 0, 90, s.h - 180, c, 'ceramic', 'z', 110),
    B(0, 0, s.h - 180, s.w, s.d, 180, c, 'ceramic'),
    B(50, 90, s.h - 2, s.w - 100, s.d - 140, 4, '#dfe6e8', 'ceramic'),
    C(s.w / 2, 50, s.h, 13, 130, STEEL, 'metal'),
  ], { mount: 'wall' }),
  def('bathtub', 'sanitary', ['Ванна 170×70', 'Ванна 170×70'], 1700, 700, 600, CERAMIC, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d, s.h - 20, c, 'ceramic'),
    B(0, 0, s.h - 20, s.w, 60, 20, c, 'ceramic'),
    B(0, s.d - 60, s.h - 20, s.w, 60, 20, c, 'ceramic'),
    B(0, 60, s.h - 20, 70, s.d - 120, 20, c, 'ceramic'),
    B(s.w - 70, 60, s.h - 20, 70, s.d - 120, 20, c, 'ceramic'),
    B(70, 60, s.h - 22, s.w - 140, s.d - 120, 4, '#d9eef5', 'water'),
    C(120, s.d / 2, s.h, 14, 150, STEEL, 'metal'),
  ], { mount: 'wall' }),
  def('shower-cabin', 'sanitary', ['Душова кабіна', 'Душевая кабина'], 900, 900, 2000, GLASS, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d, 120, CERAMIC, 'ceramic'),
    B(0, s.d - 8, 120, s.w, 8, s.h - 120, c, 'glass'),
    B(s.w - 8, 0, 120, 8, s.d, s.h - 120, c, 'glass'),
    C(70, 70, 120, 12, s.h - 220, STEEL, 'metal'),
    C(70, 150, s.h - 110, 90, 12, STEEL, 'metal'),
  ], { mount: 'wall' }),
  def('shower-walkin', 'sanitary', ['Душ із піддоном та шторкою', 'Душ с поддоном и шторкой'], 1200, 800, 2000, GLASS, (_p, s, c) => [
    B(0, 0, 0, s.w, s.d, 50, CERAMIC, 'ceramic'),
    B(0, s.d - 8, 50, s.w * 0.65, 8, s.h - 50, c, 'glass'),
    C(s.w - 80, 60, 50, 12, s.h - 200, STEEL, 'metal'),
    C(s.w - 80, 150, s.h - 160, 100, 12, STEEL, 'metal'),
  ], { mount: 'wall' }),
  def('towel-warmer', 'sanitary', ['Рушникосушка', 'Полотенцесушитель'], 500, 100, 800, STEEL, (_p, s, c) => {
    const out: Prim3[] = [C(15, 60, 0, 13, s.h, c, 'metal'), C(s.w - 15, 60, 0, 13, s.h, c, 'metal')];
    const n = Math.max(3, Math.round(s.h / 110));
    for (let i = 0; i <= n; i++) out.push(C(15, 60, 20 + ((s.h - 40) * i) / n, 10, s.w - 30, c, 'metal', 'x'));
    return out;
  }, { z: 1000, mount: 'wall' }),

  // ───────── Освещение ─────────
  def('lamp-ceiling', 'light', ['Світильник стельовий', 'Светильник потолочный'], 400, 400, 100, '#fff6dc', (_p, s, c) => [
    C(s.w / 2, s.d / 2, 0, s.w / 2, s.h - 15, c, 'light'),
    C(s.w / 2, s.d / 2, s.h - 15, s.w / 2 - 20, 15, WHITE),
  ], { mount: 'ceiling', z: 2500 }),
  def('lamp-pendant', 'light', ['Люстра / підвіс', 'Люстра / подвес'], 380, 380, 700, '#fff0c8', (_p, s, c) => [
    C(s.w / 2, s.d / 2, 0, s.w / 2, 220, c, 'light', 'z', s.w / 4),
    C(s.w / 2, s.d / 2, 220, 4, s.h - 240, DARK),
    C(s.w / 2, s.d / 2, s.h - 20, 50, 20, DARK),
  ], { mount: 'ceiling', z: 1900 }),
  def('lamp-spot', 'light', ['Світильник точковий', 'Светильник точечный'], 90, 90, 20, '#fff6dc', (_p, s, c) => [C(s.w / 2, s.d / 2, 0, s.w / 2, s.h, c, 'light')], { mount: 'ceiling', z: 2580 }),
  def('lamp-floor', 'light', ['Торшер', 'Торшер'], 400, 400, 1600, '#fff0c8', (_p, s, c) => [
    C(s.w / 2, s.d / 2, 0, 130, 25, DARK),
    C(s.w / 2, s.d / 2, 25, 12, s.h - 325, DARK),
    C(s.w / 2, s.d / 2, s.h - 300, s.w / 2, 300, c, 'light', 'z', s.w / 3),
  ]),
  def('lamp-sconce', 'light', ['Бра', 'Бра'], 150, 120, 250, '#fff0c8', (_p, s, c) => [
    B(s.w / 2 - 40, 0, 60, 80, 20, 130, DARK),
    C(s.w / 2, s.d / 2 + 10, 40, s.w / 2 - 10, s.h - 80, c, 'light'),
  ], { mount: 'wall', z: 1700 }),
  def('lamp-led', 'light', ['Лінійний LED-світильник', 'Линейный LED-светильник'], 1200, 60, 40, '#fff6dc', (_p, s, c) => [B(0, 0, 0, s.w, s.d, s.h, c, 'light')], { mount: 'ceiling', z: 2560 }),

  // ───────── Декор ─────────
  def('rug', 'decor', ['Килим', 'Ковёр'], 2000, 1400, 12, '#b9a48c', (_p, s, c) => [B(0, 0, 0, s.w, s.d, s.h, c, 'fabric'), B(60, 60, 0, s.w - 120, s.d - 120, s.h + 1, '#d6c7b1', 'fabric')]),
  def('plant', 'decor', ['Рослина в горщику', 'Растение в горшке'], 450, 450, 1200, '#4f8a4b', (_p, s, c) => [
    C(s.w / 2, s.d / 2, 0, s.w * 0.28, s.h * 0.25, '#8a6a52', 'ceramic', 'z', s.w * 0.36),
    C(s.w / 2, s.d / 2, s.h * 0.25, 12, s.h * 0.3, '#6b4f3a'),
    S(s.w / 2, s.d / 2, s.h * 0.72, s.w * 0.5, c, 'leaf'),
  ]),
  def('mirror', 'decor', ['Дзеркало', 'Зеркало'], 600, 25, 1500, '#cfd9e0', (_p, s, c) => [B(0, 0, 0, s.w, 10, s.h, DARK), B(15, 10, 15, s.w - 30, s.d - 10, s.h - 30, c, 'mirror')], { z: 300, mount: 'wall' }),
  def('curtain', 'decor', ['Штори', 'Шторы'], 2000, 140, 2500, '#d9d2c5', (_p, s, c) => {
    const out: Prim3[] = [C(0, s.d / 2, s.h - 30, 12, s.w, DARK, 'metal', 'x')];
    const n = Math.max(4, Math.round(s.w / 120));
    for (let i = 0; i < n; i++) out.push(C((s.w * (i + 0.5)) / n, s.d / 2 + (i % 2 ? 15 : -15), 20, s.w / n / 2 + 6, s.h - 60, c, 'fabric'));
    return out;
  }, { mount: 'wall' }),
  def('picture', 'decor', ['Картина', 'Картина'], 800, 30, 600, '#8fa3a8', (_p, s, c) => [B(0, 0, 0, s.w, s.d, s.h, DARK), B(30, s.d, 30, s.w - 60, 2, s.h - 60, c)], { z: 1300, mount: 'wall' }),
];

registerItems(defs);

export const FURNITURE_COUNT = defs.length;
export { defs as furnitureDefs };

/** Параметры-селекты, используемые в других каталогах. */
export const selYesNo = (key: string, uk: string, ru: string) => pSel(key, L(uk, ru), [['yes', L('Так', 'Да')], ['no', L('Ні', 'Нет')]]);
export { P_H, P_W, P_D };
