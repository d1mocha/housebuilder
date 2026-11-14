// Оверлеи 2D-редактора: индикаторы геометрии (90°, ∥, угол), подсветка выделения с ручками, предпросмотр инструментов.
import { Prims } from '../draw2d/Svg';
import { COL, dimPrims, itemSize, openingPrims } from '../draw2d/plan';
import type { TFn } from '../i18n';
import { createWall } from '../model/defaults';
import { add, dist, dot, mid, mul, norm, perp, rectCorners, rotate, sub } from '../model/geometry';
import { getContainer } from '../model/ops';
import { itemWallRelation, rightAngleMark, segRelations } from '../model/relations';
import type { SegRelations } from '../model/relations';
import type { Item, Level, Opening, Project, Sel, Vec2, Wall } from '../model/types';
import { arcMid, baseWallId, geomOf, openingGeom, wallDir, wallLen, wallPolygon } from '../model/walls';
import type { Geom } from '../model/walls';
import type { ToolId } from '../store/uiStore';
import { ItemG, ptsAttr } from './layers';
import type { SnapResult } from './snapping';

export const GREEN = '#16a34a';
const GUIDE = '#c026d3';

export interface RelState {
  a: Vec2;
  b: Vec2;
  r: SegRelations;
}

export interface Preview {
  pts: Vec2[];
  cur: Vec2 | null;
  snap: SnapResult | null;
  typed: string;
  opening: Opening | null;
  ghost: Item | null;
  calibAsk: { a: Vec2; b: Vec2 } | null;
  /** Отношения рисуемого/перемещаемого отрезка: прямые углы, параллельность, угол. */
  rel: RelState | null;
  /** Направляющие выравнивания по соседним объектам. */
  guides: { a: Vec2; b: Vec2 }[];
}
export const emptyPreview: Preview = { pts: [], cur: null, snap: null, typed: '', opening: null, ghost: null, calibAsk: null, rel: null, guides: [] };

/** Индикаторы отношений отрезка: значки прямого угла, подсветка параллельной стены и метка ∥, угол у курсора. */
export function RelMarks({ rel, zoom, withAngle }: { rel: RelState; zoom: number; withAngle: boolean }) {
  const out: React.ReactNode[] = [];
  const sz = 11 / zoom;
  rel.r.right.forEach((ra, i) => {
    out.push(<polyline key={`ra${i}`} data-ind="right" points={ptsAttr(rightAngleMark(ra, sz))} fill="none" stroke={GREEN} strokeWidth={1.6 / zoom} />);
  });
  const m = mid(rel.a, rel.b);
  const n = perp(norm(sub(rel.b, rel.a)));
  if (rel.r.parallel) {
    const w = rel.r.parallel.wall;
    out.push(<line key="pw" data-ind="parallel" x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={GREEN} strokeWidth={3 / zoom} strokeOpacity={0.75} />);
    const marks: [Vec2, string][] = [
      [add(m, mul(n, -16 / zoom)), 'a'],
      [add(mid(w.a, w.b), mul(n, -16 / zoom)), 'b'],
    ];
    for (const [pt, kk] of marks) {
      out.push(
        <text key={`pl${kk}`} data-ind="parallel-mark" x={pt.x} y={pt.y} fontSize={15 / zoom} textAnchor="middle" dominantBaseline="central" fill={GREEN} fontWeight={700} stroke="#fff" strokeWidth={3 / zoom} paintOrder="stroke">
          ∥
        </text>,
      );
    }
  }
  if (withAngle) {
    const num = (x: number) => String(x).replace('.', ',');
    const label = `${num(rel.r.angle)}°${rel.r.rel !== null ? ` · ∠${num(rel.r.rel)}°` : ''}`;
    out.push(
      <text key="ang" data-ind="angle" x={rel.b.x + 14 / zoom} y={rel.b.y - 14 / zoom} fontSize={12 / zoom} fill={rel.r.right.length ? GREEN : '#1e40af'} fontWeight={600} stroke="#fff" strokeWidth={3 / zoom} paintOrder="stroke">
        {label}
      </text>,
    );
  }
  return <g style={{ pointerEvents: 'none' }}>{out}</g>;
}

function Handle({ p, h, i = 0, zoom, shape = 'circle' }: { p: Vec2; h: string; i?: number; zoom: number; shape?: 'circle' | 'diamond' }) {
  const hr = 5 / zoom;
  const sw = 2 / zoom;
  if (shape === 'circle') return <circle data-h={h} data-i={i} data-x={p.x} data-y={p.y} cx={p.x} cy={p.y} r={hr} fill="#fff" stroke={COL.select} strokeWidth={sw} style={{ cursor: 'crosshair' }} />;
  return <rect data-h={h} data-i={i} data-x={p.x} data-y={p.y} x={p.x - hr * 0.8} y={p.y - hr * 0.8} width={hr * 1.6} height={hr * 1.6} transform={`rotate(45 ${p.x} ${p.y})`} fill="#fff" stroke={GREEN} strokeWidth={sw} style={{ cursor: 'ns-resize' }} />;
}

interface SelProps {
  sel: Sel;
  /** Одиночное выделение: показывать ручки, размеры и постоянные индикаторы. */
  single: boolean;
  project: Project;
  level: Level;
  geom: Geom;
  hitPolys: { wall: Wall; polys: Vec2[][] }[];
  k: number;
  zoom: number;
  /** Идёт перетаскивание — постоянные индикаторы скрыты (показываются динамические). */
  moving: boolean;
}

/** Подсветка выделенного объекта. */
export function SelOverlay({ sel, single, project, level, geom, hitPolys, k, zoom, moving }: SelProps) {
  const sw = 2 / zoom;
  if (sel.type === 'wall') {
    const hp = hitPolys.find((x) => x.wall.id === sel.id);
    if (!hp) return null;
    const w = hp.wall;
    const n = perp(wallDir(w));
    const off = w.thickness / 2 + 4 * k;
    return (
      <g>
        {hp.polys.map((pg, i) => (
          <polygon key={i} points={ptsAttr(pg)} fill={COL.select} fillOpacity={0.25} stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
        ))}
        {single && (
          <>
            {!w.arc && (
              <g style={{ pointerEvents: 'none' }}>
                <Prims prims={dimPrims(w.a, w.b, dot(n, { x: 0, y: -1 }) >= 0 ? off : -off, k, undefined, COL.select)} k={k} />
              </g>
            )}
            {/* постоянная подсветка: прямые углы с соседями и параллельная стена */}
            {!moving && !w.arc && w.status !== 'demolish' && <RelMarks rel={{ a: w.a, b: w.b, r: segRelations(w.a, w.b, geom.walls.filter((x) => baseWallId(x.id) !== w.id)) }} zoom={zoom} withAngle={false} />}
            <Handle p={w.a} h="wa" zoom={zoom} />
            <Handle p={w.b} h="wb" zoom={zoom} />
            {/* ручка стрелы дуги вынесена в сторону от стены, чтобы не мешать перетаскиванию стены за середину */}
            {w.status !== 'demolish' && <Handle p={add(w.arc ? arcMid(w) : mid(w.a, w.b), mul(n, (dot(n, { x: 0, y: -1 }) >= 0 ? -1 : 1) * (w.thickness / 2 + 5 * k)))} h="wm" zoom={zoom} shape="diamond" />}
          </>
        )}
      </g>
    );
  }
  if (sel.type === 'opening') {
    const o = geom.openings.find((x) => x.id === sel.id);
    const w = o && geom.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return null;
    const g = openingGeom(o, w);
    const off = (o.swing === 'L' ? -1 : 1) * (w.thickness / 2 + 4 * k);
    return (
      <g style={{ pointerEvents: 'none' }}>
        <polygon points={ptsAttr(g.quad)} fill={COL.select} fillOpacity={0.3} stroke={COL.select} strokeWidth={sw} />
        {single && <Prims prims={[...dimPrims(w.a, g.p1, off, k, undefined, COL.select), ...dimPrims(g.p1, g.p2, off, k, undefined, COL.select), ...dimPrims(g.p2, w.b, off, k, undefined, COL.select)]} k={k} />}
      </g>
    );
  }
  if (sel.type === 'room') {
    const r = level.rooms.find((x) => x.id === sel.id);
    return r ? <polygon points={ptsAttr(r.polygon)} fill={COL.select} fillOpacity={0.12} stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} /> : null;
  }
  if (sel.type === 'item') {
    const it = getContainer(project, sel.scope)?.items.find((i) => i.id === sel.id);
    if (!it) return null;
    const s = itemSize(it);
    const cs = rectCorners({ x: it.x, y: it.y }, Math.max(s.w, 100), Math.max(s.d, 100), it.rot);
    const rh = add({ x: it.x, y: it.y }, rotate({ x: 0, y: Math.max(s.d, 100) / 2 + 6 * k }, it.rot));
    const fr = add({ x: it.x, y: it.y }, rotate({ x: 0, y: Math.max(s.d, 100) / 2 }, it.rot));
    // постоянная подсветка: объект параллелен / перпендикулярен ближайшей стене
    const rel = single && !moving && sel.scope !== 'site' ? itemWallRelation({ x: it.x, y: it.y }, it.rot, geom.walls) : null;
    return (
      <g>
        <polygon points={ptsAttr(cs)} fill="none" stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
        {rel && (
          <g style={{ pointerEvents: 'none' }} data-ind={`item-${rel.kind}`}>
            <line x1={rel.wall.a.x} y1={rel.wall.a.y} x2={rel.wall.b.x} y2={rel.wall.b.y} stroke={GREEN} strokeWidth={3 / zoom} strokeOpacity={0.6} />
            <text x={cs[1].x + 10 / zoom} y={cs[1].y - 10 / zoom} fontSize={14 / zoom} fill={GREEN} fontWeight={700} stroke="#fff" strokeWidth={3 / zoom} paintOrder="stroke">
              {rel.kind === 'parallel' ? '∥' : '⊥'}
            </text>
          </g>
        )}
        {single && (
          <>
            <line x1={fr.x} y1={fr.y} x2={rh.x} y2={rh.y} stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
            <Handle p={rh} h="rot" zoom={zoom} />
          </>
        )}
      </g>
    );
  }
  if (sel.type === 'route' || sel.type === 'zone') {
    const c = getContainer(project, sel.scope);
    const ent = sel.type === 'route' ? c?.routes.find((r) => r.id === sel.id) : c?.zones.find((z) => z.id === sel.id);
    if (!ent) return null;
    return (
      <g>
        {sel.type === 'zone' ? (
          <polygon points={ptsAttr(ent.points)} fill="none" stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
        ) : (
          <polyline points={ptsAttr(ent.points)} fill="none" stroke={COL.select} strokeWidth={sw * 2} strokeOpacity={0.5} style={{ pointerEvents: 'none' }} />
        )}
        {single && ent.points.map((q, i) => <Handle key={i} p={q} h="pt" i={i} zoom={zoom} />)}
      </g>
    );
  }
  if (sel.type === 'site' && project.site) {
    return (
      <g>
        {project.site.boundary.map((q, i) => (
          <Handle key={i} p={q} h="pt" i={i} zoom={zoom} />
        ))}
      </g>
    );
  }
  if (sel.type === 'dim') {
    const dm = level.dims.find((x) => x.id === sel.id);
    if (!dm) return null;
    return (
      <g>
        <line x1={dm.a.x} y1={dm.a.y} x2={dm.b.x} y2={dm.b.y} stroke={COL.select} strokeWidth={sw} strokeDasharray={`${4 / zoom}`} style={{ pointerEvents: 'none' }} />
        {single && <Handle p={dm.a} h="da" zoom={zoom} />}
        {single && <Handle p={dm.b} h="db" zoom={zoom} />}
      </g>
    );
  }
  return null;
}

interface PreviewProps {
  pv: Preview;
  tool: ToolId;
  level: Level;
  k: number;
  zoom: number;
  wallThickness: number;
  t: TFn;
}

/** Предпросмотр текущего инструмента: стена, дуга, комната, проём, размер, рулетка, трасса, зона, калибровка. */
export function ToolPreview({ pv, tool, level, k, zoom, wallThickness, t }: PreviewProps) {
  const out: React.ReactNode[] = [];
  const lw = 1.5 / zoom;
  const hr = 5 / zoom;
  if (pv.snap) {
    pv.snap.guides.forEach((g, i) => out.push(<line key={`g${i}`} data-ind="guide" x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} stroke="#22c55e" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom}`} />));
    if (pv.snap.kind === 'node' || pv.snap.kind === 'wall') {
      const p = pv.snap.point;
      out.push(<rect key="sn" x={p.x - hr} y={p.y - hr} width={hr * 2} height={hr * 2} fill="none" stroke="#22c55e" strokeWidth={lw} />);
    }
  }
  // направляющие выравнивания по соседним объектам
  pv.guides.forEach((g, i) => out.push(<line key={`al${i}`} data-ind="align" x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} stroke={GUIDE} strokeWidth={1.2 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />));
  if (pv.rel) out.push(<RelMarks key="rel" rel={pv.rel} zoom={zoom} withAngle />);
  if (tool === 'wall' && pv.cur) {
    if (pv.pts.length) {
      const a = pv.pts[0];
      let b = pv.cur;
      if (pv.typed) b = add(a, mul(norm(sub(pv.cur, a)), Number(pv.typed)));
      const n = mul(perp(norm(sub(b, a))), wallThickness / 2);
      out.push(<polygon key="wp" points={ptsAttr([add(a, n), add(b, n), sub(b, n), sub(a, n)])} fill="#60a5fa" fillOpacity={0.4} stroke="#2563eb" strokeWidth={lw} />);
      out.push(<Prims key="wd" prims={dimPrims(a, b, wallThickness / 2 + 4 * k, k, pv.typed ? `${pv.typed}▏` : undefined, '#2563eb')} k={k} />);
      // продолжение оси пунктиром
      const ext = mul(norm(sub(b, a)), 700);
      out.push(<line key="wx" data-ind="axis" x1={b.x} y1={b.y} x2={b.x + ext.x} y2={b.y + ext.y} stroke="#2563eb" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom}`} strokeOpacity={0.6} />);
    } else out.push(<circle key="wc" cx={pv.cur.x} cy={pv.cur.y} r={hr * 0.7} fill="#2563eb" />);
  }
  if (tool === 'arc' && pv.cur) {
    if (pv.pts.length === 1) out.push(<line key="ac" x1={pv.pts[0].x} y1={pv.pts[0].y} x2={pv.cur.x} y2={pv.cur.y} stroke="#2563eb" strokeWidth={lw} strokeDasharray={`${4 / zoom}`} />);
    else if (pv.pts.length === 2) {
      const [a, b] = pv.pts;
      const s = Math.round(dot(sub(pv.cur, mid(a, b)), perp(norm(sub(b, a)))) / 10) * 10;
      const tmp: Wall = { ...createWall(a, b, { thickness: wallThickness }), ...(Math.abs(s) >= 40 ? { arc: s } : {}) };
      const g = geomOf({ walls: [tmp], openings: [] });
      g.walls.forEach((x, i) => out.push(<polygon key={`aw${i}`} points={ptsAttr(wallPolygon(x, g.walls))} fill="#60a5fa" fillOpacity={0.4} stroke="#2563eb" strokeWidth={lw} />));
      out.push(
        <text key="at" x={pv.cur.x + 12 / zoom} y={pv.cur.y - 12 / zoom} fontSize={12 / zoom} fill="#1e40af" stroke="#fff" strokeWidth={3 / zoom} paintOrder="stroke">
          {t('стріла', 'стрела')} {Math.abs(s)} мм · {t('дуга', 'дуга')} {Math.round(wallLen(tmp))} мм
        </text>,
      );
    } else out.push(<circle key="ac0" cx={pv.cur.x} cy={pv.cur.y} r={hr * 0.7} fill="#2563eb" />);
  }
  if (tool === 'room' && pv.pts.length && pv.cur) {
    const a = pv.pts[0];
    const b = pv.cur;
    out.push(<rect key="rr" x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="#60a5fa" fillOpacity={0.15} stroke="#2563eb" strokeWidth={lw} />);
    out.push(<Prims key="rd1" prims={[...dimPrims(a, { x: b.x, y: a.y }, -4 * k, k, undefined, '#2563eb'), ...dimPrims({ x: b.x, y: a.y }, b, -4 * k, k, undefined, '#2563eb')]} k={k} />);
  }
  if (pv.opening) {
    // предпросмотр проёма строится через ту же производную геометрию (в т. ч. на дуговой стене)
    const g = geomOf({ walls: level.walls, openings: [...level.openings, pv.opening] });
    const go = g.openings.find((x) => x.id === 'preview');
    const w = go && g.walls.find((x) => x.id === go.wallId);
    if (go && w) {
      const og = openingGeom(go, w);
      out.push(<polygon key="oq" points={ptsAttr(og.quad)} fill="#fff" stroke="#2563eb" strokeWidth={lw} />);
      out.push(<Prims key="op" prims={openingPrims(go, w)} k={k} />);
      const off = (go.swing === 'L' ? -1 : 1) * (w.thickness / 2 + 4 * k);
      if (w.id === pv.opening.wallId) out.push(<Prims key="od" prims={[...dimPrims(w.a, og.p1, off, k, undefined, '#2563eb'), ...dimPrims(og.p2, w.b, off, k, undefined, '#2563eb')]} k={k} />);
    }
  }
  if (tool === 'dim' && pv.cur) {
    if (pv.pts.length === 1) out.push(<Prims key="dp" prims={dimPrims(pv.pts[0], pv.cur, 0, k)} k={k} />);
    else if (pv.pts.length === 2) {
      const [a, b] = pv.pts;
      out.push(<Prims key="dp" prims={dimPrims(a, b, dot(sub(pv.cur, a), perp(norm(sub(b, a)))), k)} k={k} />);
    }
  }
  if (tool === 'measure' && pv.pts.length) {
    const a = pv.pts[0];
    const b = pv.pts[1] ?? pv.cur;
    if (b && dist(a, b) > 1) {
      const L = dist(a, b);
      const m = mid(a, b);
      out.push(<line key="ml" data-measure x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dc2626" strokeWidth={2 / zoom} />);
      out.push(<circle key="mca" cx={a.x} cy={a.y} r={hr * 0.7} fill="#dc2626" />);
      out.push(<circle key="mcb" cx={b.x} cy={b.y} r={hr * 0.7} fill="#dc2626" />);
      out.push(
        <text key="mt" data-measure-label x={m.x} y={m.y - 12 / zoom} fontSize={14 / zoom} textAnchor="middle" fill="#b91c1c" fontWeight={700} stroke="#fff" strokeWidth={4 / zoom} paintOrder="stroke">
          {Math.round(L)} мм ({(L / 1000).toFixed(2).replace('.', ',')} м) · ΔX {Math.round(Math.abs(b.x - a.x))} · ΔY {Math.round(Math.abs(b.y - a.y))}
        </text>,
      );
    }
  }
  if (pv.ghost) out.push(<ItemG key="gh" item={pv.ghost} k={k} scope="" locked ghost />);
  if ((tool === 'route' || tool === 'zone') && pv.cur) {
    const pts = [...pv.pts, pv.cur];
    const color = tool === 'route' ? '#2563eb' : '#16a34a';
    out.push(tool === 'zone' && pts.length > 2 ? <polygon key="zp" points={ptsAttr(pts)} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={lw} /> : <polyline key="rp" points={ptsAttr(pts)} fill="none" stroke={color} strokeWidth={lw} />);
    if (pv.pts.length) out.push(<Prims key="rl" prims={dimPrims(pv.pts[pv.pts.length - 1], pv.cur, 3 * k, k, undefined, color)} k={k} />);
    pv.pts.forEach((q, i) => out.push(<circle key={`rv${i}`} cx={q.x} cy={q.y} r={hr * 0.6} fill={color} />));
  }
  if (tool === 'calibrate' && pv.pts.length) {
    const b = pv.pts[1] ?? pv.cur;
    if (b) out.push(<Prims key="cl" prims={dimPrims(pv.pts[0], b, 0, k, undefined, '#dc2626')} k={k} />);
  }
  return <g style={{ pointerEvents: 'none' }}>{out}</g>;
}
