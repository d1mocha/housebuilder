// Коллизии прогулки: окружность (игрок) против отрезков стен с полутолщиной.
import { itemDef } from '../catalog/registry';
import { itemSize } from '../draw2d/plan';
import { bbox as bboxOf, centroid, distToPolygonEdge, distToSegment, pointInPolygon, rectCorners } from '../model/geometry';
import type { Level, Vec2 } from '../model/types';

export interface CollisionSeg {
  a: Vec2;
  b: Vec2;
  /** Полутолщина стены, мм. */
  h: number;
}

/** Вытолкнуть точку из стен так, чтобы расстояние до оси каждой было ≥ h + radius. */
export function resolveCollisions(p: Vec2, segs: CollisionSeg[], radius: number): Vec2 {
  let x = p.x;
  let y = p.y;
  for (let iter = 0; iter < 3; iter++) {
    for (const s of segs) {
      const abx = s.b.x - s.a.x;
      const aby = s.b.y - s.a.y;
      const l2 = abx * abx + aby * aby;
      let t = l2 > 0 ? ((x - s.a.x) * abx + (y - s.a.y) * aby) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = s.a.x + abx * t;
      const cy = s.a.y + aby * t;
      let dx = x - cx;
      let dy = y - cy;
      let d = Math.hypot(dx, dy);
      const min = s.h + radius;
      if (d < min) {
        if (d < 1e-3) {
          const l = Math.sqrt(l2) || 1;
          dx = -aby / l;
          dy = abx / l;
          d = 1;
        }
        x = cx + (dx / d) * min;
        y = cy + (dy / d) * min;
      }
    }
  }
  return { x, y };
}

// ───────── Точка старта прогулки ─────────

/** Высота глаз в прогулке, мм. */
export const EYE = 1600;
/** Свободный радиус вокруг точки старта, мм. */
export const START_RADIUS = 600;
/** Свободная глубина поля зрения на старте, мм. */
export const START_VIEW = 1500;
/** Половина горизонтального угла поля зрения, в котором на старте не должно быть объектов, рад. */
export const START_HALF_FOV = (45 * Math.PI) / 180;

export interface WalkStart {
  pos: Vec2;
  /** Поворот камеры вокруг вертикали: вперёд = (−sin yaw, −cos yaw) в координатах (X, Z). */
  yaw: number;
  /** Свободный радиус вокруг точки (до стен и объектов), мм. */
  clearance: number;
  /** Свободная глубина взгляда по объектам в секторе поля зрения, мм (не больше 6000). */
  viewFree: number;
  /** Выполнены ли оба условия: радиус START_RADIUS и свободное поле зрения START_VIEW. */
  ok: boolean;
}

function distToPolygon(p: Vec2, poly: Vec2[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/**
 * Объекты, которые мешают стоять и смотреть: всё, что попадает в объём от пола до потолка на уровне
 * человека. Не считаются плоские напольные (ковёр) и потолочные светильники вплотную к потолку;
 * подвесные светильники — считаются.
 */
export function walkObstacles(level: Level): Vec2[][] {
  const out: Vec2[][] = [];
  for (const it of level.items) {
    const def = itemDef(it.kind);
    if ((def?.layer ?? 'furniture') !== 'furniture') continue;
    const s = itemSize(it);
    const top = it.z + s.h;
    if (top < 150) continue; // ковёр и другое плоское на полу
    if (it.z >= level.height - 350) continue; // плафоны и споты у самого потолка
    out.push(rectCorners({ x: it.x, y: it.y }, s.w, s.d, it.rot));
  }
  return out;
}

/** Расстояние по лучу p + t·dir до ближайшего ребра многоугольника (Infinity — не пересекает). */
function rayPolygon(p: Vec2, dir: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dir.x * ey - dir.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
    const u = ((a.x - p.x) * dir.y - (a.y - p.y) * dir.x) / den;
    if (t >= 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

const VIEW_RAYS = [-1, -2 / 3, -1 / 3, 0, 1 / 3, 2 / 3, 1].map((k) => k * START_HALF_FOV);
const VIEW_CAP = 6000;

/** Направление взгляда в плане для yaw (вперёд = (−sin yaw, −cos yaw)). */
export const yawDir = (yaw: number): Vec2 => ({ x: -Math.sin(yaw), y: -Math.cos(yaw) });

/**
 * Свободная глубина сектора поля зрения: минимальное расстояние по лучам сектора до объектов (objects),
 * до стен помещения по всему сектору (walls) и по центральной части взгляда (wallsCenter).
 */
export function viewFree(p: Vec2, yaw: number, obstacles: Vec2[][], room: Vec2[]): { objects: number; walls: number; wallsCenter: number } {
  let objects = VIEW_CAP;
  let walls = VIEW_CAP;
  let wallsCenter = VIEW_CAP;
  for (const da of VIEW_RAYS) {
    const dir = yawDir(yaw + da);
    const w = rayPolygon(p, dir, room);
    walls = Math.min(walls, w);
    if (Math.abs(da) <= START_HALF_FOV / 3 + 1e-9) wallsCenter = Math.min(wallsCenter, w);
    for (const o of obstacles) {
      if (objects <= 0) break;
      objects = Math.min(objects, pointInPolygon(p, o) ? 0 : rayPolygon(p, dir, o));
    }
  }
  return { objects, walls, wallsCenter };
}

/**
 * Старт прогулки: точка, где в радиусе START_RADIUS нет стен и объектов (в том числе подвесных светильников),
 * а в поле зрения на START_VIEW вперёд нет объектов. Помещения перебираются от большего к меньшему; в первом,
 * где такая точка есть, выбирается та, откуда взгляд уходит дальше всего (не в ближнюю стену), с предпочтением
 * простору вокруг и взгляду к центру помещения. Если условий не выполнить нигде, берётся ближайший к ним
 * вариант (ok = false).
 */
export function walkStart(level: Level, obstacles: Vec2[][] = []): WalkStart {
  const rooms = [...level.rooms].filter((r) => r.polygon.length >= 3).sort((a, b) => b.area - a.area);
  if (!rooms.length) {
    const pts = level.walls.flatMap((w) => [w.a, w.b]);
    if (!pts.length) return { pos: { x: 0, y: 0 }, yaw: 0, clearance: 0, viewFree: 0, ok: false };
    const bb = bboxOf(pts);
    return { pos: { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }, yaw: 0, clearance: 0, viewFree: 0, ok: false };
  }
  const YAWS = Array.from({ length: 24 }, (_, i) => (i * Math.PI) / 12);
  let fallback: WalkStart | null = null;
  let fallbackScore = -Infinity;
  for (const room of rooms) {
    let best: WalkStart | null = null;
    let bestScore = -Infinity;
    const bb = bboxOf(room.polygon);
    const c = centroid(room.polygon);
    const step = Math.max(100, Math.min(200, Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY) / 14));
    const near = obstacles.filter((o) => o.some((q) => q.x > bb.minX - 500 && q.x < bb.maxX + 500 && q.y > bb.minY - 500 && q.y < bb.maxY + 500));
    for (let x = bb.minX + step / 2; x < bb.maxX; x += step) {
      for (let y = bb.minY + step / 2; y < bb.maxY; y += step) {
        const p = { x, y };
        if (!pointInPolygon(p, room.polygon)) continue;
        let clear = distToPolygonEdge(p, room.polygon);
        for (const o of near) clear = Math.min(clear, distToPolygon(p, o));
        if (clear < 250) continue; // внутри объекта или вплотную к стене — не старт ни при каких условиях
        const toC = Math.atan2(-(c.x - p.x), -(c.y - p.y));
        for (const yaw of YAWS) {
          const v = viewFree(p, yaw, near, room.polygon);
          let da = Math.abs(yaw - toC) % (2 * Math.PI);
          if (da > Math.PI) da = 2 * Math.PI - da;
          const facing = Math.hypot(c.x - p.x, c.y - p.y) < 300 ? 0 : da / Math.PI; // 0 — лицом к центру
          const ok = clear >= START_RADIUS && v.objects >= START_VIEW;
          // куда уходит взгляд: далёкая стена по центру кадра, свободные края кадра, простор, взгляд к центру
          const score = Math.min(v.wallsCenter, 6000) + Math.min(v.walls, 3000) * 0.5 + Math.min(v.objects, 4000) * 0.25 + Math.min(clear, 1500) * 0.4 - facing * 700;
          const cand: WalkStart = { pos: { x: Math.round(x), y: Math.round(y) }, yaw, clearance: clear, viewFree: v.objects, ok };
          if (ok && score > bestScore) {
            best = cand;
            bestScore = score;
          }
          // запасной вариант: насколько близко к выполнению условий
          const fs = Math.min(clear, START_RADIUS) * 3 + Math.min(v.objects, START_VIEW) + score * 0.05;
          if (!ok && fs > fallbackScore) {
            fallback = cand;
            fallbackScore = fs;
          }
        }
      }
    }
    if (best) return best;
  }
  return fallback ?? { pos: rooms[0].seed, yaw: 0, clearance: 0, viewFree: 0, ok: false };
}
