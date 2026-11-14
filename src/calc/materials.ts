// Расчёт количества отделочных материалов: обои (рулоны с учётом раппорта и высоты),
// ламинат/паркет (упаковки), линолеум (метраж рулона), единицы цены.
import { bbox } from '../model/geometry';
import type { Finish, LS, Vec2 } from '../model/types';

export type PriceUnit = 'roll' | 'm2' | 'l' | 'kg';

/** Единица, за которую задаётся цена материала. */
export function finishPriceUnit(f: Pick<Finish, 'type'>): PriceUnit {
  switch (f.type) {
    case 'wallpaper':
      return 'roll';
    case 'paint':
      return 'l';
    case 'plaster':
      return 'kg';
    default:
      return 'm2';
  }
}

export const PRICE_UNIT_NAMES: Record<PriceUnit, LS> = {
  roll: { uk: 'грн/рулон', ru: 'грн/рулон' },
  m2: { uk: 'грн/м²', ru: 'грн/м²' },
  l: { uk: 'грн/л', ru: 'грн/л' },
  kg: { uk: 'грн/кг', ru: 'грн/кг' },
};

export const WALLPAPER_ROLL_W = 530;
export const WALLPAPER_ROLL_L = 10050;
/** Запас на подрезку полотна сверху и снизу, мм. */
export const WALLPAPER_TRIM = 100;

export interface WallpaperCalc {
  /** Длина одного полотна с подрезкой и подгонкой рисунка, мм. */
  stripLen: number;
  /** Полотен из одного рулона. */
  perRoll: number;
  /** Полотен всего. */
  strips: number;
  /** Рулонов (без запаса). */
  rolls: number;
  /** Рулон короче одного полотна. */
  tooShort: boolean;
}

/** Длина полотна: высота + подрезка, округлённая вверх до целого числа раппортов. */
export function wallpaperStripLen(heightMm: number, rapport = 0): number {
  const base = heightMm + WALLPAPER_TRIM;
  return rapport > 0 ? Math.ceil(base / rapport - 1e-9) * rapport : base;
}

/**
 * Обои: runsMm — длины оклеиваемых участков стен (по помещениям, дверные проёмы вычтены),
 * каждое помещение считается отдельно (полотна режутся целиком).
 */
export function wallpaperCalc(runsMm: number[], heightMm: number, f: Pick<Finish, 'rollW' | 'rollL' | 'rapport'>): WallpaperCalc {
  const rollW = f.rollW && f.rollW > 0 ? f.rollW : WALLPAPER_ROLL_W;
  const rollL = f.rollL && f.rollL > 0 ? f.rollL : WALLPAPER_ROLL_L;
  const stripLen = wallpaperStripLen(heightMm, f.rapport ?? 0);
  const fit = Math.floor(rollL / stripLen + 1e-9);
  const perRoll = Math.max(1, fit);
  let strips = 0;
  for (const run of runsMm) if (run > 0) strips += Math.ceil(run / rollW - 1e-9);
  return { stripLen, perRoll, strips, rolls: Math.ceil(strips / perRoll - 1e-9), tooShort: fit < 1 };
}

export interface PackCalc {
  /** Площадь с запасом, м². */
  areaM2: number;
  packs: number;
  /** м² к закупке. */
  buyM2: number;
}

/** Ламинат / паркет / плитка в упаковках: площадь с запасом → целые упаковки. */
export function packCalc(areaM2: number, packArea: number, reservePct = 0): PackCalc {
  const withReserve = areaM2 * (1 + reservePct / 100);
  if (!(packArea > 0)) return { areaM2: withReserve, packs: 0, buyM2: withReserve };
  const packs = Math.ceil(withReserve / packArea - 1e-9);
  return { areaM2: withReserve, packs, buyM2: Math.round(packs * packArea * 100) / 100 };
}

export const LINOLEUM_ROLL_W = 3000;
/** Запас по длине полотна на подрезку, мм. */
export const LINOLEUM_TRIM = 100;

export interface LinoleumCalc {
  /** Полотен. */
  strips: number;
  /** Длина одного полотна, мм. */
  stripLen: number;
  /** Погонных метров рулона. */
  lengthM: number;
  /** м² к закупке (погонные метры × ширина рулона). */
  buyM2: number;
  /** Стыков между полотнами. */
  seams: number;
  /** Направление раскатки: вдоль X или Y помещения. */
  dir: 'x' | 'y';
}

/** Линолеум: помещение покрывается полотнами по ширине рулона; выбирается направление с меньшим расходом. */
export function linoleumCalc(polygon: Vec2[], rollW = LINOLEUM_ROLL_W): LinoleumCalc {
  if (polygon.length < 3 || !(rollW > 0)) return { strips: 0, stripLen: 0, lengthM: 0, buyM2: 0, seams: 0, dir: 'x' };
  const bb = bbox(polygon);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const variant = (along: number, across: number, dir: 'x' | 'y'): LinoleumCalc => {
    const strips = Math.ceil(across / rollW - 1e-9);
    const stripLen = along + LINOLEUM_TRIM;
    const lengthM = Math.ceil((strips * stripLen) / 100) / 10; // до 0,1 м вверх
    return { strips, stripLen, lengthM, buyM2: Math.round(lengthM * (rollW / 1000) * 100) / 100, seams: strips - 1, dir };
  };
  const a = variant(w, h, 'x');
  const b = variant(h, w, 'y');
  // меньше стыков важнее; при равенстве — меньше метраж
  if (a.seams !== b.seams) return a.seams < b.seams ? a : b;
  return a.lengthM <= b.lengthM ? a : b;
}

/** Ссылка на товар годится для открытия: только http(s). Сайт магазина приложение не читает — ссылка лишь хранится. */
export function safeShopUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
