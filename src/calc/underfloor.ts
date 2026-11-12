// Тёплый пол: длина трубы, разбиение на контуры, раскладка «змейкой» для отображения.
import { bbox, polygonArea, polygonPerimeter } from '../model/geometry';
import type { Vec2 } from '../model/types';

export interface UnderfloorResult {
  /** Площадь обогрева нетто, м². */
  areaM2: number;
  /** Общая длина трубы с подводками, м. */
  pipeM: number;
  /** Количество контуров. */
  loops: number;
  /** Длина одного контура, м. */
  loopM: number;
}

/**
 * @param polygon контур зоны, мм
 * @param pitch шаг укладки, мм
 * @param offset отступ от края, мм
 * @param feed длина подводки до коллектора в одну сторону, мм
 * @param maxLoopM максимальная длина контура, м
 */
export function underfloorCalc(polygon: Vec2[], pitch: number, offset: number, feed: number, maxLoopM: number): UnderfloorResult {
  const gross = polygonArea(polygon);
  const net = Math.max(0, gross - polygonPerimeter(polygon) * offset + 4 * offset * offset);
  const areaM2 = net / 1e6;
  const netPipeM = pitch > 0 ? net / pitch / 1000 : 0;
  // подбираем число контуров так, чтобы каждый (с двумя подводками) укладывался в максимум
  let loops = 1;
  const feedM = (2 * feed) / 1000;
  while (loops < 50 && netPipeM / loops + feedM > maxLoopM) loops += 1;
  const loopM = netPipeM / loops + feedM;
  return { areaM2: round2(areaM2), pipeM: round2(loopM * loops), loops, loopM: round2(loopM) };
}

/** Линии «змейки» (сканирующие хорды с отступом от контура) — одна полилиния. */
export function snakePath(polygon: Vec2[], pitch: number, offset: number): Vec2[] {
  if (polygon.length < 3 || pitch <= 0) return [];
  const bb = bbox(polygon);
  const pts: Vec2[] = [];
  let flip = false;
  for (let y = bb.minY + offset; y <= bb.maxY - offset + 0.5; y += pitch) {
    const xs: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    if (xs.length < 2) continue;
    const x0 = xs[0] + offset;
    const x1 = xs[xs.length - 1] - offset;
    if (x1 <= x0) continue;
    if (flip) pts.push({ x: x1, y }, { x: x0, y });
    else pts.push({ x: x0, y }, { x: x1, y });
    flip = !flip;
  }
  return pts;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
