// Выравнивание перемещаемого объекта по краям и центрам соседних объектов.
import type { BBox } from '../model/geometry';
import type { Vec2 } from '../model/types';

export interface AlignResult {
  dx: number;
  dy: number;
  guides: { a: Vec2; b: Vec2 }[];
}

/**
 * Найти сдвиг (в пределах tol), при котором край или центр box совпадёт с краем/центром одного из others.
 * Возвращает сдвиг и направляющие для отрисовки.
 */
export function alignSnap(box: BBox, others: BBox[], tol: number): AlignResult {
  const xs = (b: BBox) => [b.minX, (b.minX + b.maxX) / 2, b.maxX];
  const ys = (b: BBox) => [b.minY, (b.minY + b.maxY) / 2, b.maxY];
  let bestX: { d: number; at: number; o: BBox } | null = null;
  let bestY: { d: number; at: number; o: BBox } | null = null;
  for (const o of others) {
    for (const mx of xs(box)) {
      for (const ox of xs(o)) {
        const d = ox - mx;
        if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: ox, o };
      }
    }
    for (const my of ys(box)) {
      for (const oy of ys(o)) {
        const d = oy - my;
        if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: oy, o };
      }
    }
  }
  const dx = bestX?.d ?? 0;
  const dy = bestY?.d ?? 0;
  const moved: BBox = { minX: box.minX + dx, maxX: box.maxX + dx, minY: box.minY + dy, maxY: box.maxY + dy };
  const guides: { a: Vec2; b: Vec2 }[] = [];
  if (bestX) guides.push({ a: { x: bestX.at, y: Math.min(moved.minY, bestX.o.minY) }, b: { x: bestX.at, y: Math.max(moved.maxY, bestX.o.maxY) } });
  if (bestY) guides.push({ a: { x: Math.min(moved.minX, bestY.o.minX), y: bestY.at }, b: { x: Math.max(moved.maxX, bestY.o.maxX), y: bestY.at } });
  return { dx, dy, guides };
}
