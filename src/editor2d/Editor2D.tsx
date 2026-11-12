// SVG-редактор плана: вьюпорт, слои, инструменты, перетаскивание, привязки.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { itemDef, routeDef, zoneDef } from '../catalog/registry';
import { Prims } from '../draw2d/Svg';
import {
  COL,
  autoDimPrims,
  dimEntityPrims,
  dimPrims,
  itemLocalPrims,
  itemSize,
  northArrowPrims,
  openingPrims,
  roomLabelPrims,
  routePrims,
  sitePrims,
  wallsPrims,
  zonePrims,
} from '../draw2d/plan';
import type { Prim2 } from '../draw2d/prims';
import { useT } from '../i18n';
import { createOpening, createWall } from '../model/defaults';
import { add, angleDeg, bbox, closestOnSegment, dist, dot, eq, mul, norm, perp, pointInPolygon, projectT, rectCorners, rotate, sub } from '../model/geometry';
import { newId } from '../model/ids';
import { duplicateEntity, flipWall, getContainer, getLevel, makeItem, moveNode, removeEntity, splitWall, translateWall } from '../model/ops';
import type { Item, LayerId, Level, Opening, Project, Route, Sel, Vec2, Wall, Zone } from '../model/types';
import { clampOpeningPos, nearestWall, openingGeom, wallDir, wallLength, wallPolygon } from '../model/walls';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import { ContextMenu } from './ContextMenu';
import type { MenuEntry } from './ContextMenu';
import { snapItemToWalls } from './itemSnap';
import { snapPoint } from './snapping';
import type { SnapResult } from './snapping';
import { siteShadowPrims } from '../calc/shadow2d';

const PX_PER_PAPER_MM = 3.78;

interface View {
  cx: number;
  cy: number;
  zoom: number;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx0: number; cy0: number; moved: boolean; deselect: boolean }
  | { kind: 'move'; sel: Sel; start: Vec2; moved: boolean }
  | { kind: 'handle'; sel: Sel; h: string; i: number; start: Vec2; orig: Vec2; moved: boolean };

interface Preview {
  pts: Vec2[];
  cur: Vec2 | null;
  snap: SnapResult | null;
  typed: string;
  opening: Opening | null;
  ghost: Item | null;
  calibAsk: { a: Vec2; b: Vec2 } | null;
}
const emptyPreview: Preview = { pts: [], cur: null, snap: null, typed: '', opening: null, ghost: null, calibAsk: null };

const layerOfItem = (it: Item): LayerId => itemDef(it.kind)?.layer ?? 'furniture';
const layerOfRoute = (r: Route): LayerId => routeDef(r.kind)?.layer ?? 'electrical';
const layerOfZone = (z: Zone): LayerId => zoneDef(z.kind)?.layer ?? 'heating';

// ───────── Мемоизированные слои ─────────

const WallsLayer = memo(function WallsLayer({ walls, openings, k, ghost }: { walls: Wall[]; openings: Opening[]; k: number; ghost?: boolean }) {
  const prims = useMemo(() => wallsPrims(walls, openings), [walls, openings]);
  return (
    <g opacity={ghost ? 0.18 : 1} style={{ pointerEvents: 'none' }}>
      <Prims prims={prims} k={k} />
    </g>
  );
});

const OpeningG = memo(function OpeningG({ o, wall, k, scope, locked }: { o: Opening; wall: Wall; k: number; scope: string; locked: boolean }) {
  const prims = useMemo(() => openingPrims(o, wall), [o, wall]);
  const g = openingGeom(o, wall);
  return (
    <g data-t="opening" data-id={o.id} data-scope={scope} style={{ pointerEvents: locked ? 'none' : undefined, cursor: 'move' }}>
      <polygon points={g.quad.map((q) => `${q.x},${q.y}`).join(' ')} fill="#fff" fillOpacity={0.01} stroke="none" />
      <Prims prims={prims} k={k} />
    </g>
  );
});

const ItemG = memo(function ItemG({ item, k, scope, locked, ghost }: { item: Item; k: number; scope: string; locked: boolean; ghost?: boolean }) {
  const prims = useMemo(() => itemLocalPrims(item), [item.kind, item.params]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = itemSize(item);
  const hw = Math.max(s.w, 160) / 2;
  const hd = Math.max(s.d, 160) / 2;
  return (
    <g
      data-t={ghost ? undefined : 'item'}
      data-id={item.id}
      data-scope={scope}
      transform={`translate(${item.x} ${item.y}) rotate(${item.rot})`}
      opacity={ghost ? 0.6 : 1}
      style={{ pointerEvents: locked || ghost ? 'none' : undefined, cursor: 'move' }}
    >
      <rect x={-hw} y={-hd} width={hw * 2} height={hd * 2} fill="#fff" fillOpacity={0.01} />
      <Prims prims={prims} k={k} />
    </g>
  );
});

const RouteG = memo(function RouteG({ route, k, scope, locked, color }: { route: Route; k: number; scope: string; locked: boolean; color?: string }) {
  const prims = useMemo(() => routePrims(route, k, color), [route, k, color]);
  return (
    <g data-t="route" data-id={route.id} data-scope={scope} style={{ pointerEvents: locked ? 'none' : undefined, cursor: 'move' }}>
      <polyline points={route.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#000" strokeOpacity={0.001} strokeWidth={Math.max(10 / (PX_PER_PAPER_MM / k), routeDef(route.kind)?.width?.(route.params) ?? 0)} />
      <Prims prims={prims} k={k} />
    </g>
  );
});

const ZoneG = memo(function ZoneG({ zone, k, scope, locked, label }: { zone: Zone; k: number; scope: string; locked: boolean; label: string }) {
  const prims = useMemo(() => zonePrims(zone, k, label), [zone, k, label]);
  return (
    <g data-t="zone" data-id={zone.id} data-scope={scope} style={{ pointerEvents: locked ? 'none' : undefined, cursor: 'move' }}>
      <Prims prims={prims} k={k} />
    </g>
  );
});

function Grid({ view, w, h }: { view: View; w: number; h: number }) {
  const steps = [100, 500, 1000, 5000, 10000];
  const step = steps.find((s) => s * view.zoom >= 9) ?? 10000;
  const x0 = view.cx - w / 2 / view.zoom;
  const x1 = view.cx + w / 2 / view.zoom;
  const y0 = view.cy - h / 2 / view.zoom;
  const y1 = view.cy + h / 2 / view.zoom;
  const lines: React.ReactNode[] = [];
  const major = step * (step === 100 || step === 1000 ? 10 : 2);
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    lines.push(<line key={`x${x}`} x1={x} y1={y0} x2={x} y2={y1} stroke={x % major === 0 ? '#d5dae1' : '#eceff3'} strokeWidth={1 / view.zoom} />);
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    lines.push(<line key={`y${y}`} x1={x0} y1={y} x2={x1} y2={y} stroke={y % major === 0 ? '#d5dae1' : '#eceff3'} strokeWidth={1 / view.zoom} />);
  }
  return <g style={{ pointerEvents: 'none' }}>{lines}</g>;
}

/** Габариты содержимого для «показать всё». */
function contentBBox(project: Project, level: Level | undefined) {
  const pts: Vec2[] = [];
  if (level) {
    for (const w of level.walls) pts.push(w.a, w.b);
    for (const it of level.items) pts.push({ x: it.x, y: it.y });
    if (level.underlay?.visible) {
      const u = level.underlay;
      pts.push({ x: u.x, y: u.y }, { x: u.x + u.pxW * u.scale, y: u.y + u.pxH * u.scale });
    }
  }
  if (project.site) pts.push(...project.site.boundary);
  if (!pts.length) return { minX: -3000, minY: -3000, maxX: 9000, maxY: 7000 };
  return bbox(pts);
}

export function Editor2D() {
  const { t, ls } = useT();
  const project = useProject((s) => s.project);
  const tool = useUi((s) => s.tool);
  const toolKind = useUi((s) => s.toolKind);
  const selection = useUi((s) => s.selection);
  const activeLevelId = useUi((s) => s.activeLevelId);
  const layers = useUi((s) => s.layers);
  const autoDims = useUi((s) => s.autoDims);
  const focus = useUi((s) => s.focus);
  const level = project.levels.find((l) => l.id === activeLevelId) ?? project.levels[0];
  const levelIdx = project.levels.indexOf(level);
  const below = levelIdx > 0 ? project.levels[levelIdx - 1] : null;

  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 3000, cy: 2000, zoom: 0.08 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const [pv, setPv] = useState<Preview>(emptyPreview);
  const pvRef = useRef(pv);
  pvRef.current = pv;
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const [menu, setMenu] = useState<{ x: number; y: number; sel: Sel | null; world: Vec2 } | null>(null);
  const [calibValue, setCalibValue] = useState('');

  const k = PX_PER_PAPER_MM / view.zoom;

  // ── размеры и «показать всё» ──
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(100, el.clientWidth), h: Math.max(100, el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.max(100, el.clientWidth), h: Math.max(100, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const p = useProject.getState().project;
    const lvl = p.levels.find((l) => l.id === useUi.getState().activeLevelId) ?? p.levels[0];
    const bb = contentBBox(p, lvl);
    const { w, h } = sizeRef.current;
    const zoom = Math.min((w - 80) / Math.max(1000, bb.maxX - bb.minX), (h - 80) / Math.max(1000, bb.maxY - bb.minY));
    setView({ cx: (bb.minX + bb.maxX) / 2, cy: (bb.minY + bb.maxY) / 2, zoom: Math.max(0.004, Math.min(1.5, zoom)) });
  }, []);

  const fittedFor = useRef('');
  useEffect(() => {
    const key = `${project.id}|${level?.id}|${size.w > 100}`;
    if (fittedFor.current !== key && size.w > 100) {
      fittedFor.current = key;
      fit();
    }
  }, [project.id, level?.id, size.w, fit]);

  useEffect(() => {
    if (focus) setView((v) => ({ ...v, cx: focus.point.x, cy: focus.point.y, zoom: Math.max(v.zoom, 0.1) }));
  }, [focus]);

  useEffect(() => {
    const onFit = () => fit();
    window.addEventListener('hb-fit', onFit);
    return () => window.removeEventListener('hb-fit', onFit);
  }, [fit]);

  // сброс предпросмотра при смене инструмента
  useEffect(() => {
    setPv(emptyPreview);
  }, [tool, toolKind, activeLevelId]);

  const toWorld = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - r.width / 2) / v.zoom + v.cx, y: (e.clientY - r.top - r.height / 2) / v.zoom + v.cy };
  };

  // ── колесо: масштаб к курсору ──
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const r = el.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * 0.0015);
      const zoom = Math.max(0.004, Math.min(2.5, v.zoom * f));
      const mx = e.clientX - r.left - r.width / 2;
      const my = e.clientY - r.top - r.height / 2;
      const wx = mx / v.zoom + v.cx;
      const wy = my / v.zoom + v.cy;
      setView({ zoom, cx: wx - mx / zoom, cy: wy - my / zoom });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── привязка ──
  const snap = (raw: Vec2, opts: { from?: Vec2 | null; points?: Vec2[]; excludeWalls?: Set<string>; excludePoints?: Vec2[]; grid?: number; noWalls?: boolean } = {}): SnapResult => {
    const ui = useUi.getState();
    const p = useProject.getState().project;
    const lvl = p.levels.find((l) => l.id === ui.activeLevelId) ?? p.levels[0];
    return snapPoint(raw, {
      walls: opts.noWalls ? [] : lvl.walls,
      points: opts.points,
      grid: ui.snapGrid ? (opts.grid ?? p.gridStep) : 0,
      from: opts.from,
      angle: ui.snapAngle,
      tol: 10 / viewRef.current.zoom,
      excludeWalls: opts.excludeWalls,
      excludePoints: opts.excludePoints,
    });
  };

  const scopeOfKind = (def: { scope?: 'level' | 'site'; layer: LayerId } | undefined): string => (def?.scope === 'site' || def?.layer === 'landscape' ? 'site' : level.id);

  /** Точки привязки для трасс/размеров: центры объектов, углы помещений. */
  const extraPoints = (kind: 'dim' | 'route'): Vec2[] => {
    const pts: Vec2[] = [];
    if (kind === 'dim') {
      for (const r of level.rooms) pts.push(...r.polygon);
      for (const o of level.openings) {
        const w = level.walls.find((x) => x.id === o.wallId);
        if (w) {
          const g = openingGeom(o, w);
          pts.push(g.p1, g.p2);
        }
      }
    } else {
      for (const it of level.items) if (layerOfItem(it) !== 'furniture') pts.push({ x: it.x, y: it.y });
      if (project.site) for (const it of project.site.items) pts.push({ x: it.x, y: it.y });
      for (const r of level.routes) pts.push(...r.points);
    }
    return pts;
  };

  // ── действия ──
  const store = useProject.getState;
  const ui = useUi.getState;

  const addWall = (a: Vec2, b: Vec2) => {
    if (dist(a, b) < 50) return;
    const wd = ui().wallDefaults;
    store().update((d) => {
      getLevel(d, level.id)?.walls.push(createWall(a, b, { thickness: wd.thickness, material: wd.material, loadBearing: wd.loadBearing, exterior: wd.exterior }));
    });
  };

  const finishPolyTool = () => {
    const p = pvRef.current;
    const kind = ui().toolKind;
    if (!kind) return;
    if (ui().tool === 'route' && p.pts.length >= 2) {
      const def = routeDef(kind);
      const scope = scopeOfKind(def);
      const id = newId('rt');
      store().update((d) => {
        getContainer(d, scope)?.routes.push({ id, kind, points: p.pts.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })), params: { ...(def?.defaults ?? {}) } });
      });
      ui().select({ type: 'route', id, scope });
    } else if (ui().tool === 'zone' && p.pts.length >= 3) {
      const def = zoneDef(kind);
      const scope = scopeOfKind(def);
      const id = newId('zn');
      store().update((d) => {
        getContainer(d, scope)?.zones.push({ id, kind, points: p.pts.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })), params: { ...(def?.defaults ?? {}) } });
      });
      ui().select({ type: 'zone', id, scope });
    }
    setPv(emptyPreview);
  };

  // ── клавиатура инструмента ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') spaceDown.current = e.type === 'keydown';
      if (e.type !== 'keydown') return;
      const p = pvRef.current;
      const tl = ui().tool;
      if (e.key === 'Escape') {
        if (drag.current && drag.current.kind !== 'pan') {
          store().cancel();
          drag.current = null;
        }
        if (p.pts.length || p.typed) setPv({ ...emptyPreview, cur: p.cur });
        else if (tl !== 'select') ui().setTool('select');
        else ui().select(null);
        setMenu(null);
        return;
      }
      if (tl === 'wall' && p.pts.length === 1) {
        if (/^[0-9]$/.test(e.key)) {
          setPv({ ...p, typed: (p.typed + e.key).slice(0, 6) });
          e.preventDefault();
        } else if (e.key === 'Backspace') {
          setPv({ ...p, typed: p.typed.slice(0, -1) });
          e.preventDefault();
        } else if (e.key === 'Enter') {
          if (p.typed && p.cur) {
            const start = p.pts[0];
            const dir = norm(sub(p.cur, start));
            if (dir.x !== 0 || dir.y !== 0) {
              const end = { x: Math.round(start.x + dir.x * Number(p.typed)), y: Math.round(start.y + dir.y * Number(p.typed)) };
              addWall(start, end);
              setPv({ ...emptyPreview, pts: [end], cur: end });
            }
          } else setPv(emptyPreview);
          e.preventDefault();
        }
      } else if ((tl === 'route' || tl === 'zone') && e.key === 'Enter') {
        finishPolyTool();
      } else if ((tl === 'route' || tl === 'zone') && e.key === 'Backspace' && p.pts.length) {
        setPv({ ...p, pts: p.pts.slice(0, -1) });
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const hitSel = (target: EventTarget | null): Sel | null => {
    const el = (target as Element | null)?.closest?.('[data-t]') as HTMLElement | SVGElement | null;
    if (!el) return null;
    const ds = (el as HTMLElement).dataset;
    return { type: ds.t as Sel['type'], id: ds.id ?? '', scope: ds.scope ?? level.id };
  };

  const itemGhost = (raw: Vec2, kind: string): Item => {
    const def = itemDef(kind);
    const scope = scopeOfKind(def);
    const it = makeItem(kind, raw, pvRef.current.ghost?.rot ?? 0, level, ui().toolParams);
    const s = itemSize(it);
    const g = ui().snapGrid ? 50 : 1;
    it.x = Math.round(raw.x / g) * g;
    it.y = Math.round(raw.y / g) * g;
    if (scope !== 'site' && (def?.mount === 'wall' || !def)) {
      const sn = snapItemToWalls(raw, s.w, s.d, it.rot, level.walls, 250);
      if (sn.snapped) Object.assign(it, { x: sn.x, y: sn.y, rot: sn.rot });
    } else if (scope !== 'site' && def && def.layer !== 'furniture' && def.mount !== 'ceiling') {
      // инженерные точки липнут к грани стены
      const nw = nearestWall(raw, level.walls, 200);
      if (nw && nw.t > 0 && nw.t < 1 && nw.dist > 1) {
        const u = norm(sub(raw, nw.point));
        const c = add(nw.point, mul(u, nw.wall.thickness / 2));
        Object.assign(it, { x: Math.round(c.x), y: Math.round(c.y), rot: (Math.round(angleDeg(u) - 90) + 360) % 360 });
      }
    }
    return it;
  };

  // ── указатель ──
  const onPointerDown = (e: React.PointerEvent) => {
    setMenu(null);
    const world = toWorld(e);
    const svg = svgRef.current!;
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      svg.setPointerCapture(e.pointerId);
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx0: view.cx, cy0: view.cy, moved: false, deselect: false };
      return;
    }
    if (e.button !== 0) return;
    const tl = ui().tool;
    const p = pvRef.current;

    if (tl === 'select') {
      const hEl = (e.target as Element).closest('[data-h]') as SVGElement | null;
      if (hEl && selection) {
        const h = hEl.dataset.h!;
        const i = Number(hEl.dataset.i ?? 0);
        svg.setPointerCapture(e.pointerId);
        drag.current = { kind: 'handle', sel: selection, h, i, start: world, orig: { x: Number(hEl.dataset.x), y: Number(hEl.dataset.y) }, moved: false };
        store().begin();
        return;
      }
      const sel = hitSel(e.target);
      svg.setPointerCapture(e.pointerId);
      if (sel) {
        ui().select(sel);
        if (sel.type !== 'room' && sel.type !== 'site') {
          drag.current = { kind: 'move', sel, start: world, moved: false };
          store().begin();
        } else drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx0: view.cx, cy0: view.cy, moved: false, deselect: false };
      } else {
        drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx0: view.cx, cy0: view.cy, moved: false, deselect: true };
      }
      return;
    }

    if (tl === 'wall') {
      const sn = snap(world, { from: p.pts[0] ?? null });
      const pt = { x: Math.round(sn.point.x), y: Math.round(sn.point.y) };
      if (p.pts.length === 0) setPv({ ...emptyPreview, pts: [pt], cur: pt });
      else {
        addWall(p.pts[0], pt);
        // замыкание на существующий узел завершает цепочку
        const closes = level.walls.some((w) => eq(w.a, pt, 1) || eq(w.b, pt, 1));
        setPv(closes && sn.kind === 'node' ? emptyPreview : { ...emptyPreview, pts: [pt], cur: pt });
      }
      return;
    }

    if (tl === 'room') {
      const sn = snap(world);
      const pt = { x: Math.round(sn.point.x), y: Math.round(sn.point.y) };
      if (p.pts.length === 0) setPv({ ...emptyPreview, pts: [pt], cur: pt });
      else {
        const a = p.pts[0];
        if (Math.abs(a.x - pt.x) > 300 && Math.abs(a.y - pt.y) > 300) {
          const wd = ui().wallDefaults;
          const c = [a, { x: pt.x, y: a.y }, pt, { x: a.x, y: pt.y }];
          store().update((d) => {
            const l = getLevel(d, level.id);
            for (let i = 0; i < 4; i++) l?.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: wd.thickness, material: wd.material, loadBearing: wd.loadBearing, exterior: wd.exterior }));
          });
        }
        setPv(emptyPreview);
      }
      return;
    }

    if (tl === 'door' || tl === 'window' || tl === 'portal') {
      if (p.opening) {
        const o = { ...p.opening, id: newId('o') };
        store().update((d) => {
          getLevel(d, level.id)?.openings.push(o);
        });
        ui().select({ type: 'opening', id: o.id, scope: level.id });
      }
      return;
    }

    if (tl === 'dim') {
      const sn = snap(world, { points: extraPoints('dim'), grid: 10 });
      if (p.pts.length < 2) setPv({ ...p, pts: [...p.pts, sn.point], cur: sn.point });
      else {
        const [a, b] = p.pts;
        const n = perp(norm(sub(b, a)));
        const offset = Math.round(dot(sub(world, a), n));
        store().update((d) => {
          getLevel(d, level.id)?.dims.push({ id: newId('dm'), a, b, offset });
        });
        setPv(emptyPreview);
      }
      return;
    }

    if (tl === 'item' && toolKind) {
      const it = p.ghost ?? itemGhost(world, toolKind);
      const scope = scopeOfKind(itemDef(toolKind));
      const placed = { ...it, id: newId('it') };
      store().update((d) => {
        getContainer(d, scope)?.items.push(placed);
      });
      ui().select({ type: 'item', id: placed.id, scope });
      if (!e.shiftKey) ui().setTool('select');
      return;
    }

    if (tl === 'route' || tl === 'zone') {
      const isSite = scopeOfKind(tl === 'route' ? routeDef(toolKind ?? '') : zoneDef(toolKind ?? '')) === 'site';
      const sn = snap(world, { from: p.pts[p.pts.length - 1] ?? null, points: extraPoints('route'), grid: 50, noWalls: isSite });
      const pt = sn.point;
      if (tl === 'zone' && p.pts.length >= 3 && dist(pt, p.pts[0]) < 12 / view.zoom) {
        finishPolyTool();
        return;
      }
      if (p.pts.length && dist(pt, p.pts[p.pts.length - 1]) < 1) return;
      setPv({ ...p, pts: [...p.pts, pt], cur: pt });
      return;
    }

    if (tl === 'calibrate') {
      if (p.pts.length === 0) setPv({ ...emptyPreview, pts: [world], cur: world });
      else if (dist(p.pts[0], world) > 1) {
        setCalibValue(String(Math.round(dist(p.pts[0], world))));
        setPv({ ...emptyPreview, pts: [p.pts[0], world], calibAsk: { a: p.pts[0], b: world } });
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = toWorld(e);
    const dg = drag.current;
    if (dg) {
      if (dg.kind === 'pan') {
        const dx = e.clientX - dg.sx;
        const dy = e.clientY - dg.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) dg.moved = true;
        if (dg.moved) setView((v) => ({ ...v, cx: dg.cx0 - dx / v.zoom, cy: dg.cy0 - dy / v.zoom }));
        return;
      }
      const delta = sub(world, dg.start);
      if (!dg.moved && Math.hypot(delta.x, delta.y) * view.zoom < 4) return;
      dg.moved = true;
      if (dg.kind === 'move') applyMove(dg.sel, world, delta, e);
      else applyHandle(dg, world, e);
      return;
    }
    const tl = ui().tool;
    const p = pvRef.current;
    if (tl === 'wall' || tl === 'room') {
      const sn = snap(world, { from: tl === 'wall' ? (p.pts[0] ?? null) : null });
      setPv({ ...p, cur: sn.point, snap: sn });
    } else if (tl === 'door' || tl === 'window' || tl === 'portal') {
      const nw = nearestWall(world, level.walls, 500);
      if (nw) {
        const o = createOpening(nw.wall.id, tl, 0, tl === 'door' ? { width: 800 } : {});
        const L = wallLength(nw.wall);
        if (L < o.width + 100) o.width = Math.max(300, L - 200);
        o.pos = clampOpeningPos(Math.round((nw.t * L) / 10) * 10, o.width, nw.wall);
        const side = dot(sub(world, nw.point), perp(wallDir(nw.wall)));
        o.swing = side >= 0 ? 'L' : 'R';
        o.hinge = nw.t * L < o.pos ? 'a' : 'b';
        o.id = 'preview';
        setPv({ ...p, opening: o, cur: world });
      } else setPv({ ...p, opening: null, cur: world });
    } else if (tl === 'dim') {
      const sn = snap(world, { points: extraPoints('dim'), grid: 10 });
      setPv({ ...p, cur: p.pts.length === 2 ? world : sn.point, snap: p.pts.length === 2 ? null : sn });
    } else if (tl === 'item' && toolKind) {
      setPv({ ...p, ghost: itemGhost(world, toolKind), cur: world });
    } else if (tl === 'route' || tl === 'zone') {
      const isSite = scopeOfKind(tl === 'route' ? routeDef(toolKind ?? '') : zoneDef(toolKind ?? '')) === 'site';
      const sn = snap(world, { from: p.pts[p.pts.length - 1] ?? null, points: extraPoints('route'), grid: 50, noWalls: isSite });
      setPv({ ...p, cur: sn.point, snap: sn });
    } else if (tl === 'calibrate' && !p.calibAsk) {
      setPv({ ...p, cur: world });
    }
    ui().set({ cursor: world });
  };

  const applyMove = (sel: Sel, world: Vec2, delta: Vec2, e: React.PointerEvent) => {
    const base = store().txBase;
    if (!base) return;
    const grid = ui().snapGrid ? base.gridStep : 1;
    const rg = (x: number, g = grid) => Math.round(x / g) * g;
    if (sel.type === 'wall') {
      const w0 = getLevel(base, sel.scope)?.walls.find((w) => w.id === sel.id);
      if (!w0) return;
      let d = delta;
      if (!e.shiftKey) {
        const n = perp(wallDir(w0));
        d = mul(n, dot(delta, n));
      }
      // сетка по положению конца a
      const target = { x: rg(w0.a.x + d.x, grid / 2), y: rg(w0.a.y + d.y, grid / 2) };
      d = sub(target, w0.a);
      store().transient((dr) => {
        const l = getLevel(dr, sel.scope);
        if (l) translateWall(l, sel.id, d);
      });
    } else if (sel.type === 'opening') {
      const lv = getLevel(base, sel.scope);
      const o0 = lv?.openings.find((o) => o.id === sel.id);
      if (!lv || !o0) return;
      const nw = nearestWall(world, lv.walls, 600);
      if (!nw) return;
      const L = wallLength(nw.wall);
      const pos = clampOpeningPos(Math.round((nw.t * L) / 10) * 10, o0.width, nw.wall);
      store().transient((dr) => {
        const o = getLevel(dr, sel.scope)?.openings.find((x) => x.id === sel.id);
        if (o) {
          o.wallId = nw.wall.id;
          o.pos = pos;
        }
      });
    } else if (sel.type === 'item') {
      const c0 = getContainer(base, sel.scope)?.items.find((i) => i.id === sel.id);
      if (!c0) return;
      const def = itemDef(c0.kind);
      const s = itemSize(c0);
      let pose = { x: rg(c0.x + delta.x, grid / 2), y: rg(c0.y + delta.y, grid / 2), rot: c0.rot };
      const lv = sel.scope === 'site' ? null : getLevel(base, sel.scope);
      if (lv && !e.altKey && (def?.mount === 'wall' || !def)) {
        const sn = snapItemToWalls({ x: c0.x + delta.x, y: c0.y + delta.y }, s.w, s.d, c0.rot, lv.walls, 200);
        if (sn.snapped) pose = sn;
      } else if (lv && !e.altKey && def && def.layer !== 'furniture' && def.mount !== 'ceiling') {
        const raw = { x: c0.x + delta.x, y: c0.y + delta.y };
        const nw = nearestWall(raw, lv.walls, 200);
        if (nw && nw.t > 0 && nw.t < 1 && nw.dist > 1) {
          const u = norm(sub(raw, nw.point));
          const c = add(nw.point, mul(u, nw.wall.thickness / 2));
          pose = { x: Math.round(c.x), y: Math.round(c.y), rot: (Math.round(angleDeg(u) - 90) + 360) % 360 };
        }
      }
      store().transient((dr) => {
        const it = getContainer(dr, sel.scope)?.items.find((i) => i.id === sel.id);
        if (it) Object.assign(it, pose);
      });
    } else if (sel.type === 'route' || sel.type === 'zone') {
      const d = { x: rg(delta.x, grid / 2), y: rg(delta.y, grid / 2) };
      store().transient((dr) => {
        const c = getContainer(dr, sel.scope);
        const ent = sel.type === 'route' ? c?.routes.find((r) => r.id === sel.id) : c?.zones.find((z) => z.id === sel.id);
        if (ent) ent.points = ent.points.map((q) => add(q, d));
      });
    } else if (sel.type === 'dim') {
      const d0 = getLevel(base, sel.scope)?.dims.find((x) => x.id === sel.id);
      if (!d0) return;
      const n = perp(norm(sub(d0.b, d0.a)));
      store().transient((dr) => {
        const dm = getLevel(dr, sel.scope)?.dims.find((x) => x.id === sel.id);
        if (dm) dm.offset = Math.round(d0.offset + dot(delta, n));
      });
    }
  };

  const applyHandle = (dg: Extract<Drag, { kind: 'handle' }>, world: Vec2, e: React.PointerEvent) => {
    const base = store().txBase;
    if (!base) return;
    const sel = dg.sel;
    if (dg.h === 'wa' || dg.h === 'wb') {
      const lv = getLevel(base, sel.scope);
      const w0 = lv?.walls.find((w) => w.id === sel.id);
      if (!lv || !w0) return;
      const orig = dg.h === 'wa' ? w0.a : w0.b;
      const other = dg.h === 'wa' ? w0.b : w0.a;
      const attached = new Set(lv.walls.filter((w) => eq(w.a, orig, 1) || eq(w.b, orig, 1)).map((w) => w.id));
      const sn = snapPoint(world, {
        walls: lv.walls,
        grid: ui().snapGrid ? base.gridStep : 0,
        from: other,
        angle: ui().snapAngle && !e.shiftKey,
        tol: 10 / view.zoom,
        excludeWalls: attached,
        excludePoints: [orig],
      });
      const to = { x: Math.round(sn.point.x), y: Math.round(sn.point.y) };
      setPv({ ...emptyPreview, snap: sn, cur: to });
      store().transient((dr) => {
        const l = getLevel(dr, sel.scope);
        if (!l) return;
        if (e.altKey) {
          const w = l.walls.find((x) => x.id === sel.id);
          if (w) w[dg.h === 'wa' ? 'a' : 'b'] = to;
        } else moveNode(l, orig, to);
      });
    } else if (dg.h === 'pt') {
      const sn = snap(world, { grid: 50, noWalls: sel.scope === 'site' || sel.type === 'site', points: sel.type === 'route' ? extraPoints('route') : undefined });
      const to = { x: Math.round(sn.point.x), y: Math.round(sn.point.y) };
      store().transient((dr) => {
        if (sel.type === 'site') {
          if (dr.site) dr.site.boundary[dg.i] = to;
          return;
        }
        const c = getContainer(dr, sel.scope);
        const ent = sel.type === 'route' ? c?.routes.find((r) => r.id === sel.id) : c?.zones.find((z) => z.id === sel.id);
        if (ent) ent.points[dg.i] = to;
      });
    } else if (dg.h === 'rot') {
      const it0 = getContainer(base, sel.scope)?.items.find((i) => i.id === sel.id);
      if (!it0) return;
      let ang = angleDeg(sub(world, { x: it0.x, y: it0.y })) - 90;
      if (!e.shiftKey) ang = Math.round(ang / 15) * 15;
      const rot = ((Math.round(ang) % 360) + 360) % 360;
      store().transient((dr) => {
        const it = getContainer(dr, sel.scope)?.items.find((i) => i.id === sel.id);
        if (it) it.rot = rot;
      });
    } else if (dg.h === 'da' || dg.h === 'db') {
      const sn = snap(world, { points: extraPoints('dim'), grid: 10 });
      store().transient((dr) => {
        const dm = getLevel(dr, sel.scope)?.dims.find((x) => x.id === sel.id);
        if (dm) dm[dg.h === 'da' ? 'a' : 'b'] = sn.point;
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const dg = drag.current;
    drag.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!dg) return;
    if (dg.kind === 'pan') {
      if (!dg.moved && dg.deselect) ui().select(null);
      return;
    }
    if (dg.moved) store().commit();
    else store().cancel();
    if (pvRef.current.snap) setPv(emptyPreview);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const world = toWorld(e);
    const tl = ui().tool;
    if (tl === 'route' || tl === 'zone') {
      // двойной щелчок добавил лишнюю точку вторым нажатием — убрать и завершить
      const p = pvRef.current;
      if (p.pts.length >= 2 && dist(p.pts[p.pts.length - 1], p.pts[p.pts.length - 2]) < 20 / view.zoom) pvRef.current = { ...p, pts: p.pts.slice(0, -1) };
      finishPolyTool();
      return;
    }
    if (tl === 'wall') {
      setPv(emptyPreview);
      return;
    }
    if (tl !== 'select') return;
    const sel = hitSel(e.target);
    if (!sel) return;
    if (sel.type === 'item') {
      const it = getContainer(project, sel.scope)?.items.find((i) => i.id === sel.id);
      if (it?.kind === 'cabinet' && typeof it.params.designId === 'string') ui().setDialog('cabinet', it.params.designId);
      return;
    }
    if (sel.type === 'route' || sel.type === 'zone' || sel.type === 'site') {
      store().update((d) => {
        let pts: Vec2[] | undefined;
        let closed = false;
        if (sel.type === 'site') {
          pts = d.site?.boundary;
          closed = true;
        } else {
          const c = getContainer(d, sel.scope);
          pts = sel.type === 'route' ? c?.routes.find((r) => r.id === sel.id)?.points : c?.zones.find((z) => z.id === sel.id)?.points;
          closed = sel.type === 'zone';
        }
        if (!pts) return;
        let bi = -1;
        let bd = Infinity;
        const n = closed ? pts.length : pts.length - 1;
        for (let i = 0; i < n; i++) {
          const c = closestOnSegment(world, pts[i], pts[(i + 1) % pts.length]);
          if (c.dist < bd) {
            bd = c.dist;
            bi = i;
          }
        }
        if (bi >= 0) {
          pts.splice(bi + 1, 0, { x: Math.round(world.x), y: Math.round(world.y) });
          if (sel.type === 'site' && d.site) d.site.elevations.splice(bi + 1, 0, d.site.elevations[bi] ?? 0);
        }
      });
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const p = pvRef.current;
    if (ui().tool !== 'select') {
      if (ui().tool === 'route' || ui().tool === 'zone') finishPolyTool();
      else if (p.pts.length) setPv(emptyPreview);
      else ui().setTool('select');
      return;
    }
    const sel = hitSel(e.target);
    if (sel) ui().select(sel);
    const r = wrapRef.current!.getBoundingClientRect();
    setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, sel, world: toWorld(e) });
  };

  const menuEntries = (): MenuEntry[] => {
    if (!menu) return [];
    const sel = menu.sel;
    const del: MenuEntry = { label: t('Видалити', 'Удалить'), hint: 'Del', danger: true, run: () => sel && (store().update((d) => removeEntity(d, sel)), ui().select(null)) };
    const dup: MenuEntry = {
      label: t('Дублювати', 'Дублировать'),
      hint: 'Ctrl+D',
      run: () => {
        if (!sel) return;
        let ns: Sel | null = null;
        store().update((d) => {
          ns = duplicateEntity(d, sel);
        });
        if (ns) ui().select(ns);
      },
    };
    if (!sel) {
      return [
        { label: t('Показати все', 'Показать всё'), hint: 'Home', run: fit },
        { label: t('Стіна', 'Стена'), hint: 'W', run: () => ui().setTool('wall') },
        { label: t('Двері', 'Дверь'), hint: 'D', run: () => ui().setTool('door') },
        { label: t('Вікно', 'Окно'), hint: 'N', run: () => ui().setTool('window') },
        { label: t('Розмір', 'Размер'), hint: 'M', run: () => ui().setTool('dim') },
      ];
    }
    if (sel.type === 'wall') {
      const w = level.walls.find((x) => x.id === sel.id);
      return [
        { label: t('Розділити стіну тут', 'Разделить стену здесь'), run: () => store().update((d) => void splitWall(getLevel(d, sel.scope)!, sel.id, menu.world)) },
        { label: t('Розвернути напрямок', 'Развернуть направление'), run: () => store().update((d) => flipWall(getLevel(d, sel.scope)!, sel.id)) },
        {
          label: w?.loadBearing ? t('Зробити перегородкою', 'Сделать перегородкой') : t('Зробити несучою', 'Сделать несущей'),
          run: () =>
            store().update((d) => {
              const x = getLevel(d, sel.scope)?.walls.find((q) => q.id === sel.id);
              if (x) x.loadBearing = !x.loadBearing;
            }),
        },
        dup,
        del,
      ];
    }
    if (sel.type === 'opening') {
      const mut = (fn: (o: Opening) => void) => () =>
        store().update((d) => {
          const o = getLevel(d, sel.scope)?.openings.find((q) => q.id === sel.id);
          if (o) fn(o);
        });
      return [
        { label: t('Змінити бік петель', 'Сменить сторону петель'), run: mut((o) => (o.hinge = o.hinge === 'a' ? 'b' : 'a')) },
        { label: t('Відкривати в інший бік', 'Открывать в другую сторону'), run: mut((o) => (o.swing = o.swing === 'L' ? 'R' : 'L')) },
        dup,
        del,
      ];
    }
    if (sel.type === 'item') {
      const it = getContainer(project, sel.scope)?.items.find((i) => i.id === sel.id);
      const rot = (a: number) => () =>
        store().update((d) => {
          const x = getContainer(d, sel.scope)?.items.find((i) => i.id === sel.id);
          if (x) x.rot = (x.rot + a + 360) % 360;
        });
      const entries: MenuEntry[] = [
        { label: t('Повернути на 90°', 'Повернуть на 90°'), hint: 'E', run: rot(90) },
        { label: t('Повернути на −90°', 'Повернуть на −90°'), hint: 'Q', run: rot(-90) },
      ];
      if (it?.kind === 'cabinet') entries.push({ label: t('Відкрити в конструкторі', 'Открыть в конструкторе'), run: () => ui().setDialog('cabinet', String(it.params.designId)) });
      return [...entries, dup, del];
    }
    if (sel.type === 'route' || sel.type === 'zone') {
      return [{ label: t('Додати вершину (подвійний клік по лінії)', 'Добавить вершину (двойной клик по линии)'), run: () => undefined }, dup, del];
    }
    if (sel.type === 'dim') return [del];
    return [];
  };

  // ── отрисовка ──
  const vb = `${view.cx - size.w / 2 / view.zoom} ${view.cy - size.h / 2 / view.zoom} ${size.w / view.zoom} ${size.h / view.zoom}`;
  const vis = (l: LayerId) => layers[l].visible;
  const locked = (l: LayerId) => layers[l].locked || tool !== 'select';
  const hr = 5 / view.zoom;
  const groupColors = useMemo(() => new Map(project.electrical.groups.map((g) => [g.id, g.color])), [project.electrical.groups]);

  const scopes: { scope: string; items: Item[]; routes: Route[]; zones: Zone[] }[] = [];
  if (project.site) scopes.push({ scope: 'site', ...project.site });
  scopes.push({ scope: level.id, items: level.items, routes: level.routes, zones: level.zones });

  const shadowPrims = useMemo(
    () => (project.site && project.sun.enabled && vis('landscape') ? siteShadowPrims(project) : []),
    [project.site, project.sun, project.levels, layers.landscape.visible], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selOverlay = (): React.ReactNode => {
    if (!selection) return null;
    const sw = 2 / view.zoom;
    const handle = (p: Vec2, h: string, i = 0) => (
      <circle key={`${h}${i}`} data-h={h} data-i={i} data-x={p.x} data-y={p.y} cx={p.x} cy={p.y} r={hr} fill="#fff" stroke={COL.select} strokeWidth={sw} style={{ cursor: 'crosshair' }} />
    );
    if (selection.type === 'wall') {
      const w = level.walls.find((x) => x.id === selection.id);
      if (!w) return null;
      const pg = wallPolygon(w, level.walls);
      const n = perp(wallDir(w));
      const off = w.thickness / 2 + 4 * k;
      return (
        <g>
          <polygon points={pg.map((q) => `${q.x},${q.y}`).join(' ')} fill={COL.select} fillOpacity={0.25} stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
          <g style={{ pointerEvents: 'none' }}>
            <Prims prims={dimPrims(w.a, w.b, dot(n, { x: 0, y: -1 }) >= 0 ? off : -off, k, undefined, COL.select)} k={k} />
          </g>
          {handle(w.a, 'wa')}
          {handle(w.b, 'wb')}
        </g>
      );
    }
    if (selection.type === 'opening') {
      const o = level.openings.find((x) => x.id === selection.id);
      const w = o && level.walls.find((x) => x.id === o.wallId);
      if (!o || !w) return null;
      const g = openingGeom(o, w);
      const off = (o.swing === 'L' ? -1 : 1) * (w.thickness / 2 + 4 * k);
      return (
        <g style={{ pointerEvents: 'none' }}>
          <polygon points={g.quad.map((q) => `${q.x},${q.y}`).join(' ')} fill={COL.select} fillOpacity={0.3} stroke={COL.select} strokeWidth={sw} />
          <Prims prims={[...dimPrims(w.a, g.p1, off, k, undefined, COL.select), ...dimPrims(g.p1, g.p2, off, k, undefined, COL.select), ...dimPrims(g.p2, w.b, off, k, undefined, COL.select)]} k={k} />
        </g>
      );
    }
    if (selection.type === 'room') {
      const r = level.rooms.find((x) => x.id === selection.id);
      if (!r) return null;
      return <polygon points={r.polygon.map((q) => `${q.x},${q.y}`).join(' ')} fill={COL.select} fillOpacity={0.12} stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} />;
    }
    if (selection.type === 'item') {
      const it = getContainer(project, selection.scope)?.items.find((i) => i.id === selection.id);
      if (!it) return null;
      const s = itemSize(it);
      const cs = rectCorners({ x: it.x, y: it.y }, Math.max(s.w, 100), Math.max(s.d, 100), it.rot);
      const rh = add({ x: it.x, y: it.y }, rotate({ x: 0, y: Math.max(s.d, 100) / 2 + 6 * k }, it.rot));
      const fr = add({ x: it.x, y: it.y }, rotate({ x: 0, y: Math.max(s.d, 100) / 2 }, it.rot));
      return (
        <g>
          <polygon points={cs.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
          <line x1={fr.x} y1={fr.y} x2={rh.x} y2={rh.y} stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
          {handle(rh, 'rot')}
        </g>
      );
    }
    if (selection.type === 'route' || selection.type === 'zone') {
      const c = getContainer(project, selection.scope);
      const ent = selection.type === 'route' ? c?.routes.find((r) => r.id === selection.id) : c?.zones.find((z) => z.id === selection.id);
      if (!ent) return null;
      return (
        <g>
          {selection.type === 'zone' ? (
            <polygon points={ent.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={COL.select} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
          ) : (
            <polyline points={ent.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={COL.select} strokeWidth={sw * 2} strokeOpacity={0.5} style={{ pointerEvents: 'none' }} />
          )}
          {ent.points.map((q, i) => handle(q, 'pt', i))}
        </g>
      );
    }
    if (selection.type === 'site' && project.site) {
      return <g>{project.site.boundary.map((q, i) => handle(q, 'pt', i))}</g>;
    }
    if (selection.type === 'dim') {
      const dm = level.dims.find((x) => x.id === selection.id);
      if (!dm) return null;
      return (
        <g>
          {handle(dm.a, 'da')}
          {handle(dm.b, 'db')}
        </g>
      );
    }
    return null;
  };

  const previewNode = (): React.ReactNode => {
    const out: React.ReactNode[] = [];
    const sw = 1.5 / view.zoom;
    if (pv.snap) {
      pv.snap.guides.forEach((g, i) => out.push(<line key={`g${i}`} x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} stroke="#22c55e" strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom}`} />));
      if (pv.snap.kind === 'node' || pv.snap.kind === 'wall') {
        const p = pv.snap.point;
        out.push(<rect key="sn" x={p.x - hr} y={p.y - hr} width={hr * 2} height={hr * 2} fill="none" stroke="#22c55e" strokeWidth={sw} />);
      }
    }
    if (tool === 'wall' && pv.cur) {
      const wd = useUi.getState().wallDefaults;
      if (pv.pts.length) {
        const a = pv.pts[0];
        let b = pv.cur;
        if (pv.typed) {
          const dir = norm(sub(pv.cur, a));
          b = add(a, mul(dir, Number(pv.typed)));
        }
        const n = mul(perp(norm(sub(b, a))), wd.thickness / 2);
        out.push(<polygon key="wp" points={[add(a, n), add(b, n), sub(b, n), sub(a, n)].map((q) => `${q.x},${q.y}`).join(' ')} fill="#60a5fa" fillOpacity={0.4} stroke="#2563eb" strokeWidth={sw} />);
        out.push(<Prims key="wd" prims={dimPrims(a, b, wd.thickness / 2 + 4 * k, k, pv.typed ? `${pv.typed}▏` : undefined, '#2563eb')} k={k} />);
      } else out.push(<circle key="wc" cx={pv.cur.x} cy={pv.cur.y} r={hr * 0.7} fill="#2563eb" />);
    }
    if (tool === 'room' && pv.pts.length && pv.cur) {
      const a = pv.pts[0];
      const b = pv.cur;
      out.push(<rect key="rr" x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="#60a5fa" fillOpacity={0.15} stroke="#2563eb" strokeWidth={sw} />);
      out.push(<Prims key="rd1" prims={[...dimPrims(a, { x: b.x, y: a.y }, -4 * k, k, undefined, '#2563eb'), ...dimPrims({ x: b.x, y: a.y }, b, -4 * k, k, undefined, '#2563eb')]} k={k} />);
    }
    if (pv.opening) {
      const w = level.walls.find((x) => x.id === pv.opening!.wallId);
      if (w) {
        const g = openingGeom(pv.opening, w);
        out.push(<polygon key="oq" points={g.quad.map((q) => `${q.x},${q.y}`).join(' ')} fill="#fff" stroke="#2563eb" strokeWidth={sw} />);
        out.push(<Prims key="op" prims={openingPrims(pv.opening, w)} k={k} />);
        const off = (pv.opening.swing === 'L' ? -1 : 1) * (w.thickness / 2 + 4 * k);
        out.push(<Prims key="od" prims={[...dimPrims(w.a, g.p1, off, k, undefined, '#2563eb'), ...dimPrims(g.p2, w.b, off, k, undefined, '#2563eb')]} k={k} />);
      }
    }
    if (tool === 'dim' && pv.cur) {
      if (pv.pts.length === 1) out.push(<Prims key="dp" prims={dimPrims(pv.pts[0], pv.cur, 0, k)} k={k} />);
      else if (pv.pts.length === 2) {
        const [a, b] = pv.pts;
        out.push(<Prims key="dp" prims={dimPrims(a, b, dot(sub(pv.cur, a), perp(norm(sub(b, a)))), k)} k={k} />);
      }
    }
    if (pv.ghost) out.push(<ItemG key="gh" item={pv.ghost} k={k} scope="" locked ghost />);
    if ((tool === 'route' || tool === 'zone') && pv.cur) {
      const pts = [...pv.pts, pv.cur];
      const color = tool === 'route' ? '#2563eb' : '#16a34a';
      out.push(
        tool === 'zone' && pts.length > 2 ? (
          <polygon key="zp" points={pts.map((q) => `${q.x},${q.y}`).join(' ')} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={sw} />
        ) : (
          <polyline key="rp" points={pts.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={color} strokeWidth={sw} />
        ),
      );
      if (pv.pts.length) out.push(<Prims key="rl" prims={dimPrims(pv.pts[pv.pts.length - 1], pv.cur, 3 * k, k, undefined, color)} k={k} />);
      pv.pts.forEach((q, i) => out.push(<circle key={`rv${i}`} cx={q.x} cy={q.y} r={hr * 0.6} fill={color} />));
    }
    if (tool === 'calibrate' && pv.pts.length) {
      const b = pv.pts[1] ?? pv.cur;
      if (b) out.push(<Prims key="cl" prims={dimPrims(pv.pts[0], b, 0, k, undefined, '#dc2626')} k={k} />);
    }
    return <g style={{ pointerEvents: 'none' }}>{out}</g>;
  };

  const applyCalibration = () => {
    const ask = pv.calibAsk;
    const real = Number(calibValue.replace(',', '.'));
    if (!ask || !(real > 0)) return;
    const measured = dist(ask.a, ask.b);
    const f = real / measured;
    store().update((d) => {
      const u = getLevel(d, level.id)?.underlay;
      if (!u) return;
      u.x = ask.a.x - (ask.a.x - u.x) * f;
      u.y = ask.a.y - (ask.a.y - u.y) * f;
      u.scale *= f;
    });
    setPv(emptyPreview);
    ui().setTool('select');
    ui().notify(t('Масштаб підкладки відкалібровано', 'Масштаб подложки откалиброван'));
  };

  const roomAtCursor = useUi((s) => s.cursor);
  const hoverRoom = tool === 'select' && roomAtCursor ? level.rooms.find((r) => pointInPolygon(roomAtCursor, r.polygon)) : null;

  return (
    <div ref={wrapRef} className="editor2d" onContextMenu={onContextMenu}>
      <svg
        ref={svgRef}
        viewBox={vb}
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair', touchAction: 'none', display: 'block', background: '#fbfcfd' }}
      >
        <Grid view={view} w={size.w} h={size.h} />
        {level.underlay && level.underlay.visible && vis('underlay') && (
          <image
            href={level.underlay.dataUrl}
            x={level.underlay.x}
            y={level.underlay.y}
            width={level.underlay.pxW * level.underlay.scale}
            height={level.underlay.pxH * level.underlay.scale}
            opacity={level.underlay.opacity}
            preserveAspectRatio="none"
            style={{ pointerEvents: 'none' }}
          />
        )}
        {project.site && vis('landscape') && (
          <g data-t="site" data-id="site" data-scope="site" style={{ pointerEvents: locked('landscape') ? 'none' : 'stroke' }}>
            <Prims prims={sitePrims(project.site, k)} k={k} />
          </g>
        )}
        {shadowPrims.length > 0 && (
          <g style={{ pointerEvents: 'none' }}>
            <Prims prims={shadowPrims} k={k} />
          </g>
        )}
        {vis('rooms') && (
          <g style={{ pointerEvents: 'none' }}>
            {level.rooms.map((r) => (
              <polygon key={r.id} points={r.polygon.map((q) => `${q.x},${q.y}`).join(' ')} fill={project.finishes.find((f) => f.id === r.floorFinish)?.color ?? '#e5e7eb'} fillOpacity={hoverRoom?.id === r.id ? 0.42 : 0.3} />
            ))}
          </g>
        )}
        {scopes.map((sc) => (
          <g key={`z${sc.scope}`}>
            {sc.zones.filter((z) => vis(layerOfZone(z))).map((z) => (
              <ZoneG key={z.id} zone={z} k={k} scope={sc.scope} locked={locked(layerOfZone(z))} label={ls(zoneDef(z.kind)?.name)} />
            ))}
          </g>
        ))}
        {project.site && vis('landscape') && (
          <g>
            {project.site.routes.map((r) => (
              <RouteG key={r.id} route={r} k={k} scope="site" locked={locked('landscape')} />
            ))}
          </g>
        )}
        {below && vis('walls') && <WallsLayer walls={below.walls} openings={below.openings} k={k} ghost />}
        {vis('walls') && <WallsLayer walls={level.walls} openings={level.openings} k={k} />}
        {vis('walls') && (
          <g>
            {level.walls.map((w) => (
              <polygon
                key={w.id}
                data-t="wall"
                data-id={w.id}
                data-scope={level.id}
                points={wallPolygon(w, level.walls).map((q) => `${q.x},${q.y}`).join(' ')}
                fill="#000"
                fillOpacity={0.001}
                style={{ pointerEvents: locked('walls') ? 'none' : undefined, cursor: 'move' }}
              />
            ))}
            {level.openings.map((o) => {
              const w = level.walls.find((x) => x.id === o.wallId);
              return w ? <OpeningG key={o.id} o={o} wall={w} k={k} scope={level.id} locked={locked('walls')} /> : null;
            })}
          </g>
        )}
        {scopes.map((sc) => (
          <g key={`i${sc.scope}`}>
            {[...sc.items]
              .filter((it) => vis(layerOfItem(it)))
              .sort((a, b) => (layerOfItem(a) === 'furniture' ? 0 : 1) - (layerOfItem(b) === 'furniture' ? 0 : 1) || a.z - b.z)
              .map((it) => (
                <ItemG key={it.id} item={it} k={k} scope={sc.scope} locked={locked(layerOfItem(it))} />
              ))}
          </g>
        ))}
        <g>
          {level.routes.filter((r) => vis(layerOfRoute(r))).map((r) => (
            <RouteG key={r.id} route={r} k={k} scope={level.id} locked={locked(layerOfRoute(r))} color={typeof r.params.group === 'string' ? groupColors.get(r.params.group) : undefined} />
          ))}
        </g>
        {vis('rooms') && (
          <g>
            {level.rooms.map((r) => (
              <g key={r.id} data-t="room" data-id={r.id} data-scope={level.id} style={{ cursor: 'pointer', pointerEvents: tool === 'select' ? undefined : 'none' }}>
                <rect x={r.seed.x - 14 * k} y={r.seed.y - 4 * k} width={28 * k} height={9.5 * k} fill="#fff" fillOpacity={0.01} />
                <Prims prims={roomLabelPrims(r, k)} k={k} />
              </g>
            ))}
          </g>
        )}
        {vis('dimensions') && (
          <g>
            {autoDims && (
              <g style={{ pointerEvents: 'none' }}>
                <Prims prims={autoDimPrims(level, k)} k={k} />
              </g>
            )}
            {level.dims.map((dm) => (
              <g key={dm.id} data-t="dim" data-id={dm.id} data-scope={level.id} style={{ pointerEvents: locked('dimensions') ? 'none' : undefined, cursor: 'move' }}>
                <Prims prims={dimEntityPrims(dm, k)} k={k} />
              </g>
            ))}
          </g>
        )}
        {project.site && vis('landscape') && (
          <g style={{ pointerEvents: 'none' }}>
            <Prims prims={northArrowPrims(view.cx + size.w / 2 / view.zoom - 12 * k, view.cy - size.h / 2 / view.zoom + 14 * k, project.site.north, k)} k={k} />
          </g>
        )}
        {selOverlay()}
        {previewNode()}
      </svg>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries()} onClose={() => setMenu(null)} />}
      {pv.calibAsk && (
        <div className="float-card">
          <b>{t('Калібрування підкладки', 'Калибровка подложки')}</b>
          <div>{t('Введіть реальну відстань між двома точками, мм:', 'Введите реальное расстояние между двумя точками, мм:')}</div>
          <div className="row">
            <input autoFocus value={calibValue} onChange={(e) => setCalibValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyCalibration()} />
            <button className="primary" onClick={applyCalibration}>
              OK
            </button>
            <button onClick={() => setPv(emptyPreview)}>{t('Скасувати', 'Отмена')}</button>
          </div>
        </div>
      )}
      <div className="statusbar">
        <span>
          X {roomAtCursor ? Math.round(roomAtCursor.x) : '—'} · Y {roomAtCursor ? Math.round(roomAtCursor.y) : '—'} {t('мм', 'мм')}
        </span>
        {hoverRoom && (
          <span>
            {hoverRoom.name}: {hoverRoom.area.toFixed(2).replace('.', ',')} м²
          </span>
        )}
        {tool === 'wall' && pv.pts.length === 1 && <span className="accent">{pv.typed ? `${t('Довжина', 'Длина')}: ${pv.typed} мм ⏎` : t('Введіть довжину цифрами та натисніть Enter', 'Введите длину цифрами и нажмите Enter')}</span>}
        <span className="grow" />
        <span>1:{Math.round(k)}</span>
        <button className="link" onClick={fit}>
          {t('Показати все', 'Показать всё')}
        </button>
      </div>
    </div>
  );
}
