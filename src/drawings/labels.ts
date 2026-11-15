// Раскладка подписей на чертеже: марки проёмов и подписи помещений не должны перекрываться.
import { pointInPolygon } from '../model/geometry';
import type { Room, Vec2 } from '../model/types';

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const boxesOverlap = (a: Box, b: Box, gap = 0): boolean => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minY < b.maxY + gap && a.maxY > b.minY - gap;

/** Радиус кружка марки проёма, мм бумаги. */
export const MARK_R = 2.6;

/** Габарит марки проёма (кружок) в мм модели при масштабе 1:N. */
export const markBox = (p: Vec2, N: number): Box => ({ minX: p.x - MARK_R * N, maxX: p.x + MARK_R * N, minY: p.y - MARK_R * N, maxY: p.y + MARK_R * N });

/** Ширина строки текста в мм бумаги (оценка для шрифта чертежа). */
export const textWidth = (s: string, size: number): number => s.length * size * 0.58;

/** Габарит подписи помещения (название + площадь) с центром привязки c, мм модели. */
export function roomLabelBox(room: Pick<Room, 'name' | 'area'>, N: number, c: Vec2): Box {
  const area = `${room.area.toFixed(2)} м²`;
  const w = Math.max(textWidth(room.name, 3), textWidth(area, 2.6)) + 1.5;
  // название — на 1,2 мм выше точки привязки, площадь — на 3 мм ниже (см. roomLabelPrims)
  return { minX: c.x - (w / 2) * N, maxX: c.x + (w / 2) * N, minY: c.y - 3.2 * N, maxY: c.y + 4.8 * N };
}

/**
 * Развести марки проёмов: марка, налезающая на уже поставленную, сдвигается вдоль своей стены
 * (в обе стороны, по шагу в диаметр кружка). Возвращает положения по id проёма.
 */
export function layoutMarks(marks: { id: string; p: Vec2; dir: Vec2 }[], N: number): Map<string, Vec2> {
  const placed: Box[] = [];
  const out = new Map<string, Vec2>();
  const step = MARK_R * 2 * N + 0.6 * N;
  for (const m of marks) {
    let pos = m.p;
    if (placed.some((b) => boxesOverlap(markBox(pos, N), b))) {
      search: for (let k = 1; k <= 6; k++) {
        for (const sgn of [1, -1]) {
          const q = { x: m.p.x + m.dir.x * step * k * sgn, y: m.p.y + m.dir.y * step * k * sgn };
          if (!placed.some((b) => boxesOverlap(markBox(q, N), b))) {
            pos = q;
            break search;
          }
        }
      }
    }
    placed.push(markBox(pos, N));
    out.set(m.id, pos);
  }
  return out;
}

/**
 * Подписи помещений: остаются в точке привязки, если не задевают марки проёмов и другие подписи; иначе
 * сдвигаются в ближайшее свободное место внутри помещения. Если свободного места нет (крошечное помещение),
 * подпись остаётся на месте.
 */
export function layoutRoomLabels(rooms: Pick<Room, 'id' | 'name' | 'area' | 'seed' | 'polygon'>[], N: number, obstacles: Box[]): Map<string, Vec2> {
  const out = new Map<string, Vec2>();
  const taken: Box[] = [...obstacles];
  const step = 2 * N;
  // кандидаты: кольцами вокруг точки привязки, ближние — первыми
  const offsets: Vec2[] = [];
  for (let ix = -14; ix <= 14; ix++) for (let iy = -14; iy <= 14; iy++) offsets.push({ x: ix * step, y: iy * step });
  offsets.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  // крупные помещения — первыми: у них больше свободы, мелким достаётся то, что осталось рядом с их точкой
  for (const r of [...rooms].sort((a, b) => b.area - a.area)) {
    const free = (c: Vec2, strict: boolean) => {
      const b = roomLabelBox(r, N, c);
      if (taken.some((t) => boxesOverlap(b, t, 0.4 * N))) return false;
      if (!strict) return true;
      return [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
      ].every((q) => pointInPolygon(q, r.polygon));
    };
    let pos = r.seed;
    if (!free(r.seed, false)) {
      // сначала — целиком внутри помещения, затем — хотя бы центр подписи внутри
      const inside = offsets.map((o) => ({ x: r.seed.x + o.x, y: r.seed.y + o.y }));
      pos = inside.find((c) => free(c, true)) ?? inside.find((c) => pointInPolygon(c, r.polygon) && free(c, false)) ?? r.seed;
    }
    taken.push(roomLabelBox(r, N, pos));
    out.set(r.id, pos);
  }
  return out;
}
