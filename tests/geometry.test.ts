import { describe, expect, it } from 'vitest';
import { centroid, convexHull, interiorPoint, pointInPolygon, polygonArea, polygonDistance, polylineLength, rectCorners, rotate, segmentDistance, segmentIntersection } from '../src/model/geometry';

const sq = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 3000 },
  { x: 0, y: 3000 },
];

describe('геометрия', () => {
  it('площадь и центроид прямоугольника', () => {
    expect(polygonArea(sq)).toBe(12e6);
    expect(centroid(sq)).toEqual({ x: 2000, y: 1500 });
  });
  it('площадь Г-образного полигона', () => {
    const l = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 }];
    expect(polygonArea(l)).toBe(12e6);
    expect(pointInPolygon(interiorPoint(l), l)).toBe(true);
  });
  it('точка в полигоне', () => {
    expect(pointInPolygon({ x: 10, y: 10 }, sq)).toBe(true);
    expect(pointInPolygon({ x: -10, y: 10 }, sq)).toBe(false);
  });
  it('пересечение и расстояние отрезков', () => {
    const x = segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 });
    expect(x?.point).toEqual({ x: 5, y: 5 });
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBeNull();
    expect(segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(5);
  });
  it('поворот по часовой стрелке в экранных координатах', () => {
    const p = rotate({ x: 1, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
  it('углы повернутого прямоугольника, оболочка, длина полилинии', () => {
    const c = rectCorners({ x: 0, y: 0 }, 200, 100, 90);
    expect(Math.abs(c[0].x)).toBeCloseTo(50);
    expect(Math.abs(c[0].y)).toBeCloseTo(100);
    expect(convexHull([...sq, { x: 2000, y: 1500 }])).toHaveLength(4);
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
  });
  it('расстояние между полигонами', () => {
    const b = sq.map((p) => ({ x: p.x + 5000, y: p.y }));
    expect(polygonDistance(sq, b)).toBe(1000);
    expect(polygonDistance(sq, sq.map((p) => ({ x: p.x + 100, y: p.y + 100 })))).toBe(0);
  });
});
