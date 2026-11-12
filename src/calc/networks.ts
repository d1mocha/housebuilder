// Инженерные сети: длины кабеля по сечениям, штробы, трубы по диаметрам, нагрузка групп.
import { itemDef, num, routeDef } from '../catalog/registry';
import { dist, polylineLength } from '../model/geometry';
import type { Item, Level, Project, Route } from '../model/types';

/** Длина трассы с учётом вертикальных опусков к приборам в её вершинах, мм. */
export function routeLengthWithDrops(route: Route, items: Item[], layer: string): { plan: number; drops: number } {
  const plan = polylineLength(route.points);
  const z = num(route.params, 'z', 0);
  let drops = 0;
  const used = new Set<string>();
  for (const pt of route.points) {
    for (const it of items) {
      if (used.has(it.id) || itemDef(it.kind)?.layer !== layer) continue;
      if (dist(pt, it) < 80) {
        drops += Math.abs(z - it.z);
        used.add(it.id);
      }
    }
  }
  return { plan, drops };
}

export interface CableRow {
  key: string;
  section: number;
  cores: number;
  /** Чистая длина, м. */
  netM: number;
  /** С запасом, м. */
  grossM: number;
}

export interface GroupRow {
  id: string;
  name: string;
  breaker: number;
  section: number;
  rcd: boolean;
  points: number;
  loadW: number;
  /** Расчётный ток, А (230 В, cos φ = 1). */
  currentA: number;
  cableM: number;
}

export interface NetworkSummary {
  cables: CableRow[];
  groups: GroupRow[];
  /** Штробы: длина по ключу «ширина×глубина», м. */
  chases: { key: string; lengthM: number }[];
  pipes: { key: string; kind: string; dia: number; lengthM: number; grossM: number }[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function networkSummary(p: Project, reservePct = 10): NetworkSummary {
  const cables = new Map<string, CableRow>();
  const chases = new Map<string, number>();
  const pipes = new Map<string, { key: string; kind: string; dia: number; mm: number }>();
  const groupCable = new Map<string, number>();
  const groupPts = new Map<string, { n: number; w: number }>();
  const k = 1 + reservePct / 100;
  const each = (lvl: Level) => {
    for (const r of lvl.routes) {
      const def = routeDef(r.kind);
      if (!def) continue;
      if (r.kind === 'el-cable') {
        const { plan, drops } = routeLengthWithDrops(r, lvl.items, 'electrical');
        const section = num(r.params, 'section', 2.5);
        const cores = num(r.params, 'cores', 3);
        const key = `${cores}×${String(section).replace('.', ',')}`;
        const row = cables.get(key) ?? { key, section, cores, netM: 0, grossM: 0 };
        row.netM += (plan + drops) / 1000;
        cables.set(key, row);
        const g = String(r.params.group ?? '');
        groupCable.set(g, (groupCable.get(g) ?? 0) + (plan + drops) / 1000);
        if (r.params.chase) {
          const ck = `${num(r.params, 'chaseWidth', 20)}×${num(r.params, 'chaseDepth', 20)}`;
          chases.set(ck, (chases.get(ck) ?? 0) + (plan + drops) / 1000);
        }
      } else if (def.layer === 'plumbing' || def.layer === 'heating' || def.layer === 'ventilation') {
        const dia = num(r.params, 'dia', 20);
        const key = `${r.kind}|${dia}`;
        const { plan, drops } = routeLengthWithDrops(r, lvl.items, def.layer);
        const e = pipes.get(key) ?? { key, kind: r.kind, dia, mm: 0 };
        e.mm += plan + drops;
        pipes.set(key, e);
        if (r.params.chase) {
          const ck = `${dia + 20}×${num(r.params, 'chaseDepth', 40)}`;
          chases.set(ck, (chases.get(ck) ?? 0) + plan / 1000);
        }
      }
    }
    for (const it of lvl.items) {
      if (itemDef(it.kind)?.layer !== 'electrical' && it.kind !== 'vt-fan') continue;
      const g = typeof it.params.group === 'string' ? it.params.group : '';
      if (!g) continue;
      const e = groupPts.get(g) ?? { n: 0, w: 0 };
      e.n += 1;
      e.w += num(it.params, 'power', 0);
      groupPts.set(g, e);
    }
  };
  p.levels.forEach(each);
  return {
    cables: [...cables.values()].map((c) => ({ ...c, netM: r2(c.netM), grossM: Math.ceil(c.netM * k) })).sort((a, b) => a.section - b.section),
    groups: p.electrical.groups.map((g) => {
      const e = groupPts.get(g.id) ?? { n: 0, w: 0 };
      return { id: g.id, name: g.name, breaker: g.breaker, section: g.section, rcd: g.rcd, points: e.n, loadW: e.w, currentA: r2(e.w / 230), cableM: r2(groupCable.get(g.id) ?? 0) };
    }),
    chases: [...chases.entries()].map(([key, m]) => ({ key, lengthM: r2(m) })),
    pipes: [...pipes.values()].map((e) => ({ key: e.key, kind: e.kind, dia: e.dia, lengthM: r2(e.mm / 1000), grossM: Math.ceil((e.mm / 1000) * k) })),
  };
}

/** Перепад высоты канализационной трубы по уклону, мм. */
export function sewerDrop(route: Route): number {
  return (polylineLength(route.points) / 1000) * num(route.params, 'slope', 0);
}

/** Допустимый длительный ток медного кабеля по сечению (ориентировочно, скрытая прокладка), А. */
export function cableAmpacity(section: number): number {
  const table: [number, number][] = [
    [1.5, 16],
    [2.5, 25],
    [4, 32],
    [6, 40],
    [10, 55],
  ];
  let a = 10;
  for (const [s, amp] of table) if (section >= s) a = amp;
  return a;
}
