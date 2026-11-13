// Виды: развёртки стен помещения, разрез, фасады. Координаты — мм модели, Y вниз (высота = −y).
import { itemDef } from '../catalog/registry';
import { dimPrims, itemSize } from '../draw2d/plan';
import type { Prim2, Style } from '../draw2d/prims';
import { line, poly, rect, text } from '../draw2d/prims';
import { bbox, cross, dot, norm, pointInPolygon, projectT, rotate, sub } from '../model/geometry';
import type { Lang, Level, Project, Room, Vec2 } from '../model/types';
import { detectRooms, geomOf, roomSurfaces, wallDir, wallLength } from '../model/walls';
import { isTiled } from '../calc/tiles';

const THIN: Style = { stroke: '#111827', w: 0.18 };
const MAIN: Style = { stroke: '#111827', w: 0.5 };
const CUT: Style = { stroke: '#111827', w: 0.5, fill: '#9aa3ae' };
const mark = (mm: number) => `${mm >= 0 ? '+' : '−'}${(Math.abs(mm) / 1000).toFixed(3).replace('.', ',')}`;

/** Развёртки: все стены помещения в ряд, с проёмами, мебелью у стены и электроточками. */
export function elevationPrims(p: Project, level: Level, room: Room, N: number, lang: Lang): Prim2[] {
  const out: Prim2[] = [];
  const H = level.height;
  const gap = 14 * N;
  let x0 = 0;
  const T = (uk: string, ru: string) => (lang === 'ru' ? ru : uk);
  const surfaces = roomSurfaces(level, room).filter((s) => s.length > 200);
  const inRoom = (it: { x: number; y: number; rot: number }) => {
    const f = rotate({ x: 0, y: 120 }, it.rot);
    return pointInPolygon({ x: it.x, y: it.y }, room.polygon) || pointInPolygon({ x: it.x + f.x, y: it.y + f.y }, room.polygon);
  };
  const items = level.items.filter(inRoom);
  surfaces.forEach((s, i) => {
    const f = p.finishes.find((q) => q.id === s.finishId);
    // сетка плитки/панелей
    if (f && isTiled(f)) {
      const sx = (f.tileW ?? 0) + (f.grout ?? 0);
      const sy = (f.tileH ?? 0) + (f.grout ?? 0);
      const g: Style = { stroke: '#c5cad1', w: 0.1 };
      if (s.length / sx + H / sy < 260) {
        for (let x = sx; x < s.length; x += sx) out.push(line(x0 + x, 0, x0 + x, -H, g));
        for (let y = sy; y < H; y += sy) out.push(line(x0, -y, x0 + s.length, -y, g));
      }
    }
    out.push(rect(x0, -H, s.length, H, MAIN));
    for (const o of s.openings) {
      const top = Math.min(H, o.sill + o.height);
      out.push(rect(x0 + o.from, -top, o.to - o.from, top - o.sill, { stroke: '#111827', w: 0.35, fill: '#ffffff' }));
      if (o.kind === 'window') {
        out.push(line(x0 + o.from, -top, x0 + o.to, -o.sill, THIN), line(x0 + o.to, -top, x0 + o.from, -o.sill, THIN));
      } else if (o.kind === 'door') {
        out.push(line(x0 + o.from, -o.sill, x0 + o.to, -top, THIN));
      }
    }
    // мебель и точки у этой стены
    const ed = norm(sub(s.b, s.a));
    for (const it of items) {
      const def = itemDef(it.kind);
      const sz = itemSize(it);
      const xAxis = rotate({ x: 1, y: 0 }, it.rot);
      const along = Math.abs(dot(xAxis, ed)) > 0.7;
      const ext = along ? sz.w : sz.d;
      const depth = along ? sz.d : sz.w;
      const t = projectT({ x: it.x, y: it.y }, s.a, s.b) * s.length;
      const dn = Math.abs(cross(sub({ x: it.x, y: it.y }, s.a), ed));
      if (dn > depth / 2 + 150 || t < -ext / 2 || t > s.length + ext / 2) continue;
      const a = Math.max(0, t - ext / 2);
      const b = Math.min(s.length, t + ext / 2);
      if (b - a < 10) continue;
      const eng = def && def.layer !== 'furniture';
      const zTop = Math.min(H, it.z + sz.h);
      if (eng && sz.h > 1500) continue;
      out.push(rect(x0 + a, -zTop, b - a, zTop - it.z, eng ? { stroke: '#dc2626', w: 0.35, fill: '#fee2e2' } : { stroke: '#6b7280', w: 0.25, fill: '#f3f4f6', opacity: 0.85 }));
      if (eng) out.push(text(x0 + (a + b) / 2, -zTop - 1.6 * N, `h=${Math.round(it.z)}`, 1.5, { color: '#dc2626' }));
    }
    out.push(...dimPrims({ x: x0, y: 0 }, { x: x0 + s.length, y: 0 }, 6 * N, N, undefined, '#111827'));
    out.push(text(x0 + s.length / 2, -H - 5 * N, `${T('Стіна', 'Стена')} ${i + 1}${f ? ` · ${f.name[lang] ?? f.name.uk}` : ''}`, 2.4, { bold: true }));
    x0 += s.length + gap;
  });
  if (surfaces.length) out.push(...dimPrims({ x: 0, y: 0 }, { x: 0, y: -H }, 6 * N, N, undefined, '#111827'));
  return out;
}

function roofProfile(p: Project, h0: number, h1: number, ridgeAlongView: boolean, baseY: number, span: number): Prim2[] {
  if (p.roof.type === 'none') return [];
  const ov = p.roof.overhang;
  const a = h0 - ov;
  const b = h1 + ov;
  if (p.roof.type === 'flat') return [rect(a, -(baseY + 250), b - a, 250, { stroke: '#111827', w: 0.35, fill: '#d1d5db' })];
  const rise = ((span + 2 * ov) / 2) * Math.tan((p.roof.pitch * Math.PI) / 180);
  const st: Style = { stroke: '#111827', w: 0.35, fill: '#e7d3cd' };
  if (ridgeAlongView) {
    const inset = p.roof.type === 'hip' ? Math.min((b - a) / 2, (span + 2 * ov) / 2) : 0;
    return [poly([{ x: a, y: -baseY }, { x: b, y: -baseY }, { x: b - inset, y: -(baseY + rise) }, { x: a + inset, y: -(baseY + rise) }], true, st)];
  }
  return [poly([{ x: a, y: -baseY }, { x: b, y: -baseY }, { x: (a + b) / 2, y: -(baseY + rise) }], true, st)];
}

function buildingBBox(p: Project) {
  const pts = p.levels.flatMap((l) => l.walls.flatMap((w) => [w.a, w.b]));
  return pts.length ? bbox(pts) : null;
}

/** Разрез по секущей плоскости. axis 'y' — секущая горизонтальна на плане (y = const), взгляд вверх плана. */
export function sectionPrims(p: Project, axis: 'x' | 'y', pos: number, N: number, lang: Lang): Prim2[] {
  const bb = buildingBBox(p);
  if (!bb) return [];
  const out: Prim2[] = [];
  const T = (uk: string, ru: string) => (lang === 'ru' ? ru : uk);
  const c = axis === 'y' ? bb.minY + (bb.maxY - bb.minY) * pos : bb.minX + (bb.maxX - bb.minX) * pos;
  const H = (q: Vec2) => (axis === 'y' ? q.x : q.y); // горизонтальная координата разреза
  const Cc = (q: Vec2) => (axis === 'y' ? q.y : q.x); // координата поперёк секущей
  let hMin = Infinity;
  let hMax = -Infinity;
  let top = 0;
  for (const lvl of p.levels) {
    const e = lvl.elevation;
    const gm = geomOf(lvl);
    const outline = detectRooms(gm.walls).outline.flat();
    if (!outline.length) continue;
    const ob = bbox(outline);
    const o0 = axis === 'y' ? ob.minX : ob.minY;
    const o1 = axis === 'y' ? ob.maxX : ob.maxY;
    hMin = Math.min(hMin, o0);
    hMax = Math.max(hMax, o1);
    top = Math.max(top, e + lvl.height + lvl.slab);
    // перекрытия: под этажом и над ним
    const below = e === 0 ? 200 : lvl.slab;
    out.push(rect(o0, -e, o1 - o0, below, { stroke: '#111827', w: 0.35, fill: '#c4c9d1' }));
    out.push(rect(o0, -(e + lvl.height + lvl.slab), o1 - o0, lvl.slab, { stroke: '#111827', w: 0.35, fill: '#c4c9d1' }));
    for (const w of gm.walls) {
      const ca = Cc(w.a);
      const cb = Cc(w.b);
      if ((ca - c) * (cb - c) > 0 || Math.abs(ca - cb) < 1) continue;
      const t = (c - ca) / (cb - ca);
      const h = H(w.a) + (H(w.b) - H(w.a)) * t;
      const d = wallDir(w);
      const sin = Math.abs(axis === 'y' ? d.y : d.x);
      const tw = w.thickness / Math.max(0.2, sin);
      const wh = w.height ?? lvl.height;
      const along = t * wallLength(w);
      const op = gm.openings.find((o) => o.wallId === w.id && Math.abs(o.pos - along) < o.width / 2);
      if (op) {
        const ot = Math.min(wh, op.sill + op.height);
        if (op.sill > 0) out.push(rect(h - tw / 2, -(e + op.sill), tw, op.sill, CUT));
        if (ot < wh) out.push(rect(h - tw / 2, -(e + wh), tw, wh - ot, CUT));
        if (op.kind === 'window') out.push(line(h, -(e + op.sill), h, -(e + ot), { stroke: '#0ea5e9', w: 0.35 }));
      } else out.push(rect(h - tw / 2, -(e + wh), tw, wh, CUT));
    }
    // подписи помещений по секущей
    for (const r of lvl.rooms) {
      const xs: number[] = [];
      for (let i = 0; i < r.polygon.length; i++) {
        const a = r.polygon[i];
        const b = r.polygon[(i + 1) % r.polygon.length];
        if (Cc(a) > c !== Cc(b) > c) xs.push(H(a) + ((c - Cc(a)) / (Cc(b) - Cc(a))) * (H(b) - H(a)));
      }
      xs.sort((m, n) => m - n);
      if (xs.length >= 2) out.push(text((xs[0] + xs[1]) / 2, -(e + lvl.height / 2), r.name, 2.2, { color: '#374151' }));
    }
    // отметки и высота
    out.push(line(o0 - 8 * N, -e, o0, -e, THIN), text(o0 - 9 * N, -e - 1.5 * N, mark(e), 2.2, { anchor: 'end' }));
    out.push(line(o0 - 8 * N, -(e + lvl.height), o0, -(e + lvl.height), THIN), text(o0 - 9 * N, -(e + lvl.height) - 1.5 * N, mark(e + lvl.height), 2.2, { anchor: 'end' }));
    out.push(...dimPrims({ x: o1, y: -e }, { x: o1, y: -(e + lvl.height) }, -8 * N, N, undefined, '#111827'));
  }
  if (!Number.isFinite(hMin)) return [];
  const alongX = bb.maxX - bb.minX >= bb.maxY - bb.minY;
  const ridgeAlongView = (axis === 'y') === alongX;
  const span = alongX ? bb.maxY - bb.minY : bb.maxX - bb.minX;
  out.push(...roofProfile(p, hMin, hMax, ridgeAlongView, top, span));
  if (p.kind === 'house') out.push(line(hMin - 15 * N, 200, hMax + 15 * N, 200, { stroke: '#111827', w: 0.7 }));
  out.push(text((hMin + hMax) / 2, 200 + 9 * N, `${T('Розріз', 'Разрез')} ${axis === 'y' ? '1–1' : '2–2'}`, 3, { bold: true }));
  return out;
}

/** Четыре фасада в ряд (ортогональные проекции стен с проёмами и профилем крыши). */
export function facadePrims(p: Project, N: number, lang: Lang): Prim2[] {
  const bb = buildingBBox(p);
  if (!bb) return [];
  const out: Prim2[] = [];
  const T = (uk: string, ru: string) => (lang === 'ru' ? ru : uk);
  const alongX = bb.maxX - bb.minX >= bb.maxY - bb.minY;
  const views: { facing: Vec2; h: (q: Vec2) => number; name: string; axisX: boolean }[] = [
    { facing: { x: 0, y: -1 }, h: (q) => q.x, name: T('Фасад А (бік «низ плану»)', 'Фасад А (сторона «низ плана»)'), axisX: true },
    { facing: { x: -1, y: 0 }, h: (q) => -q.y, name: T('Фасад Б (бік «право плану»)', 'Фасад Б (сторона «право плана»)'), axisX: false },
    { facing: { x: 0, y: 1 }, h: (q) => -q.x, name: T('Фасад В (бік «верх плану»)', 'Фасад В (сторона «верх плана»)'), axisX: true },
    { facing: { x: 1, y: 0 }, h: (q) => q.y, name: T('Фасад Г (бік «ліво плану»)', 'Фасад Г (сторона «лево плана»)'), axisX: false },
  ];
  let cursor = 0;
  let top = 0;
  for (const l of p.levels) top = Math.max(top, l.elevation + l.height + l.slab);
  for (const v of views) {
    const local: Prim2[] = [];
    let h0 = Infinity;
    let h1 = -Infinity;
    const faces: { depth: number; prims: Prim2[] }[] = [];
    for (const lvl of p.levels) {
      const e = lvl.elevation;
      const gm = geomOf(lvl);
      for (const w of gm.walls) {
        const a = v.h(w.a);
        const b = v.h(w.b);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const d = wallDir(w);
        const facingWall = Math.abs(dot(d, v.facing)) < 0.3;
        const half = facingWall ? 0 : w.thickness / 2;
        h0 = Math.min(h0, lo - half);
        h1 = Math.max(h1, hi + half);
        const wh = w.height ?? lvl.height;
        const prims: Prim2[] = [rect(lo - half, -(e + wh + lvl.slab), hi - lo + 2 * half, wh + lvl.slab + (e === 0 ? 0 : 0), { stroke: '#111827', w: 0.35, fill: '#f8f6f1' })];
        if (facingWall) {
          for (const o of gm.openings.filter((x) => x.wallId === w.id)) {
            const t = o.pos / Math.max(1, wallLength(w));
            const hc = a + (b - a) * t;
            const ot = Math.min(wh, o.sill + o.height);
            prims.push(rect(hc - o.width / 2, -(e + ot), o.width, ot - o.sill, { stroke: '#111827', w: 0.35, fill: o.kind === 'window' ? '#dbeafe' : '#e7e0d4' }));
            if (o.kind === 'window') {
              const n = Math.max(1, o.sashes);
              for (let i = 1; i < n; i++) prims.push(line(hc - o.width / 2 + (o.width * i) / n, -(e + ot), hc - o.width / 2 + (o.width * i) / n, -(e + o.sill), THIN));
            }
          }
        }
        const midp = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
        faces.push({ depth: dot(midp, v.facing), prims });
      }
    }
    if (!Number.isFinite(h0)) continue;
    faces.sort((m, n) => n.depth - m.depth);
    for (const f of faces) local.push(...f.prims);
    const span = alongX ? bb.maxY - bb.minY : bb.maxX - bb.minX;
    local.push(...roofProfile(p, h0, h1, v.axisX === alongX, top, span));
    local.push(line(h0 - 10 * N, 0, h1 + 10 * N, 0, { stroke: '#111827', w: 0.7 }));
    local.push(text((h0 + h1) / 2, 7 * N, v.name, 2.6, { bold: true }));
    local.push(text(h0 - 2 * N, -top - 1.5 * N, mark(top), 2, { anchor: 'end' }));
    const shift = cursor - h0;
    for (const q of local) out.push(shiftPrim(q, shift));
    cursor += h1 - h0 + 30 * N;
  }
  return out;
}

function shiftPrim(q: Prim2, dx: number): Prim2 {
  switch (q.t) {
    case 'line':
      return { ...q, x1: q.x1 + dx, x2: q.x2 + dx };
    case 'poly':
      return { ...q, pts: q.pts.map((p) => ({ x: p.x + dx, y: p.y })) };
    case 'path':
      return { ...q, rings: q.rings.map((r) => r.map((p) => ({ x: p.x + dx, y: p.y }))) };
    case 'circle':
    case 'arc':
      return { ...q, cx: q.cx + dx };
    case 'text':
      return { ...q, x: q.x + dx };
  }
}
