// Раскрой листа: гильотинная упаковка со свободными прямоугольниками.
// Учитываются пропил, обпил листа и направление текстуры.
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

export interface SheetLayout {
  placements: Placement[];
  /** Доля использованной площади листа, 0..1. */
  usage: number;
}

export interface NestResult {
  sheetL: number;
  sheetW: number;
  sheets: SheetLayout[];
  /** Детали, которые не помещаются на лист. */
  unplaced: NestItem[];
  /** Общая доля отходов, 0..1. */
  waste: number;
}

interface FreeRect {
  x: number;
  y: number;
  l: number;
  w: number;
}

type Score = 'area' | 'short' | 'long';
type Split = 'shorter' | 'longer' | 'horizontal' | 'vertical';

function packOnce(items: NestItem[], binL: number, binW: number, kerf: number, score: Score, split: Split): { sheets: Placement[][]; unplaced: NestItem[] } {
  // Трюк с пропилом: каждая деталь и лист «увеличены» на пропил.
  const BL = binL + kerf;
  const BW = binW + kerf;
  const sheets: { free: FreeRect[]; placements: Placement[] }[] = [];
  const unplaced: NestItem[] = [];

  const scoreOf = (fr: FreeRect, l: number, w: number): number => {
    const dl = fr.l - l;
    const dw = fr.w - w;
    if (score === 'area') return fr.l * fr.w - l * w;
    if (score === 'short') return Math.min(dl, dw);
    return Math.max(dl, dw);
  };

  for (const it of items) {
    const variants: { l: number; w: number; rotated: boolean }[] = [{ l: it.l + kerf, w: it.w + kerf, rotated: false }];
    if (it.canRotate && it.l !== it.w) variants.push({ l: it.w + kerf, w: it.l + kerf, rotated: true });
    if (!variants.some((v) => v.l <= BL + 1e-6 && v.w <= BW + 1e-6)) {
      unplaced.push(it);
      continue;
    }
    let best: { si: number; fi: number; v: (typeof variants)[number]; s: number } | null = null;
    sheets.forEach((sh, si) => {
      sh.free.forEach((fr, fi) => {
        for (const v of variants) {
          if (v.l <= fr.l + 1e-6 && v.w <= fr.w + 1e-6) {
            const s = scoreOf(fr, v.l, v.w) + si * 1e9; // сначала заполняем ранние листы
            if (!best || s < best.s) best = { si, fi, v, s };
          }
        }
      });
    });
    if (!best) {
      sheets.push({ free: [{ x: 0, y: 0, l: BL, w: BW }], placements: [] });
      const si = sheets.length - 1;
      const v = variants.find((q) => q.l <= BL + 1e-6 && q.w <= BW + 1e-6)!;
      best = { si, fi: 0, v, s: 0 };
    }
    const b = best as { si: number; fi: number; v: (typeof variants)[number]; s: number };
    const sh = sheets[b.si];
    const fr = sh.free[b.fi];
    sh.placements.push({ id: it.id, label: it.label, x: fr.x, y: fr.y, l: b.v.l - kerf, w: b.v.w - kerf, rotated: b.v.rotated });
    const dl = fr.l - b.v.l;
    const dw = fr.w - b.v.w;
    let horizontal: boolean;
    if (split === 'horizontal') horizontal = true;
    else if (split === 'vertical') horizontal = false;
    else if (split === 'shorter') horizontal = dl > dw;
    else horizontal = dl <= dw;
    // horizontal: рез вдоль длины листа → правый остаток по высоте детали, нижний — на всю длину
    const right: FreeRect = horizontal ? { x: fr.x + b.v.l, y: fr.y, l: dl, w: b.v.w } : { x: fr.x + b.v.l, y: fr.y, l: dl, w: fr.w };
    const bottom: FreeRect = horizontal ? { x: fr.x, y: fr.y + b.v.w, l: fr.l, w: dw } : { x: fr.x, y: fr.y + b.v.w, l: b.v.l, w: dw };
    sh.free.splice(b.fi, 1);
    if (right.l > kerf + 1 && right.w > kerf + 1) sh.free.push(right);
    if (bottom.l > kerf + 1 && bottom.w > kerf + 1) sh.free.push(bottom);
  }
  return { sheets: sheets.map((s) => s.placements), unplaced };
}

/**
 * Раскроить набор деталей на листы sheetL×sheetW.
 * Перебирает несколько эвристик и возвращает вариант с минимумом листов (затем — с наиболее плотным последним листом).
 */
export function nest(items: NestItem[], sheetL: number, sheetW: number, kerf: number, trim: number): NestResult {
  const binL = sheetL - 2 * trim;
  const binW = sheetW - 2 * trim;
  const orders: ((a: NestItem, b: NestItem) => number)[] = [
    (a, b) => b.l * b.w - a.l * a.w,
    (a, b) => Math.max(b.l, b.w) - Math.max(a.l, a.w) || b.l * b.w - a.l * a.w,
    (a, b) => b.w - a.w || b.l - a.l,
    (a, b) => b.l - a.l || b.w - a.w,
  ];
  const scores: Score[] = ['area', 'short', 'long'];
  const splits: Split[] = ['shorter', 'longer', 'horizontal', 'vertical'];
  let best: { sheets: Placement[][]; unplaced: NestItem[] } | null = null;
  let bestKey = Infinity;
  for (const order of orders) {
    const sorted = [...items].sort(order);
    for (const sc of scores) {
      for (const sp of splits) {
        const res = packOnce(sorted, binL, binW, kerf, sc, sp);
        const last = res.sheets[res.sheets.length - 1] ?? [];
        const lastArea = last.reduce((s, p) => s + p.l * p.w, 0);
        const key = res.unplaced.length * 1e6 + res.sheets.length * 1e3 + lastArea / (binL * binW);
        if (key < bestKey) {
          bestKey = key;
          best = res;
        }
      }
    }
  }
  const res = best ?? { sheets: [], unplaced: [] };
  const sheetArea = sheetL * sheetW;
  const sheets: SheetLayout[] = res.sheets.map((pl) => ({
    placements: pl.map((p) => ({ ...p, x: p.x + trim, y: p.y + trim })),
    usage: pl.reduce((s, p) => s + p.l * p.w, 0) / sheetArea,
  }));
  const used = sheets.reduce((s, sh) => s + sh.usage, 0);
  return { sheetL, sheetW, sheets, unplaced: res.unplaced, waste: sheets.length ? 1 - used / sheets.length : 0 };
}

export interface MaterialNest extends NestResult {
  materialId: string;
}

/** Раскрой по всем материалам деталировки. */
export function nestCutList(rows: CutRow[], cat: CabinetCatalog): MaterialNest[] {
  const byMat = new Map<string, NestItem[]>();
  for (const r of rows) {
    const board = cat.boards.find((b) => b.id === r.materialId);
    const canRotate = !(board?.grain && r.grain === 'length');
    const list = byMat.get(r.materialId) ?? [];
    for (let i = 0; i < r.qty; i++) list.push({ id: `${r.key}#${i}`, label: `${r.cutLength}×${r.cutWidth}`, l: r.cutLength, w: r.cutWidth, canRotate });
    byMat.set(r.materialId, list);
  }
  const out: MaterialNest[] = [];
  for (const [materialId, list] of byMat) {
    const board = cat.boards.find((b) => b.id === materialId);
    if (!board) continue;
    out.push({ materialId, ...nest(list, board.sheetL, board.sheetW, cat.kerf, cat.trim) });
  }
  return out;
}
