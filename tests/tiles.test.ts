import { describe, expect, it } from 'vitest';
import { isTiled, tileLayout, tileLayoutRect } from '../src/calc/tiles';
import { defaultFinishes } from '../src/catalog/finishes';

const rectPoly = (w: number, h: number) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

describe('раскладка плитки', () => {
  it('кратные размеры: только целые плитки', () => {
    const r = tileLayout(rectPoly(3000, 2400), [], 600, 600, 0, 'grid', 0);
    expect([r.whole, r.cut, r.total]).toEqual([20, 0, 20]);
    expect(r.areaM2).toBe(7.2);
  });
  it('некратная ширина добавляет ряд подрезки', () => {
    const r = tileLayout(rectPoly(3100, 2400), [], 600, 600, 0, 'grid', 0);
    expect([r.whole, r.cut]).toEqual([20, 4]);
  });
  it('шов учитывается в шаге раскладки', () => {
    // 5 плиток по 600 со швом 2 мм занимают 3008 мм > 3000 → пятая подрезается
    const r = tileLayout(rectPoly(3000, 600), [], 600, 600, 2, 'grid', 0);
    expect([r.whole, r.cut]).toEqual([4, 1]);
  });
  it('запас в % и упаковки', () => {
    const r = tileLayout(rectPoly(3000, 2400), [], 600, 600, 0, 'grid', 10, 1.44);
    expect(r.withReserve).toBe(22);
    // 22 × 0,36 м² = 7,92 м² → 6 упаковок по 1,44
    expect(r.packs).toBe(6);
    expect(r.buyM2).toBeCloseTo(8.64, 2);
  });
  it('вразбежку и по диагонали требуется больше подрезки, чем шов в шов', () => {
    const grid = tileLayout(rectPoly(3000, 2400), [], 600, 600, 0, 'grid', 0);
    const brick = tileLayout(rectPoly(3000, 2400), [], 600, 600, 0, 'brick', 0);
    const diag = tileLayout(rectPoly(3000, 2400), [], 600, 600, 0, 'diagonal', 0);
    expect(brick.total).toBeGreaterThan(grid.total);
    expect(diag.cut).toBeGreaterThan(grid.cut);
    expect(diag.total).toBeGreaterThanOrEqual(grid.total);
  });
  it('стена с проёмом: плитка 600×300, шов 2', () => {
    const f = defaultFinishes().find((x) => x.id === 'tile-wall-white')!;
    const full = tileLayoutRect(3000, 2700, [], f, 0);
    expect([full.whole, full.cut]).toEqual([32, 13]);
    const withDoor = tileLayoutRect(3000, 2700, [{ minX: 1000, maxX: 2000, minY: 700, maxY: 2700 }], f, 0);
    expect(withDoor.total).toBeLessThan(full.total);
    expect(withDoor.areaM2).toBeCloseTo(8.1 - 2.0, 2);
  });
  it('Г-образное помещение', () => {
    const l = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 1500 }, { x: 1500, y: 1500 }, { x: 1500, y: 3000 }, { x: 0, y: 3000 }];
    const r = tileLayout(l, [], 300, 300, 0, 'grid', 0);
    expect(r.whole).toBe(75);
    expect(r.cut).toBe(0);
  });
  it('признак штучной отделки', () => {
    const fs = defaultFinishes();
    expect(isTiled(fs.find((x) => x.id === 'laminate-oak'))).toBe(true);
    expect(isTiled(fs.find((x) => x.id === 'paint-white'))).toBe(false);
  });
});
