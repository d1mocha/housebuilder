// Листы чертежей: рамка, штамп, условные обозначения, планы по слоям. Координаты — мм бумаги.
import { itemDef, routeDef, zoneDef } from '../catalog/registry';
import type { LayerId, Lang, Level, LS, Project } from '../model/types';
import { autoDimPrims, dimEntityPrims, itemPrims, northArrowPrims, openingPrims, roomLabelPrims, routePrims, sitePrims, wallsPrims, zonePrims } from '../draw2d/plan';
import type { Prim2 } from '../draw2d/prims';
import { line, primsBBox, rect, text, transform } from '../draw2d/prims';
import { elevationPrims, facadePrims, sectionPrims } from './views';

export type SheetKind = 'measure' | 'furniture' | 'electrical' | 'plumbing' | 'heating' | 'ventilation' | 'elevations' | 'section' | 'facades' | 'site';

export const SHEET_TITLES: Record<SheetKind, LS> = {
  measure: { uk: 'Обмірний план', ru: 'Обмерный план' },
  furniture: { uk: 'План розстановки меблів', ru: 'План расстановки мебели' },
  electrical: { uk: 'План електрики', ru: 'План электрики' },
  plumbing: { uk: 'План водопостачання та каналізації', ru: 'План водоснабжения и канализации' },
  heating: { uk: 'План опалення', ru: 'План отопления' },
  ventilation: { uk: 'План вентиляції', ru: 'План вентиляции' },
  elevations: { uk: 'Розгортки стін', ru: 'Развёртки стен' },
  section: { uk: 'Розріз', ru: 'Разрез' },
  facades: { uk: 'Фасади', ru: 'Фасады' },
  site: { uk: 'План ділянки', ru: 'План участка' },
};

export interface SheetSpec {
  kind: SheetKind;
  levelId: string;
  paper: 'A4' | 'A3';
  landscape: boolean;
  /** Знаменатель масштаба; 0 — подобрать автоматически. */
  scale: number;
  /** Для развёрток — помещение. */
  roomId?: string;
  /** Для разреза: ось ('x' — секущая вертикальна на плане) и положение 0..1. */
  sectionAxis?: 'x' | 'y';
  sectionPos?: number;
}

export interface Sheet {
  w: number;
  h: number;
  prims: Prim2[];
  title: string;
  scale: number;
}

const PAPER = { A4: [210, 297], A3: [297, 420] } as const;
const SCALES = [10, 20, 25, 40, 50, 75, 100, 150, 200, 250, 400, 500, 1000];
const STAMP_W = 185;
const STAMP_H = 40;

const pick = (ls: LS, lang: Lang) => ls[lang] ?? ls.uk;

function framePrims(w: number, h: number): Prim2[] {
  return [rect(20, 5, w - 25, h - 10, { stroke: '#000000', w: 0.5 })];
}

function stampPrims(p: Project, w: number, h: number, title: string, scale: number, sheetNo: number, lang: Lang): Prim2[] {
  const sw = Math.min(STAMP_W, w - 25);
  const x0 = w - 5 - sw;
  const y0 = h - 5 - STAMP_H;
  const s = { stroke: '#000000', w: 0.5 };
  const th = { stroke: '#000000', w: 0.18 };
  const T = (uk: string, ru: string) => (lang === 'ru' ? ru : uk);
  const out: Prim2[] = [rect(x0, y0, sw, STAMP_H, s)];
  const c1 = x0 + 65;
  const c2 = x0 + sw - 50;
  out.push(line(c1, y0, c1, y0 + STAMP_H, s), line(c2, y0 + 15, c2, y0 + STAMP_H, s));
  out.push(line(c1, y0 + 15, x0 + sw, y0 + 15, s), line(c2, y0 + 27.5, x0 + sw, y0 + 27.5, th));
  for (let i = 1; i < 4; i++) out.push(line(x0, y0 + i * 10, c1, y0 + i * 10, th));
  out.push(line(x0 + 22, y0, x0 + 22, y0 + STAMP_H, th));
  const rows: [string, string][] = [
    [T('Розробив', 'Разработал'), p.stamp.author],
    [T('Замовник', 'Заказчик'), p.stamp.customer],
    [T('Адреса', 'Адрес'), p.stamp.address],
    [T('Дата', 'Дата'), new Date().toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uk-UA')],
  ];
  rows.forEach(([k, v], i) => {
    out.push(text(x0 + 1.5, y0 + i * 10 + 5, k, 2.2, { anchor: 'start' }));
    out.push(text(x0 + 23.5, y0 + i * 10 + 5, v || '', 2.2, { anchor: 'start' }));
  });
  out.push(text((c1 + x0 + sw) / 2, y0 + 7.5, p.stamp.object || p.name, 3.5, { bold: true }));
  out.push(text((c1 + c2) / 2, y0 + 27.5, title, 3.2, { bold: true }));
  out.push(text((c2 + x0 + sw) / 2, y0 + 21.2, `${T('Масштаб', 'Масштаб')} 1:${scale}`, 2.8));
  out.push(text((c2 + x0 + sw) / 2, y0 + 33.7, `${T('Аркуш', 'Лист')} ${sheetNo}`, 2.8));
  return out;
}

/** Условные обозначения: по строке на каждый вид объекта, реально присутствующий на листе. */
function legendPrims(entries: { prims: Prim2[]; label: string }[], x: number, y: number, title: string): Prim2[] {
  if (!entries.length) return [];
  const out: Prim2[] = [text(x, y, title, 2.6, { anchor: 'start', bold: true })];
  entries.forEach((e, i) => {
    const cy = y + 6 + i * 6;
    const bb = primsBBox(e.prims);
    const size = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY, 1);
    const sc = 4.5 / size;
    out.push(...transform(e.prims, { scale: sc, tx: x + 3 - ((bb.minX + bb.maxX) / 2) * sc, ty: cy - ((bb.minY + bb.maxY) / 2) * sc }).filter((q) => q.t !== 'text'));
    out.push(text(x + 8, cy, e.label, 2.2, { anchor: 'start' }));
  });
  return out;
}

const PLAN_LAYERS: Partial<Record<SheetKind, LayerId[]>> = {
  measure: [],
  furniture: ['furniture'],
  electrical: ['electrical'],
  plumbing: ['plumbing', 'gas'],
  heating: ['heating'],
  ventilation: ['ventilation'],
  site: ['landscape'],
};

/** Содержимое плана в координатах модели при масштабе 1:N. */
function planContent(p: Project, level: Level, kind: SheetKind, N: number, lang: Lang): { prims: Prim2[]; legend: { prims: Prim2[]; label: string }[] } {
  const layers = PLAN_LAYERS[kind] ?? [];
  const out: Prim2[] = [];
  const legend = new Map<string, { prims: Prim2[]; label: string }>();
  const groupColors = new Map(p.electrical.groups.map((g) => [g.id, g.color]));
  if (kind === 'site' && p.site) {
    out.push(...sitePrims(p.site, N));
    for (const z of p.site.zones) {
      out.push(...zonePrims(z, N, pick(zoneDef(z.kind)?.name ?? { uk: '', ru: '' }, lang)));
    }
    for (const r of p.site.routes) out.push(...routePrims(r, N));
  }
  for (const z of level.zones) {
    const def = zoneDef(z.kind);
    if (def && layers.includes(def.layer)) out.push(...zonePrims(z, N, pick(def.name, lang)));
  }
  out.push(...wallsPrims(level.walls, level.openings, true));
  for (const o of level.openings) {
    const w = level.walls.find((x) => x.id === o.wallId);
    if (w) out.push(...openingPrims(o, w));
  }
  const faded = kind !== 'furniture' && kind !== 'measure' && kind !== 'site';
  if (faded) {
    // мебель бледным контуром как подоснова инженерных планов
    for (const it of level.items) {
      if ((itemDef(it.kind)?.layer ?? 'furniture') !== 'furniture') continue;
      out.push(...itemPrims(it).map((q): Prim2 => ('s' in q ? { ...q, s: { ...q.s, stroke: '#c4c9d1', fill: q.s?.fill ? '#f7f8fa' : undefined, w: 0.13 } } : q)));
    }
  }
  for (const it of level.items) {
    const def = itemDef(it.kind);
    const layer = def?.layer ?? 'furniture';
    if (!layers.includes(layer)) continue;
    out.push(...itemPrims(it));
    if (layer !== 'furniture' && def?.symbol && !legend.has(it.kind)) legend.set(it.kind, { prims: def.symbol(it.params, def.size(it.params)), label: pick(def.name, lang) });
  }
  if (kind === 'site' && p.site) {
    for (const it of p.site.items) out.push(...itemPrims(it));
  }
  for (const r of level.routes) {
    const def = routeDef(r.kind);
    if (!def || !layers.includes(def.layer)) continue;
    const color = typeof r.params.group === 'string' ? groupColors.get(r.params.group) : undefined;
    out.push(...routePrims(r, N, color));
    if (!legend.has(r.kind)) {
      const c = color ?? (typeof def.color === 'function' ? def.color(r.params) : def.color);
      legend.set(r.kind, { prims: [line(0, 0, 100, 0, { stroke: c, w: 0.5, dash: def.dash })], label: pick(def.name, lang) });
    }
  }
  for (const r of level.rooms) out.push(...roomLabelPrims(r, N));
  if (kind === 'measure') out.push(...autoDimPrims(level, N, '#1f2937'));
  for (const dm of level.dims) out.push(...dimEntityPrims(dm, N));
  return { prims: out, legend: [...legend.values()] };
}

export function buildSheet(p: Project, spec: SheetSpec, lang: Lang = 'uk', sheetNo = 1): Sheet {
  const [pw, ph] = PAPER[spec.paper];
  const w = spec.landscape ? ph : pw;
  const h = spec.landscape ? pw : ph;
  const level = p.levels.find((l) => l.id === spec.levelId) ?? p.levels[0];
  const area = { x: 25, y: 10, w: w - 35, h: h - 20 - STAMP_H - 5 };
  const T = (uk: string, ru: string) => (lang === 'ru' ? ru : uk);
  let title = pick(SHEET_TITLES[spec.kind], lang);
  if (p.levels.length > 1 && spec.kind !== 'facades' && spec.kind !== 'site' && spec.kind !== 'section') title += ` — ${level.name}`;

  const build = (N: number): { prims: Prim2[]; legend: { prims: Prim2[]; label: string }[] } => {
    if (spec.kind === 'elevations') {
      const room = level.rooms.find((r) => r.id === spec.roomId) ?? level.rooms[0];
      return { prims: room ? elevationPrims(p, level, room, N, lang) : [], legend: [] };
    }
    if (spec.kind === 'section') return { prims: sectionPrims(p, spec.sectionAxis ?? 'y', spec.sectionPos ?? 0.5, N, lang), legend: [] };
    if (spec.kind === 'facades') return { prims: facadePrims(p, N, lang), legend: [] };
    return planContent(p, level, spec.kind, N, lang);
  };

  // подбор масштаба: содержимое строится при пробном N, габариты почти не зависят от N
  let N = spec.scale > 0 ? spec.scale : 100;
  let content = build(N);
  if (spec.scale <= 0) {
    const bb = primsBBox(content.prims);
    const cw = bb.maxX - bb.minX;
    const chh = bb.maxY - bb.minY;
    const legendW = content.legend.length ? 55 : 0;
    N = SCALES.find((s) => cw / s <= area.w - legendW - 16 && chh / s <= area.h - 16) ?? 1000;
    content = build(N);
  }
  if (spec.kind === 'elevations') {
    const room = level.rooms.find((r) => r.id === spec.roomId) ?? level.rooms[0];
    if (room) title += ` — ${room.name}`;
  }
  const prims: Prim2[] = [...framePrims(w, h)];
  if (content.prims.length) {
    const bb = primsBBox(content.prims);
    const legendW = content.legend.length ? 55 : 0;
    const cx = area.x + (area.w - legendW) / 2;
    const cy = area.y + area.h / 2;
    prims.push(...transform(content.prims, { scale: 1 / N, tx: cx - (bb.minX + bb.maxX) / 2 / N, ty: cy - (bb.minY + bb.maxY) / 2 / N }));
    if (content.legend.length) prims.push(...legendPrims(content.legend, w - 5 - legendW, 14, T('Умовні позначення', 'Условные обозначения')));
  } else {
    prims.push(text(w / 2, h / 2, T('Немає даних для цього аркуша', 'Нет данных для этого листа'), 4, { color: '#6b7280' }));
  }
  if (p.site && (spec.kind === 'site' || spec.kind === 'measure')) prims.push(...northArrowPrims(32, 18, p.site.north, 1));
  prims.push(text(25, h - 5 - STAMP_H - 2, T('Застосунок не замінює проєкт сертифікованого фахівця. Нормативні значення потребують перевірки.', 'Приложение не заменяет проект сертифицированного специалиста. Нормативные значения требуют проверки.'), 1.8, { anchor: 'start', color: '#6b7280' }));
  prims.push(...stampPrims(p, w, h, title, N, sheetNo, lang));
  return { w, h, prims, title, scale: N };
}

/** Набор листов по умолчанию для проекта. */
export function defaultSheetSpecs(p: Project, paper: 'A4' | 'A3' = 'A3'): SheetSpec[] {
  const specs: SheetSpec[] = [];
  const base = { paper, landscape: true, scale: 0 } as const;
  for (const l of p.levels) {
    specs.push({ ...base, kind: 'measure', levelId: l.id });
    specs.push({ ...base, kind: 'furniture', levelId: l.id });
    const has = (layer: LayerId) => l.items.some((it) => itemDef(it.kind)?.layer === layer) || l.routes.some((r) => routeDef(r.kind)?.layer === layer) || l.zones.some((z) => zoneDef(z.kind)?.layer === layer);
    if (has('electrical')) specs.push({ ...base, kind: 'electrical', levelId: l.id });
    if (has('plumbing')) specs.push({ ...base, kind: 'plumbing', levelId: l.id });
    if (has('heating')) specs.push({ ...base, kind: 'heating', levelId: l.id });
    if (has('ventilation')) specs.push({ ...base, kind: 'ventilation', levelId: l.id });
    for (const r of l.rooms) specs.push({ ...base, kind: 'elevations', levelId: l.id, roomId: r.id });
  }
  const l0 = p.levels[0];
  if (l0) {
    specs.push({ ...base, kind: 'section', levelId: l0.id, sectionAxis: 'y', sectionPos: 0.5 });
    specs.push({ ...base, kind: 'section', levelId: l0.id, sectionAxis: 'x', sectionPos: 0.5 });
    if (p.kind === 'house') {
      specs.push({ ...base, kind: 'facades', levelId: l0.id });
      if (p.site) specs.push({ ...base, kind: 'site', levelId: l0.id });
    }
  }
  return specs;
}
