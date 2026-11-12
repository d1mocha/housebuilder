// Деталировка: пильные размеры с учётом кромки, группировка, итоги по кромке и материалам.
import type { LS } from '../model/types';
import type { CabinetCatalog, EdgeSides, Part } from './types';

/** Запас кромки на подрезку и свесы. */
export const EDGE_RESERVE = 0.1;

export function bandThickness(cat: CabinetCatalog, id: string | null): number {
  if (!id) return 0;
  const t = cat.bands.find((b) => b.id === id)?.thickness ?? 0;
  return t >= cat.edgeMinThickness ? t : 0;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Пильный размер: готовый размер минус толщины кромок на противоположных сторонах.
 * Кромки l1/l2 идут вдоль длины → уменьшают ширину; w1/w2 идут вдоль ширины → уменьшают длину.
 */
export function cutSize(part: Pick<Part, 'length' | 'width' | 'edges'>, cat: CabinetCatalog): { cutLength: number; cutWidth: number } {
  const e = part.edges;
  return {
    cutLength: r1(part.length - bandThickness(cat, e.w1) - bandThickness(cat, e.w2)),
    cutWidth: r1(part.width - bandThickness(cat, e.l1) - bandThickness(cat, e.l2)),
  };
}

export interface CutRow {
  key: string;
  name: LS;
  materialId: string;
  thickness: number;
  length: number;
  width: number;
  cutLength: number;
  cutWidth: number;
  qty: number;
  edges: EdgeSides;
  grain: 'length' | 'none';
  partKeys: string[];
}

/** Сгруппировать одинаковые детали в строки деталировки. */
export function buildCutList(parts: Part[], cat: CabinetCatalog): CutRow[] {
  const rows = new Map<string, CutRow>();
  for (const p of parts) {
    if (p.virtual) continue;
    const k = [p.name.uk, p.materialId, p.length, p.width, p.edges.l1, p.edges.l2, p.edges.w1, p.edges.w2, p.grain].join('|');
    const hit = rows.get(k);
    if (hit) {
      hit.qty += p.qty;
      hit.partKeys.push(p.key);
    } else {
      rows.set(k, { key: k, name: p.name, materialId: p.materialId, thickness: p.thickness, length: p.length, width: p.width, ...cutSize(p, cat), qty: p.qty, edges: p.edges, grain: p.grain, partKeys: [p.key] });
    }
  }
  return [...rows.values()];
}

export interface EdgeTotal {
  bandId: string;
  /** Чистая длина, м. */
  netM: number;
  /** С запасом, м. */
  grossM: number;
}

export function edgeTotals(parts: Part[]): EdgeTotal[] {
  const acc = new Map<string, number>();
  for (const p of parts) {
    if (p.virtual) continue;
    const addLen = (id: string | null, len: number) => {
      if (id) acc.set(id, (acc.get(id) ?? 0) + len * p.qty);
    };
    addLen(p.edges.l1, p.length);
    addLen(p.edges.l2, p.length);
    addLen(p.edges.w1, p.width);
    addLen(p.edges.w2, p.width);
  }
  return [...acc.entries()].map(([bandId, mm]) => ({ bandId, netM: Math.round(mm) / 1000, grossM: Math.ceil((mm * (1 + EDGE_RESERVE)) / 100) / 10 }));
}

export interface MaterialTotal {
  materialId: string;
  /** Площадь деталей по пильным размерам, м². */
  areaM2: number;
  count: number;
}

export function materialTotals(rows: CutRow[]): MaterialTotal[] {
  const acc = new Map<string, MaterialTotal>();
  for (const r of rows) {
    const e = acc.get(r.materialId) ?? { materialId: r.materialId, areaM2: 0, count: 0 };
    e.areaM2 += (r.cutLength * r.cutWidth * r.qty) / 1e6;
    e.count += r.qty;
    acc.set(r.materialId, e);
  }
  return [...acc.values()].map((e) => ({ ...e, areaM2: Math.round(e.areaM2 * 1000) / 1000 }));
}

/** Подпись кромки: толщина в мм или «—». */
export function edgeLabel(cat: CabinetCatalog, id: string | null): string {
  if (!id) return '—';
  const b = cat.bands.find((x) => x.id === id);
  return b ? String(b.thickness).replace('.', ',') : '?';
}
