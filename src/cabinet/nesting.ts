// Раскрой листа: гильотинные схемы с пропилом, обпилом и направлением текстуры.
// Перебираются несколько стратегий (свободные прямоугольники с разными оценками, полосы вдоль и поперёк листа,
// случайные перестановки порядка); выбирается вариант с минимумом листов и самым большим деловым остатком.
import type { CabinetCatalog } from './types';
import type { CutRow } from './cutlist';

export interface NestItem {
  id: string;
  label: string;
  /** Размер вдоль длины листа (вдоль текстуры), мм. */
  l: number;
  w: number;
  canRotate: boolean;
}

export interface Placement {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Размеры на листе: вдоль длины листа и поперёк. */
  l: number;
  w: number;
  rotated: boolean;
}

export interface Rect {
  x: number;
  y: number;
  l: number;
  w: number;
}

export interface SheetLayout {
  placements: Placement[];
  /** Доля площади листа, занятая деталями, 0..1. */
  usage: number;
  /** Самый большой свободный прямоугольник листа (деловой остаток) или null. */
  offcut: Rect | null;
  /** Все деловые остатки листа (до трёх непересекающихся прямоугольников), от большего к меньшему. */
  offcuts: Rect[];
}

export interface NestResult {
  sheetL: number;
  sheetW: number;
  sheets: SheetLayout[];
  /** Детали, которые не помещаются на лист. */
  unplaced: NestItem[];
  /** Доля отходов без учёта деловых остатков: 1 − детали / (листы − остатки). */
  waste: number;
  /** Суммарная площадь деталей, мм². */
  partsArea: number;
}

/** Остаток считается деловым, если обе стороны не меньше этого значения, мм. */
export const MIN_OFFCUT_SIDE = 200;

type Score = 'area' | 'short' | 'long' | 'left' | 'top';
type Split = 'shorter' | 'longer' | 'horizontal' | 'vertical';

interface Packed {
  sheets: Placement[][];
  unplaced: NestItem[];
}

const EPS = 1e-6;

/** Слить свободные прямоугольники, имеющие общую сторону целиком. */
function mergeFree(free: Rect[]): void {
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i];
        const b = free[j];
        if (Math.abs(a.y - b.y) < EPS && Math.abs(a.w - b.w) < EPS && (Math.abs(a.x + a.l - b.x) < EPS || Math.abs(b.x + b.l - a.x) < EPS)) {
          free[i] = { x: Math.min(a.x, b.x), y: a.y, l: a.l + b.l, w: a.w };
          free.splice(j, 1);
          merged = true;
          break outer;
        }
        if (Math.abs(a.x - b.x) < EPS && Math.abs(a.l - b.l) < EPS && (Math.abs(a.y + a.w - b.y) < EPS || Math.abs(b.y + b.w - a.y) < EPS)) {
          free[i] = { x: a.x, y: Math.min(a.y, b.y), l: a.l, w: a.w + b.w };
          free.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
}

/** Гильотинная упаковка со свободными прямоугольниками. Пропил учитывается «раздуванием» деталей и листа. */
function packFree(items: NestItem[], binL: number, binW: number, kerf: number, score: Score, split: Split): Packed {
  const BL = binL + kerf;
  const BW = binW + kerf;
  const sheets: { free: Rect[]; placements: Placement[] }[] = [];
  const unplaced: NestItem[] = [];
  const scoreOf = (fr: Rect, l: number, w: number): number => {
    const dl = fr.l - l;
    const dw = fr.w - w;
    switch (score) {
      case 'area':
        return fr.l * fr.w - l * w;
      case 'short':
        return Math.min(dl, dw);
      case 'long':
        return Math.max(dl, dw);
      case 'left':
        // прижимать к началу листа: меньше занятая длина → больше деловой остаток
        return (fr.x + l) * 1e5 + fr.y;
      case 'top':
        return (fr.y + w) * 1e5 + fr.x;
    }
  };
  for (const it of items) {
    const variants: { l: number; w: number; rotated: boolean }[] = [{ l: it.l + kerf, w: it.w + kerf, rotated: false }];
    if (it.canRotate && it.l !== it.w) variants.push({ l: it.w + kerf, w: it.l + kerf, rotated: true });
    const fitting = variants.filter((v) => v.l <= BL + EPS && v.w <= BW + EPS);
    if (!fitting.length) {
      unplaced.push(it);
      continue;
    }
    let best: { si: number; fi: number; v: (typeof variants)[number]; s: number } | null = null;
    for (let si = 0; si < sheets.length; si++) {
      const sh = sheets[si];
      for (let fi = 0; fi < sh.free.length; fi++) {
        const fr = sh.free[fi];
        for (const v of fitting) {
          if (v.l <= fr.l + EPS && v.w <= fr.w + EPS) {
            const s = scoreOf(fr, v.l, v.w);
            if (!best || s < best.s) best = { si, fi, v, s };
          }
        }
      }
      if (best) break; // сначала заполняем ранние листы
    }
    if (!best) {
      sheets.push({ free: [{ x: 0, y: 0, l: BL, w: BW }], placements: [] });
      best = { si: sheets.length - 1, fi: 0, v: fitting[0], s: 0 };
    }
    const sh = sheets[best.si];
    const fr = sh.free[best.fi];
    const v = best.v;
    sh.placements.push({ id: it.id, label: it.label, x: fr.x, y: fr.y, l: v.l - kerf, w: v.w - kerf, rotated: v.rotated });
    const dl = fr.l - v.l;
    const dw = fr.w - v.w;
    let horizontal: boolean;
    if (split === 'horizontal') horizontal = true;
    else if (split === 'vertical') horizontal = false;
    else if (split === 'shorter') horizontal = dl > dw;
    else horizontal = dl <= dw;
    const right: Rect = horizontal ? { x: fr.x + v.l, y: fr.y, l: dl, w: v.w } : { x: fr.x + v.l, y: fr.y, l: dl, w: fr.w };
    const bottom: Rect = horizontal ? { x: fr.x, y: fr.y + v.w, l: fr.l, w: dw } : { x: fr.x, y: fr.y + v.w, l: v.l, w: dw };
    sh.free.splice(best.fi, 1);
    if (right.l > kerf + 1 && right.w > kerf + 1) sh.free.push(right);
    if (bottom.l > kerf + 1 && bottom.w > kerf + 1) sh.free.push(bottom);
    mergeFree(sh.free);
  }
  return { sheets: sheets.map((s) => s.placements), unplaced };
}

/**
 * Полосовая упаковка (двухстадийная гильотина): лист режется на полосы, в полосе детали идут подряд,
 * в остатке высоты над короткой деталью — стопка деталей той же или меньшей длины.
 * along = true — полосы вдоль длины листа (высота полосы = ширина первой детали).
 */
function packStrips(items: NestItem[], binL: number, binW: number, kerf: number, along: boolean): Packed {
  // работаем в системе (u — вдоль полосы, v — поперёк); для полос поперёк листа оси меняются местами
  const U = along ? binL : binW;
  const V = along ? binW : binL;
  const dims = (it: NestItem, rot: boolean) => {
    const l = rot ? it.w : it.l;
    const w = rot ? it.l : it.w;
    return along ? { u: l, v: w } : { u: w, v: l };
  };
  type Cand = { it: NestItem; u: number; v: number; rot: boolean };
  const pool: Cand[] = [];
  const unplaced: NestItem[] = [];
  for (const it of items) {
    const a = dims(it, false);
    const b = it.canRotate ? dims(it, true) : null;
    const fitA = a.u <= U + EPS && a.v <= V + EPS;
    const fitB = !!b && b.u <= U + EPS && b.v <= V + EPS;
    if (!fitA && !fitB) {
      unplaced.push(it);
      continue;
    }
    // предпочитаем ориентацию с меньшей высотой полосы (длинной стороной вдоль полосы)
    const useB = fitB && (!fitA || b!.v < a.v);
    pool.push(useB ? { it, u: b!.u, v: b!.v, rot: true } : { it, u: a.u, v: a.v, rot: false });
  }
  pool.sort((p, q) => q.v - p.v || q.u - p.u);
  const sheets: Placement[][] = [];
  const place = (sheet: Placement[], c: Cand, u: number, v: number) => {
    const x = along ? u : v;
    const y = along ? v : u;
    const l = c.rot ? c.it.w : c.it.l;
    const w = c.rot ? c.it.l : c.it.w;
    sheet.push({ id: c.it.id, label: c.it.label, x, y, l, w, rotated: c.rot });
  };
  while (pool.length) {
    const sheet: Placement[] = [];
    let v0 = 0;
    while (pool.length) {
      // новая полоса: самая высокая из оставшихся, помещающаяся по высоте
      const hi = pool.findIndex((c) => v0 + c.v <= V + EPS);
      if (hi < 0) break;
      const stripV = pool[hi].v;
      let u0 = 0;
      for (;;) {
        // следующая деталь в полосу: самая высокая, помещающаяся по остатку длины
        const idx = pool.findIndex((c) => c.v <= stripV + EPS && u0 + c.u <= U + EPS);
        if (idx < 0) break;
        const head = pool.splice(idx, 1)[0];
        place(sheet, head, u0, v0);
        // стопка над деталью
        let sv = v0 + head.v + kerf;
        for (;;) {
          const k = pool.findIndex((c) => c.u <= head.u + EPS && sv + c.v <= v0 + stripV + EPS);
          if (k < 0) break;
          const st = pool.splice(k, 1)[0];
          place(sheet, st, u0, sv);
          sv += st.v + kerf;
        }
        u0 += head.u + kerf;
      }
      v0 += stripV + kerf;
    }
    if (!sheet.length) break;
    sheets.push(sheet);
  }
  for (const c of pool) unplaced.push(c.it);
  return { sheets, unplaced };
}

/**
 * Самый большой свободный прямоугольник области 0..L × 0..W при заданных занятых прямоугольниках
 * (каждый «раздувается» на gap — пропил). Перебор вертикальных полос между характерными координатами.
 */
export function largestFreeRect(L: number, W: number, placed: Rect[], gap = 0): Rect | null {
  if (!placed.length) return { x: 0, y: 0, l: L, w: W };
  const occ = placed.map((p) => ({ x0: Math.max(0, p.x - gap), x1: Math.min(L, p.x + p.l + gap), y0: Math.max(0, p.y - gap), y1: Math.min(W, p.y + p.w + gap) }));
  if (occ.length > 90) {
    // для очень больших наборов — только торцевые остатки
    const mx = Math.max(...occ.map((o) => o.x1));
    const my = Math.max(...occ.map((o) => o.y1));
    const right = { x: mx, y: 0, l: L - mx, w: W };
    const bottom = { x: 0, y: my, l: L, w: W - my };
    const r = right.l * right.w >= bottom.l * bottom.w ? right : bottom;
    return r.l > 1 && r.w > 1 ? r : null;
  }
  const xs = [...new Set([0, L, ...occ.flatMap((o) => [o.x0, o.x1])])].sort((a, b) => a - b);
  let best: Rect | null = null;
  let bestA = 0;
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const x0 = xs[i];
      const x1 = xs[j];
      if ((x1 - x0) * W <= bestA) continue;
      // занятые интервалы по y в полосе [x0, x1]
      const iv = occ.filter((o) => o.x0 < x1 - EPS && o.x1 > x0 + EPS).map((o) => [o.y0, o.y1] as [number, number]).sort((p, q) => p[0] - q[0]);
      let cur = 0;
      const tryGap = (y0: number, y1: number) => {
        const a = (x1 - x0) * (y1 - y0);
        if (a > bestA) {
          bestA = a;
          best = { x: x0, y: y0, l: x1 - x0, w: y1 - y0 };
        }
      };
      for (const [a, b2] of iv) {
        if (a > cur + EPS) tryGap(cur, a);
        cur = Math.max(cur, b2);
      }
      if (cur < W - EPS) tryGap(cur, W);
    }
  }
  return best;
}

/** До max непересекающихся деловых остатков: берём наибольший свободный прямоугольник, «занимаем» его, повторяем. */
export function freeOffcuts(L: number, W: number, placed: Rect[], gap = 0, max = 3): Rect[] {
  const out: Rect[] = [];
  const occ: Rect[] = [...placed];
  for (let i = 0; i < max; i++) {
    const r = largestFreeRect(L, W, occ, i === 0 ? gap : 0);
    if (!r || r.l < MIN_OFFCUT_SIDE || r.w < MIN_OFFCUT_SIDE) break;
    out.push(r);
    // следующие остатки ищем вне найденного; пропил вокруг деталей сохраняем раздуванием самих деталей
    if (i === 0 && gap > 0) {
      occ.length = 0;
      for (const p of placed) occ.push({ x: p.x - gap, y: p.y - gap, l: p.l + 2 * gap, w: p.w + 2 * gap });
    }
    occ.push(r);
  }
  return out;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Раскроить набор деталей на листы sheetL×sheetW.
 * Цель: минимум листов, затем — максимальный деловой остаток на последнем листе.
 */
export function nest(items: NestItem[], sheetL: number, sheetW: number, kerf: number, trim: number): NestResult {
  const binL = sheetL - 2 * trim;
  const binW = sheetW - 2 * trim;
  const binArea = binL * binW;

  const offcutOf = (pl: Placement[]): Rect | null => {
    const r = largestFreeRect(binL, binW, pl, kerf);
    return r && r.l >= MIN_OFFCUT_SIDE && r.w >= MIN_OFFCUT_SIDE ? r : null;
  };
  const keyOf = (res: Packed): number => {
    const last = res.sheets[res.sheets.length - 1] ?? [];
    const off = offcutOf(last);
    const offA = off ? (off.l * off.w) / binArea : 0;
    return res.unplaced.length * 1e9 + res.sheets.length * 1e3 - offA;
  };

  let best: Packed = { sheets: [], unplaced: [] };
  let bestKey = Infinity;
  const consider = (res: Packed) => {
    const k = keyOf(res);
    if (k < bestKey - 1e-9) {
      bestKey = k;
      best = res;
    }
  };

  const orders: ((a: NestItem, b: NestItem) => number)[] = [
    (a, b) => b.l * b.w - a.l * a.w,
    (a, b) => Math.max(b.l, b.w) - Math.max(a.l, a.w) || b.l * b.w - a.l * a.w,
    (a, b) => b.w - a.w || b.l - a.l,
    (a, b) => b.l - a.l || b.w - a.w,
  ];
  const scores: Score[] = ['area', 'short', 'long', 'left', 'top'];
  const splits: Split[] = ['shorter', 'longer', 'horizontal', 'vertical'];
  const combos: { order: number; score: Score; split: Split; key: number }[] = [];
  orders.forEach((order, oi) => {
    const sorted = [...items].sort(order);
    for (const sc of scores) {
      for (const sp of splits) {
        const res = packFree(sorted, binL, binW, kerf, sc, sp);
        combos.push({ order: oi, score: sc, split: sp, key: keyOf(res) });
        consider(res);
      }
    }
  });
  consider(packStrips(items, binL, binW, kerf, true));
  consider(packStrips(items, binL, binW, kerf, false));

  // случайные перестановки порядка вокруг лучших комбинаций (детерминированный генератор)
  if (items.length > 2 && items.length <= 400) {
    combos.sort((a, b) => a.key - b.key);
    const top = combos.slice(0, 4);
    const rnd = seeded(items.length * 7919 + Math.round(binL + binW));
    const iterations = Math.max(24, Math.min(160, Math.round(6000 / items.length)));
    for (let i = 0; i < iterations; i++) {
      const c = top[i % top.length];
      const arr = [...items].sort(orders[c.order]);
      const swaps = 1 + Math.floor(rnd() * Math.max(1, arr.length / 6));
      for (let s = 0; s < swaps; s++) {
        const a = Math.floor(rnd() * arr.length);
        const b = Math.min(arr.length - 1, a + 1 + Math.floor(rnd() * 3));
        [arr[a], arr[b]] = [arr[b], arr[a]];
      }
      consider(packFree(arr, binL, binW, kerf, c.score, c.split));
    }
  }

  const sheetArea = sheetL * sheetW;
  const sheets: SheetLayout[] = best.sheets.map((pl) => {
    const offs = freeOffcuts(binL, binW, pl, kerf).map((o) => ({ x: o.x + trim, y: o.y + trim, l: o.l, w: o.w }));
    return {
      placements: pl.map((p) => ({ ...p, x: p.x + trim, y: p.y + trim })),
      usage: pl.reduce((s, p) => s + p.l * p.w, 0) / sheetArea,
      offcut: offs[0] ?? null,
      offcuts: offs,
    };
  });
  const partsArea = sheets.reduce((s, sh) => s + sh.placements.reduce((a, p) => a + p.l * p.w, 0), 0);
  const consumed = sheets.reduce((s, sh) => s + sheetArea - sh.offcuts.reduce((a, o) => a + o.l * o.w, 0), 0);
  return { sheetL, sheetW, sheets, unplaced: best.unplaced, waste: consumed > 0 ? Math.max(0, 1 - partsArea / consumed) : 0, partsArea };
}

export interface MaterialNest extends NestResult {
  materialId: string;
}

/** Раскрой по всем материалам деталировки с учётом направления текстуры деталей. */
export function nestCutList(rows: CutRow[], cat: CabinetCatalog): MaterialNest[] {
  const byMat = new Map<string, NestItem[]>();
  for (const r of rows) {
    const board = cat.boards.find((b) => b.id === r.materialId);
    const label = `${String(r.cutLength).replace('.', ',')}×${String(r.cutWidth).replace('.', ',')}`;
    // текстура листа идёт вдоль его длины: «вдоль» — длина детали по длине листа, «поперёк» — по ширине листа
    const textured = !!board?.grain && r.grain !== 'none';
    const cross = textured && r.grain === 'width';
    const list = byMat.get(r.materialId) ?? [];
    for (let i = 0; i < r.qty; i++) {
      list.push({ id: `${r.key}#${i}`, label, l: cross ? r.cutWidth : r.cutLength, w: cross ? r.cutLength : r.cutWidth, canRotate: !textured });
    }
    byMat.set(r.materialId, list);
  }
  const out: MaterialNest[] = [];
  for (const [materialId, list] of byMat) {
    const board = cat.boards.find((b) => b.id === materialId);
    if (!board) continue;
    const res = nest(list, board.sheetL, board.sheetW, cat.kerf, cat.trim);
    // детали, уложенные «поперёк текстуры», помечаются как повёрнутые
    const crossIds = new Set(rows.filter((r) => !!board.grain && r.grain === 'width').map((r) => r.key));
    for (const sh of res.sheets) for (const p of sh.placements) if (crossIds.has(p.id.split('#')[0])) p.rotated = true;
    out.push({ materialId, ...res });
  }
  return out;
}
