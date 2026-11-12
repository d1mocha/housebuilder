// Раскладка плитки/досок и расчёт количества.
import { bbox, pointInPolygon, rotate } from '../model/geometry';
import type { Finish, Vec2 } from '../model/types';

export interface TileResult {
  /** Площадь поверхности, м². */
  areaM2: number;
  /** Целых плиток. */
  whole: number;
  /** Подрезанных плиток. */
  cut: number;
  /** Всего плиток без запаса (каждая подрезка — отдельная плитка). */
  total: number;
  /** С запасом. */
  withReserve: number;
  /** Упаковок (если задана площадь упаковки). */
  packs: number | null;
  /** м² к закупке. */
  buyM2: number;
}

export interface Hole {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Раскладка по полигону (мм) с прямоугольными вырезами.
 * Плитка считается целой, если все 9 контрольных точек внутри поверхности; подрезанной — если хотя бы одна.
 */
export function tileLayout(polygon: Vec2[], holes: Hole[], tileW: number, tileH: number, grout: number, pattern: Finish['pattern'] = 'grid', reservePct = 10, packArea?: number): TileResult {
  const empty: TileResult = { areaM2: 0, whole: 0, cut: 0, total: 0, withReserve: 0, packs: null, buyM2: 0 };
  if (polygon.length < 3 || tileW <= 0 || tileH <= 0) return empty;
  const ang = pattern === 'diagonal' ? 45 : 0;
  // работаем в повернутой системе: полигон поворачиваем на −ang, проверку «внутри» делаем в исходной
  const rp = ang ? polygon.map((p) => rotate(p, -ang)) : polygon;
  const bb = bbox(rp);
  const inside = (x: number, y: number): boolean => {
    const q = ang ? rotate({ x, y }, ang) : { x, y };
    if (!pointInPolygon(q, polygon)) return false;
    for (const h of holes) if (q.x > h.minX && q.x < h.maxX && q.y > h.minY && q.y < h.maxY) return false;
    return true;
  };
  const sx = tileW + grout;
  const sy = tileH + grout;
  let whole = 0;
  let cut = 0;
  // контрольные точки ставим в 0,5 мм от краёв плитки: ловит подрезку даже на несколько мм
  const eps = 0.5;
  let row = 0;
  for (let y0 = bb.minY; y0 < bb.maxY - 0.01; y0 += sy, row++) {
    const shift = pattern === 'brick' && row % 2 === 1 ? sx / 2 : 0;
    for (let x0 = bb.minX - shift; x0 < bb.maxX - 0.01; x0 += sx) {
      let hits = 0;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const px = x0 + eps + ((tileW - 2 * eps) * i) / 2;
          const py = y0 + eps + ((tileH - 2 * eps) * j) / 2;
          if (inside(px, py)) hits++;
        }
      }
      if (hits === 9) whole++;
      else if (hits > 0) cut++;
    }
  }
  let area = polygonAreaAbs(polygon);
  for (const h of holes) area -= Math.max(0, h.maxX - h.minX) * Math.max(0, h.maxY - h.minY);
  const total = whole + cut;
  const withReserve = Math.ceil(total * (1 + reservePct / 100));
  const tileArea = (tileW * tileH) / 1e6;
  const packs = packArea && packArea > 0 ? Math.ceil((withReserve * tileArea) / packArea) : null;
  return { areaM2: Math.round((area / 1e6) * 100) / 100, whole, cut, total, withReserve, packs, buyM2: Math.round((packs ? packs * packArea! : withReserve * tileArea) * 100) / 100 };
}

function polygonAreaAbs(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s / 2);
}

/** Раскладка по прямоугольной поверхности стены width×height с проёмами. */
export function tileLayoutRect(width: number, height: number, holes: Hole[], f: Pick<Finish, 'tileW' | 'tileH' | 'grout' | 'pattern' | 'packArea'>, reservePct = 10): TileResult {
  const poly = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  return tileLayout(poly, holes, f.tileW ?? 0, f.tileH ?? 0, f.grout ?? 0, f.pattern, reservePct, f.packArea);
}

export const isTiled = (f: Finish | undefined): boolean => !!f && (f.type === 'tile' || f.type === 'laminate' || f.type === 'parquet' || f.type === 'panel') && (f.tileW ?? 0) > 0 && (f.tileH ?? 0) > 0;
