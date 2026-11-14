// Реестр видов объектов (Item / Route / Zone): слой, параметры, геометрия.
import type { Prim2 } from '../draw2d/prims';
import type { LayerId, LS, Params, ParamValue } from '../model/types';

export interface ParamDef {
  key: string;
  label: LS;
  /** 'group' — выбор электрической группы проекта. */
  type: 'number' | 'select' | 'bool' | 'color' | 'text' | 'group';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: LS }[];
}

export type Mat3 = 'matte' | 'wood' | 'metal' | 'glass' | 'fabric' | 'ceramic' | 'light' | 'leaf' | 'water' | 'mirror';

/** 3D-примитив в системе объекта: x∈[0,w], y∈[0,d] (0 — спинка), z вверх. */
export type Prim3 =
  | {
      t: 'box';
      x: number;
      y: number;
      z: number;
      w: number;
      d: number;
      h: number;
      c: string;
      m?: Mat3;
      /** Текстура декора из библиотеки. */
      tx?: string;
      /** Ось волокон в системе объекта (x — ширина, y — глубина, z — высота). */
      ga?: 'x' | 'y' | 'z';
      /** Ключ детали (для выбора щелчком в 3D). */
      key?: string;
    }
  /** Цилиндр/конус: (x,y,z) — центр основания; ось по умолчанию z. */
  | { t: 'cyl'; x: number; y: number; z: number; r: number; h: number; c: string; m?: Mat3; axis?: 'x' | 'y' | 'z'; r2?: number }
  | { t: 'sphere'; x: number; y: number; z: number; r: number; c: string; m?: Mat3 };

export interface Size3 {
  w: number;
  d: number;
  h: number;
}

export interface ItemDef {
  kind: string;
  layer: LayerId;
  /** Группа в библиотеке. */
  group: string;
  name: LS;
  params: ParamDef[];
  defaults: Params;
  size: (p: Params) => Size3;
  /** 3D-примитивы. */
  parts?: (p: Params, s: Size3) => Prim3[];
  /** Собственное условное обозначение на плане (локальные координаты, центр в (0,0)). */
  symbol?: (p: Params, s: Size3) => Prim2[];
  /** Высота установки по умолчанию. */
  z?: number;
  /** Крепление: к стене (спинкой), к потолку. */
  mount?: 'wall' | 'ceiling' | 'floor';
  /** Где может размещаться. */
  scope?: 'level' | 'site';
  /** Не показывать в библиотеке. */
  hidden?: boolean;
}

export interface RouteDef {
  kind: string;
  layer: LayerId;
  group: string;
  name: LS;
  params: ParamDef[];
  defaults: Params;
  /** Стиль линии на плане. */
  color: string | ((p: Params) => string);
  dash?: number[];
  /** Ширина на плане в мм модели (дорожки) — если задана, рисуется полосой. */
  width?: (p: Params) => number;
  scope?: 'level' | 'site';
  /** Буквенная марка на плане. */
  tag?: (p: Params) => string;
}

export interface ZoneDef {
  kind: string;
  layer: LayerId;
  group: string;
  name: LS;
  params: ParamDef[];
  defaults: Params;
  color: string;
  scope?: 'level' | 'site';
}

const items = new Map<string, ItemDef>();
const routes = new Map<string, RouteDef>();
const zones = new Map<string, ZoneDef>();

export const registerItems = (defs: ItemDef[]) => defs.forEach((d) => items.set(d.kind, d));
export const registerRoutes = (defs: RouteDef[]) => defs.forEach((d) => routes.set(d.kind, d));
export const registerZones = (defs: ZoneDef[]) => defs.forEach((d) => zones.set(d.kind, d));

export const itemDef = (kind: string): ItemDef | undefined => items.get(kind);
export const routeDef = (kind: string): RouteDef | undefined => routes.get(kind);
export const zoneDef = (kind: string): ZoneDef | undefined => zones.get(kind);
export const allItemDefs = (): ItemDef[] => [...items.values()];
export const allRouteDefs = (): RouteDef[] => [...routes.values()];
export const allZoneDefs = (): ZoneDef[] => [...zones.values()];

export const num = (p: Params, key: string, fallback = 0): number => {
  const val = p[key];
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
};
export const str = (p: Params, key: string, fallback = ''): string => {
  const val = p[key];
  return typeof val === 'string' ? val : fallback;
};
export const bool = (p: Params, key: string, fallback = false): boolean => {
  const val = p[key];
  return typeof val === 'boolean' ? val : fallback;
};

/** Параметры объекта с подстановкой значений по умолчанию. */
export function withDefaults(defaults: Params, p: Params): Params {
  return { ...defaults, ...p };
}

// ---- Помощники описания параметров ----
export const L = (uk: string, ru: string): LS => ({ uk, ru });
export const pNum = (key: string, label: LS, min = 0, max = 10000, step = 10, unit = 'мм'): ParamDef => ({ key, label, type: 'number', min, max, step, unit });
export const pSel = (key: string, label: LS, options: [string, LS][]): ParamDef => ({
  key,
  label,
  type: 'select',
  options: options.map(([value, lab]) => ({ value, label: lab })),
});
export const pBool = (key: string, label: LS): ParamDef => ({ key, label, type: 'bool' });
export const pColor = (key: string, label: LS): ParamDef => ({ key, label, type: 'color' });
export const pText = (key: string, label: LS): ParamDef => ({ key, label, type: 'text' });

export const P_W = pNum('w', L('Ширина', 'Ширина'), 50, 8000);
export const P_D = pNum('d', L('Глибина', 'Глубина'), 20, 8000);
export const P_H = pNum('h', L('Висота', 'Высота'), 10, 4000);
export const P_COLOR = pColor('color', L('Колір', 'Цвет'));

export type { ParamValue };

export const GROUP_NAMES: Record<string, LS> = {
  kitchen: L('Кухня', 'Кухня'),
  appliance: L('Техніка', 'Техника'),
  storage: L('Шафи та зберігання', 'Шкафы и хранение'),
  bed: L('Ліжка', 'Кровати'),
  sofa: L('Дивани та крісла', 'Диваны и кресла'),
  table: L('Столи та стільці', 'Столы и стулья'),
  sanitary: L('Сантехніка', 'Сантехника'),
  light: L('Освітлення', 'Освещение'),
  decor: L('Декор', 'Декор'),
  custom: L('Власні вироби та моделі', 'Свои изделия и модели'),
  electrical: L('Електрика', 'Электрика'),
  plumbing: L('Водопровід і каналізація', 'Водопровод и канализация'),
  heating: L('Опалення', 'Отопление'),
  gas: L('Газ', 'Газ'),
  ventilation: L('Вентиляція', 'Вентиляция'),
  plants: L('Рослини', 'Растения'),
  siteobj: L('Споруди та мережі', 'Сооружения и сети'),
  paving: L('Покриття та доріжки', 'Покрытия и дорожки'),
  fence: L('Огорожа', 'Ограждение'),
};
