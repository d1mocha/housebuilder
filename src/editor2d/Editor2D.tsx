// SVG-редактор плана: вьюпорт, режимы и слои, инструменты, мультивыделение, привязки и индикаторы геометрии.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { siteShadowPrims } from '../calc/shadow2d';
import { itemDef, routeDef, zoneDef } from '../catalog/registry';
import { Prims } from '../draw2d/Svg';
import { autoDimPrims, demolishedPrims, dimEntityPrims, itemSize, northArrowPrims, roomLabelPrims, sitePrims } from '../draw2d/plan';
import { useT } from '../i18n';
import { createOpening, createWall, defaultWallStatus } from '../model/defaults';
import { add, angleDeg, closestOnSegment, dist, dot, eq, mid, mul, norm, perp, pointInPolygon, sub } from '../model/geometry';
import { newId } from '../model/ids';
import { flipWall, getContainer, getLevel, itemBox, makeItem, moveEntities, moveNode, sameSel, selsInRect, splitWall, translateWall } from '../model/ops';
import { segRelations } from '../model/relations';
import type { Item, LayerId, Level, Opening, Route, Sel, Vec2, Wall, Zone } from '../model/types';
import { baseWallId, geomOf, locateOnWall, openingGeom, wallDir, wallFacingRot, wallLen } from '../model/walls';
import { deleteSelection, duplicateSelection, selectWithMode } from '../store/actions';
import { useProject } from '../store/projectStore';
import { MODE_LAYERS, useUi } from '../store/uiStore';
import { alignSnap } from './align';
import { ContextMenu } from './ContextMenu';
import type { MenuEntry } from './ContextMenu';
import { snapItemToWalls } from './itemSnap';
import { poseNewItem } from './place';
import { Grid, ItemG, OpeningG, PX_PER_PAPER_MM, RouteG, WallsLayer, ZoneG, clampPos, contentBBox, layerOfItem, layerOfRoute, layerOfZone, ptsAttr, wallHitPolys } from './layers';
import type { View } from './layers';
import { SelOverlay, ToolPreview, emptyPreview } from './overlays';
import type { Preview } from './overlays';
import { snapPoint } from './snapping';
import type { SnapResult } from './snapping';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx0: number; cy0: number; moved: boolean }
  | { kind: 'marquee'; start: Vec2; additive: boolean; moved: boolean }
  | { kind: 'move'; sels: Sel[]; start: Vec2; moved: boolean; cycle: Sel | null }
  | { kind: 'handle'; sel: Sel; h: string; i: number; start: Vec2; orig: Vec2; moved: boolean };

export function Editor2D() {
  const { t, ls } = useT();
  const project = useProject((s) => s.project);
  const tool = useUi((s) => s.tool);
  const toolKind = useUi((s) => s.toolKind);
  const multi = useUi((s) => s.multi);
  const mode = useUi((s) => s.mode);
  const activeLevelId = useUi((s) => s.activeLevelId);
  const layers = useUi((s) => s.layers);
  const autoDims = useUi((s) => s.autoDims);
  const focus = useUi((s) => s.focus);
  const cursor = useUi((s) => s.cursor);
  const wallThickness = useUi((s) => s.wallDefaults.thickness);
  const level = project.levels.find((l) => l.id === activeLevelId) ?? project.levels[0];
  const levelIdx = project.levels.indexOf(level);
  const below = levelIdx > 0 ? project.levels[levelIdx - 1] : null;
  const geom = useMemo(() => geomOf(level), [level.walls, level.openings]); // eslint-disable-line react-hooks/exhaustive-deps
  const belowGeom = useMemo(() => (below ? geomOf(below) : null), [below?.walls, below?.openings]); // eslint-disable-line react-hooks/exhaustive-deps
  const hitPolys = useMemo(() => wallHitPolys(level), [level.walls, level.openings]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const lastClick = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; sel: Sel | null; world: Vec2 } | null>(null);
  const [calibValue, setCalibValue] = useState('');

  const k = PX_PER_PAPER_MM / view.zoom;
  const store = useProject.getState;
  const ui = useUi.getState;

  // ── размеры окна и авто-вписывание ──
  const [measured, setMeasured] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setSize({ w: Math.max(100, el.clientWidth), h: Math.max(100, el.clientHeight) });
      setMeasured(true);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const p = useProject.getState().project;
    const lvl = p.levels.find((l) => l.id === useUi.getState().activeLevelId) ?? p.levels[0];
    const bb = contentBBox(p, lvl);
    const { w, h } = sizeRef.current;
    const zoom = Math.min((w - 80) / Math.max(1000, bb.maxX - bb.minX), (h - 110) / Math.max(1000, bb.maxY - bb.minY));
    setView({ cx: (bb.minX + bb.maxX) / 2, cy: (bb.minY + bb.maxY) / 2, zoom: Math.max(0.004, Math.min(1.5, zoom)) });
  }, []);

  // Пока пользователь сам не менял вид, план автоматически вписывается (в т. ч. после первого измерения окна).
  const autoFit = useRef(true);
  useEffect(() => {
    autoFit.current = true;
  }, [project.id, level?.id]);
  useEffect(() => {
    if (measured && autoFit.current) fit();
  }, [project.id, level?.id, size.w, size.h, measured, fit]);
  useEffect(() => {
    if (focus) {
      autoFit.current = false;
      setView((v) => ({ ...v, cx: focus.point.x, cy: focus.point.y, zoom: Math.max(v.zoom, 0.1) }));
    }
  }, [focus]);
  useEffect(() => {
    const onFit = () => {
      autoFit.current = true;
      fit();
    };
    window.addEventListener('hb-fit', onFit);
    return () => window.removeEventListener('hb-fit', onFit);
  }, [fit]);

  // сброс предпросмотра при смене инструмента или режима
  useEffect(() => {
    setPv(emptyPreview);
  }, [tool, toolKind, activeLevelId, mode]);

  const toWorld = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - r.width / 2) / v.zoom + v.cx, y: (e.clientY - r.top - r.height / 2) / v.zoom + v.cy };
  };

  // ── колесо: мышь — масштаб к курсору; тачпад двумя пальцами — панорама, щипок — масштаб ──
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoFit.current = false;
      const v = viewRef.current;
      const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && (e.deltaX !== 0 || (Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY)));
      if (trackpadPan) {
        setView({ ...v, cx: v.cx + e.deltaX / v.zoom, cy: v.cy + e.deltaY / v.zoom });
        return;
      }
      const r = el.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
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
  const curLevel = (): Level => {
    const p = store().project;
    return p.levels.find((l) => l.id === ui().activeLevelId) ?? p.levels[0];
  };
  const snap = (raw: Vec2, opts: { from?: Vec2 | null; points?: Vec2[]; grid?: number; noWalls?: boolean } = {}): SnapResult => {
    const p = store().project;
    return snapPoint(raw, {
      walls: opts.noWalls ? [] : geomOf(curLevel()).walls,
      points: opts.points,
      grid: ui().snapGrid ? (opts.grid ?? p.gridStep) : 0,
      from: opts.from,
      angle: ui().snapAngle,
      tol: 10 / viewRef.current.zoom,
    });
  };

  const scopeOfKind = (def: { scope?: 'level' | 'site'; layer: LayerId } | undefined): string => (def?.scope === 'site' || def?.layer === 'landscape' ? 'site' : level.id);

  /** Точки привязки для трасс/размеров: центры объектов, углы помещений, края проёмов. */
  const extraPoints = (kind: 'dim' | 'route'): Vec2[] => {
    const pts: Vec2[] = [];
    if (kind === 'dim') {
      for (const r of level.rooms) pts.push(...r.polygon);
      for (const o of geom.openings) {
        const w = geom.walls.find((x) => x.id === o.wallId);
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

  /** Отношения отрезка к стенам (кроме исключённых) — для индикаторов 90°/∥. */
  const relOf = (a: Vec2, b: Vec2, exclude: Set<string> = new Set()) => segRelations(a, b, geomOf(curLevel()).walls.filter((w) => !exclude.has(baseWallId(w.id))));

  // ── действия ──
  const wallOpts = () => {
    const wd = ui().wallDefaults;
    return { thickness: wd.thickness, material: wd.material, loadBearing: wd.loadBearing, exterior: wd.exterior, status: defaultWallStatus(store().project) };
  };
  const addWall = (a: Vec2, b: Vec2, arc?: number) => {
    if (dist(a, b) < 50) return;
    const w = createWall(a, b, { ...wallOpts(), ...(arc ? { arc } : {}) });
    store().update((d) => {
      getLevel(d, level.id)?.walls.push(w);
    });
  };

  const finishPolyTool = () => {
    const p = pvRef.current;
    const kind = ui().toolKind;
    if (!kind) return;
    const pts = p.pts.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
    if (ui().tool === 'route' && pts.length >= 2) {
      const def = routeDef(kind);
      const scope = scopeOfKind(def);
      const id = newId('rt');
      store().update((d) => {
        getContainer(d, scope)?.routes.push({ id, kind, points: pts, params: { ...(def?.defaults ?? {}) } });
      });
      ui().setTool('select');
      selectWithMode({ type: 'route', id, scope });
    } else if (ui().tool === 'zone' && pts.length >= 3) {
      const def = zoneDef(kind);
      const scope = scopeOfKind(def);
      const id = newId('zn');
      store().update((d) => {
        getContainer(d, scope)?.zones.push({ id, kind, points: pts, params: { ...(def?.defaults ?? {}) } });
      });
      ui().setTool('select');
      selectWithMode({ type: 'zone', id, scope });
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
          setMarquee(null);
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

  /** Все объекты под точкой экрана, сверху вниз, без повторов (перебор; dblclick при захвате указателя). */
  const hitsAt = (clientX: number, clientY: number): Sel[] => {
    const out: Sel[] = [];
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      if (!svgRef.current?.contains(el)) continue;
      const g = el.closest('[data-t]') as HTMLElement | null;
      if (!g) continue;
      const sel: Sel = { type: g.dataset.t as Sel['type'], id: g.dataset.id ?? '', scope: g.dataset.scope ?? level.id };
      if (!out.some((s) => sameSel(s, sel))) out.push(sel);
    }
    // подпись помещения может накрывать стену или проём — конкретный элемент важнее помещения
    return [...out.filter((s) => s.type !== 'room'), ...out.filter((s) => s.type === 'room')];
  };

  const itemGhost = (raw: Vec2, kind: string, params = ui().toolParams): Item =>
    poseNewItem(level, kind, raw, params, { rot: pvRef.current.ghost?.rot ?? 0, grid: ui().snapGrid ? 50 : 1, site: scopeOfKind(itemDef(kind)) === 'site' });

  /** Проём под курсором (инструменты двери/окна/проёма), в т. ч. на дуговой стене. */
  const openingAt = (world: Vec2, kind: Opening['kind']): Opening | null => {
    const hit = locateOnWall(level, world, 500);
    if (!hit) return null;
    const o = createOpening(hit.wall.id, kind, 0, kind === 'door' ? { width: 800 } : {});
    const L = wallLen(hit.wall);
    if (L < o.width + 100) o.width = Math.max(300, L - 200);
    o.pos = clampPos(Math.round(hit.pos / 10) * 10, o.width, L);
    o.swing = hit.side;
    o.hinge = hit.pos < o.pos ? 'a' : 'b';
    o.id = 'preview';
    return o;
  };

  // ── указатель ──
  const onPointerDown = (e: React.PointerEvent) => {
    setMenu(null);
    const world = toWorld(e);
    const svg = svgRef.current!;
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      svg.setPointerCapture(e.pointerId);
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx0: view.cx, cy0: view.cy, moved: false };
      return;
    }
    if (e.button !== 0) return;
    const tl = ui().tool;
    const p = pvRef.current;

    if (tl === 'select') {
      const sels = ui().multi;
      const hEl = (e.target as Element).closest('[data-h]') as SVGElement | null;
      if (hEl && sels.length === 1) {
        svg.setPointerCapture(e.pointerId);
        drag.current = { kind: 'handle', sel: sels[0], h: hEl.dataset.h!, i: Number(hEl.dataset.i ?? 0), start: world, orig: { x: Number(hEl.dataset.x), y: Number(hEl.dataset.y) }, moved: false };
        store().begin();
        return;
      }
      const hits = hitsAt(e.clientX, e.clientY);
      if (!hits.length) {
        // пустое место: рамка выделения
        svg.setPointerCapture(e.pointerId);
        drag.current = { kind: 'marquee', start: world, additive: e.shiftKey, moved: false };
        return;
      }
      if (e.shiftKey) {
        // Shift+клик: добавить объект в выделение или убрать из него
        ui().toggleSelect(hits[0]);
        lastClick.current = null;
        return;
      }
      svg.setPointerCapture(e.pointerId);
      const startMove = (list: Sel[], cycle: Sel | null) => {
        drag.current = { kind: 'move', sels: list, start: world, moved: false, cycle };
        store().begin();
      };
      if (e.altKey && hits.length > 1) {
        // Alt+клик: следующий объект под курсором
        const idx = hits.findIndex((h) => sameSel(h, ui().selection));
        const next = hits[(idx + 1) % hits.length];
        ui().select(next);
        startMove([next], null);
        return;
      }
      const inSel = hits.find((h) => sels.some((m) => sameSel(m, h)));
      if (inSel) {
        // повторный клик в ту же точку — перебор объектов под курсором (при отпускании без сдвига)
        let cycle: Sel | null = null;
        const lc = lastClick.current;
        if (sels.length === 1 && hits.length > 1 && lc && Math.hypot(lc.x - e.clientX, lc.y - e.clientY) < 5) {
          const idx = hits.findIndex((h) => sameSel(h, sels[0]));
          cycle = hits[(idx + 1) % hits.length];
        }
        startMove(sels, cycle);
      } else {
        ui().select(hits[0]);
        startMove([hits[0]], null);
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

    if (tl === 'arc') {
      // дуговая стена: начало, конец, затем точка выгиба
      if (p.pts.length < 2) {
        const sn = snap(world, { from: p.pts[0] ?? null });
        const pt = { x: Math.round(sn.point.x), y: Math.round(sn.point.y) };
        if (p.pts.length === 1 && dist(p.pts[0], pt) < 50) return;
        setPv({ ...emptyPreview, pts: [...p.pts, pt], cur: pt });
      } else {
        const [a, b] = p.pts;
        const s = Math.round(dot(sub(world, mid(a, b)), perp(norm(sub(b, a)))) / 10) * 10;
        addWall(a, b, Math.abs(s) >= 40 ? s : undefined);
        setPv(emptyPreview);
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
          const c = [a, { x: pt.x, y: a.y }, pt, { x: a.x, y: pt.y }];
          const opts = wallOpts();
          store().update((d) => {
            const l = getLevel(d, level.id);
            for (let i = 0; i < 4; i++) l?.walls.push(createWall(c[i], c[(i + 1) % 4], opts));
          });
        }
        setPv(emptyPreview);
      }
      return;
    }

    if (tl === 'door' || tl === 'window' || tl === 'portal') {
      const o0 = p.opening ?? openingAt(world, tl);
      if (o0) {
        const o = { ...o0, id: newId('o') };
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

    if (tl === 'measure') {
      // рулетка: две точки; следующий клик начинает новый замер
      const sn = snap(world, { points: extraPoints('dim'), grid: 10 });
      setPv({ ...emptyPreview, pts: p.pts.length === 1 ? [p.pts[0], sn.point] : [sn.point], cur: sn.point });
      return;
    }

    if (tl === 'item' && toolKind) {
      const it = p.ghost ?? itemGhost(world, toolKind);
      const scope = scopeOfKind(itemDef(toolKind));
      const placed = { ...it, id: newId('it') };
      store().update((d) => {
        getContainer(d, scope)?.items.push(placed);
      });
      if (!e.shiftKey) {
        ui().setTool('select');
        selectWithMode({ type: 'item', id: placed.id, scope });
      }
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
        if (dg.moved) {
          autoFit.current = false;
          setView((v) => ({ ...v, cx: dg.cx0 - dx / v.zoom, cy: dg.cy0 - dy / v.zoom }));
        }
        return;
      }
      const delta = sub(world, dg.start);
      if (!dg.moved && Math.hypot(delta.x, delta.y) * view.zoom < 4) return;
      dg.moved = true;
      if (dg.kind === 'marquee') setMarquee({ a: dg.start, b: world });
      else if (dg.kind === 'move') applyMove(dg.sels, world, delta, e);
      else applyHandle(dg, world, e);
      return;
    }
    const tl = ui().tool;
    const p = pvRef.current;
    if (tl === 'wall' || tl === 'room') {
      const start = tl === 'wall' ? (p.pts[0] ?? null) : null;
      const sn = snap(world, { from: start });
      const rel = start && dist(start, sn.point) > 20 ? { a: start, b: sn.point, r: relOf(start, sn.point) } : null;
      setPv((prev) => ({ ...prev, cur: sn.point, snap: sn, rel }));
    } else if (tl === 'arc') {
      if (p.pts.length < 2) {
        const sn = snap(world, { from: p.pts[0] ?? null });
        setPv((prev) => ({ ...prev, cur: sn.point, snap: sn }));
      } else setPv((prev) => ({ ...prev, cur: world, snap: null }));
    } else if (tl === 'door' || tl === 'window' || tl === 'portal') {
      const o = openingAt(world, tl);
      setPv((prev) => ({ ...prev, opening: o, cur: world }));
    } else if (tl === 'dim') {
      const sn = snap(world, { points: extraPoints('dim'), grid: 10 });
      setPv((prev) => ({ ...prev, cur: p.pts.length === 2 ? world : sn.point, snap: p.pts.length === 2 ? null : sn }));
    } else if (tl === 'measure') {
      const sn = snap(world, { points: extraPoints('dim'), grid: 10 });
      setPv((prev) => ({ ...prev, cur: sn.point, snap: sn }));
    } else if (tl === 'item' && toolKind) {
      const ghost = itemGhost(world, toolKind);
      setPv((prev) => ({ ...prev, ghost, cur: world }));
    } else if (tl === 'route' || tl === 'zone') {
      const isSite = scopeOfKind(tl === 'route' ? routeDef(toolKind ?? '') : zoneDef(toolKind ?? '')) === 'site';
      const sn = snap(world, { from: p.pts[p.pts.length - 1] ?? null, points: extraPoints('route'), grid: 50, noWalls: isSite });
      setPv((prev) => ({ ...prev, cur: sn.point, snap: sn }));
    } else if (tl === 'calibrate' && !p.calibAsk) {
      setPv((prev) => ({ ...prev, cur: world }));
    }
    ui().set({ cursor: world });
  };

  const applyMove = (sels: Sel[], world: Vec2, delta: Vec2, e: React.PointerEvent) => {
    const base = store().txBase;
    if (!base) return;
    const grid = ui().snapGrid ? base.gridStep : 1;
    const rg = (x: number, g = grid) => Math.round(x / g) * g;
    if (sels.length > 1) {
      // группа: общий сдвиг по сетке; стены тянут примыкающие узлы, проёмы едут со стенами
      const d = { x: rg(delta.x, grid / 2), y: rg(delta.y, grid / 2) };
      const movable = sels.filter((s) => s.type !== 'room' && s.type !== 'site' && s.type !== 'opening');
      store().transient((dr) => moveEntities(dr, movable, d));
      return;
    }
    const sel = sels[0];
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
      const a = add(w0.a, d);
      const b = add(w0.b, d);
      setPv({ ...emptyPreview, rel: { a, b, r: relOf(a, b, new Set([sel.id])) } });
    } else if (sel.type === 'opening') {
      const lv = getLevel(base, sel.scope);
      const o0 = lv?.openings.find((o) => o.id === sel.id);
      if (!lv || !o0) return;
      const hit = locateOnWall({ walls: lv.walls, openings: lv.openings.filter((o) => o.id !== sel.id) }, world, 600);
      if (!hit) return;
      const pos = clampPos(Math.round(hit.pos / 10) * 10, o0.width, wallLen(hit.wall));
      store().transient((dr) => {
        const o = getLevel(dr, sel.scope)?.openings.find((x) => x.id === sel.id);
        if (o) {
          o.wallId = hit.wall.id;
          o.pos = pos;
        }
      });
    } else if (sel.type === 'item') {
      const cont = getContainer(base, sel.scope);
      const c0 = cont?.items.find((i) => i.id === sel.id);
      if (!c0 || !cont) return;
      const def = itemDef(c0.kind);
      const s = itemSize(c0);
      let pose = { x: rg(c0.x + delta.x, grid / 2), y: rg(c0.y + delta.y, grid / 2), rot: c0.rot };
      const lv = sel.scope === 'site' ? null : getLevel(base, sel.scope);
      const others = cont.items.filter((i) => i.id !== sel.id && layerOfItem(i) === layerOfItem(c0)).map(itemBox);
      const tol = 7 / view.zoom;
      // выравнивание по краям и центрам соседних объектов
      if (!e.altKey && others.length) {
        const al = alignSnap(itemBox({ ...c0, ...pose }), others, tol);
        pose = { ...pose, x: Math.round(pose.x + al.dx), y: Math.round(pose.y + al.dy) };
      }
      const gw = lv ? geomOf(lv).walls : [];
      if (lv && !e.altKey && (def?.mount === 'wall' || !def)) {
        const sn = snapItemToWalls({ x: c0.x + delta.x, y: c0.y + delta.y }, s.w, s.d, c0.rot, gw, 200);
        if (sn.snapped) {
          // у стены: поперёк стены положение задаёт стена, вдоль — сохраняется выравнивание по соседям
          const al = alignSnap(itemBox({ ...c0, x: sn.x, y: sn.y, rot: sn.rot }), others, tol);
          const along = sn.rot % 180 === 0 ? { x: al.dx, y: 0 } : sn.rot % 180 === 90 ? { x: 0, y: al.dy } : { x: 0, y: 0 };
          pose = { x: Math.round(sn.x + along.x), y: Math.round(sn.y + along.y), rot: sn.rot };
        }
      } else if (lv && !e.altKey && def && def.layer !== 'furniture' && def.mount !== 'ceiling') {
        const raw = { x: c0.x + delta.x, y: c0.y + delta.y };
        const hit = locateOnWall(lv, raw, 200);
        if (hit && hit.dist > 1) {
          const u = norm(sub(raw, hit.point));
          const c = add(hit.point, mul(u, hit.seg.thickness / 2));
          pose = { x: Math.round(c.x), y: Math.round(c.y), rot: wallFacingRot(hit.seg, raw) };
        }
      }
      const guides = others.length ? alignSnap(itemBox({ ...c0, ...pose }), others, 1.5).guides : [];
      setPv({ ...emptyPreview, guides });
      store().transient((dr) => {
        const it = getContainer(dr, sel.scope)?.items.find((i) => i.id === sel.id);
        if (it) Object.assign(it, pose);
      });
    } else if (sel.type === 'dim') {
      const d0 = getLevel(base, sel.scope)?.dims.find((x) => x.id === sel.id);
      if (!d0) return;
      const n = perp(norm(sub(d0.b, d0.a)));
      store().transient((dr) => {
        const dm = getLevel(dr, sel.scope)?.dims.find((x) => x.id === sel.id);
        if (dm) dm.offset = Math.round(d0.offset + dot(delta, n));
      });
    } else if (sel.type === 'route' || sel.type === 'zone') {
      const d = { x: rg(delta.x, grid / 2), y: rg(delta.y, grid / 2) };
      store().transient((dr) => moveEntities(dr, [sel], d));
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
      const free = geomOf(lv).walls.filter((w) => !attached.has(baseWallId(w.id)));
      const sn = snapPoint(world, { walls: free, grid: ui().snapGrid ? base.gridStep : 0, from: other, angle: ui().snapAngle && !e.shiftKey, tol: 10 / view.zoom, excludePoints: [orig] });
      const to = { x: Math.round(sn.point.x), y: Math.round(sn.point.y) };
      const a = dg.h === 'wa' ? to : w0.a;
      const b = dg.h === 'wa' ? w0.b : to;
      setPv({ ...emptyPreview, snap: sn, cur: to, rel: dist(a, b) > 20 ? { a, b, r: segRelations(a, b, free) } : null });
      store().transient((dr) => {
        const l = getLevel(dr, sel.scope);
        if (!l) return;
        if (e.altKey) {
          const w = l.walls.find((x) => x.id === sel.id);
          if (w) w[dg.h === 'wa' ? 'a' : 'b'] = to;
        } else moveNode(l, orig, to);
      });
    } else if (dg.h === 'wm') {
      // ручка в середине стены: стрела дуги (у нуля — прямая)
      const w0 = getLevel(base, sel.scope)?.walls.find((w) => w.id === sel.id);
      if (!w0) return;
      const s = Math.round(((w0.arc ?? 0) + dot(sub(world, dg.start), perp(wallDir(w0)))) / 10) * 10;
      store().transient((dr) => {
        const w = getLevel(dr, sel.scope)?.walls.find((x) => x.id === sel.id);
        if (!w) return;
        if (Math.abs(s) < 40) delete w.arc;
        else w.arc = s;
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
    if (!dg || dg.kind === 'pan') return;
    if (dg.kind === 'marquee') {
      setMarquee(null);
      lastClick.current = null;
      if (!dg.moved) {
        if (!dg.additive) ui().select(null);
        return;
      }
      // рамка: слева направо — только целиком попавшие, справа налево — все пересечённые
      const world = toWorld(e);
      const rect = { minX: Math.min(dg.start.x, world.x), maxX: Math.max(dg.start.x, world.x), minY: Math.min(dg.start.y, world.y), maxY: Math.max(dg.start.y, world.y) };
      const st = ui();
      const act = MODE_LAYERS[st.mode].filter((l) => st.layers[l].visible && !st.layers[l].locked);
      const found = selsInRect(store().project, level.id, rect, act, world.x >= dg.start.x);
      st.selectMany(dg.additive ? [...st.multi, ...found.filter((f) => !st.multi.some((m) => sameSel(m, f)))] : found);
      return;
    }
    if (dg.moved) {
      store().commit();
      lastClick.current = null;
    } else {
      store().cancel();
      if (dg.kind === 'move') {
        if (dg.cycle) ui().select(dg.cycle);
        lastClick.current = { x: e.clientX, y: e.clientY };
      }
    }
    const p = pvRef.current;
    if (p.snap || p.rel || p.guides.length) setPv(emptyPreview);
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
    if (tl === 'wall' || tl === 'arc') {
      setPv(emptyPreview);
      return;
    }
    if (tl !== 'select') return;
    const sel = hitsAt(e.clientX, e.clientY)[0];
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
    const sel = hitsAt(e.clientX, e.clientY)[0] ?? null;
    if (sel && !ui().multi.some((m) => sameSel(m, sel))) ui().select(sel);
    const r = wrapRef.current!.getBoundingClientRect();
    setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, sel, world: toWorld(e) });
  };

  // ── перетаскивание объекта из каталога на план ──
  const onDrop = (e: React.DragEvent) => {
    const kind = e.dataTransfer.getData('application/x-hb-kind');
    if (!kind) return;
    e.preventDefault();
    let params: Item['params'] = {};
    try {
      params = JSON.parse(e.dataTransfer.getData('application/x-hb-params') || '{}');
    } catch {
      params = {};
    }
    const it = { ...itemGhost(toWorld(e), kind, params), id: newId('it') };
    const scope = scopeOfKind(itemDef(kind));
    store().update((d) => {
      getContainer(d, scope)?.items.push(it);
    });
    ui().setTool('select');
    selectWithMode({ type: 'item', id: it.id, scope });
  };

  const menuEntries = (): MenuEntry[] => {
    if (!menu) return [];
    const sel = menu.sel;
    const many = multi.length > 1;
    const del: MenuEntry = { label: many ? t(`Видалити (${multi.length})`, `Удалить (${multi.length})`) : t('Видалити', 'Удалить'), hint: 'Del', danger: true, run: deleteSelection };
    const dup: MenuEntry = { label: many ? t(`Дублювати (${multi.length})`, `Дублировать (${multi.length})`) : t('Дублювати', 'Дублировать'), hint: 'Ctrl+D', run: duplicateSelection };
    const planTool = (tl: 'wall' | 'door' | 'window') => () => {
      ui().setMode('plan');
      ui().setTool(tl);
    };
    if (!sel) {
      return [
        { label: t('Показати все', 'Показать всё'), hint: 'Home', run: () => window.dispatchEvent(new Event('hb-fit')) },
        { label: t('Стіна', 'Стена'), hint: 'W', run: planTool('wall') },
        { label: t('Двері', 'Дверь'), hint: 'D', run: planTool('door') },
        { label: t('Вікно', 'Окно'), hint: 'N', run: planTool('window') },
        { label: t('Рулетка', 'Рулетка'), hint: 'T', run: () => ui().setTool('measure') },
      ];
    }
    if (many) return [dup, del];
    if (sel.type === 'wall') {
      const w = level.walls.find((x) => x.id === sel.id);
      const mutW = (fn: (x: Wall) => void) => () =>
        store().update((d) => {
          const x = getLevel(d, sel.scope)?.walls.find((q) => q.id === sel.id);
          if (x) fn(x);
        });
      return [
        { label: t('Розділити стіну тут', 'Разделить стену здесь'), run: () => store().update((d) => void splitWall(getLevel(d, sel.scope)!, sel.id, menu.world)) },
        { label: t('Розвернути напрямок', 'Развернуть направление'), run: () => store().update((d) => flipWall(getLevel(d, sel.scope)!, sel.id)) },
        { label: w?.loadBearing ? t('Зробити перегородкою', 'Сделать перегородкой') : t('Зробити несучою', 'Сделать несущей'), run: mutW((x) => (x.loadBearing = !x.loadBearing)) },
        w?.status === 'demolish' ? { label: t('Скасувати демонтаж', 'Отменить демонтаж'), run: mutW((x) => (x.status = 'existing')) } : { label: t('Позначити під демонтаж', 'Пометить под демонтаж'), run: mutW((x) => (x.status = 'demolish')) },
        w?.arc ? { label: t('Випрямити', 'Выпрямить'), run: mutW((x) => void delete x.arc) } : { label: t('Зробити дуговою', 'Сделать дуговой'), run: mutW((x) => (x.arc = Math.round(dist(x.a, x.b) / 5))) },
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
    if (sel.type === 'route' || sel.type === 'zone') return [{ label: t('Додати вершину (подвійний клік по лінії)', 'Добавить вершину (двойной клик по линии)'), run: () => undefined }, dup, del];
    if (sel.type === 'dim') return [del];
    return [];
  };

  // ── отрисовка ──
  const vb = `${view.cx - size.w / 2 / view.zoom} ${view.cy - size.h / 2 / view.zoom} ${size.w / view.zoom} ${size.h / view.zoom}`;
  const vis = (l: LayerId) => layers[l].visible;
  const active = (l: LayerId) => MODE_LAYERS[mode].includes(l);
  /** Слой некликабелен: не относится к режиму, заблокирован или выбран инструмент рисования. */
  const locked = (l: LayerId) => !active(l) || layers[l].locked || tool !== 'select';
  /** Слои вне режима приглушаются (стены и помещения — основа плана — остаются как есть). */
  const dimmed = (l: LayerId) => !active(l) && l !== 'walls' && l !== 'rooms';
  const groupColors = useMemo(() => new Map(project.electrical.groups.map((g) => [g.id, g.color])), [project.electrical.groups]);
  /** Активные слои рисуются поверх приглушённых. */
  const byActive = <T,>(list: T[], layerOf: (x: T) => LayerId): T[] => [...list].sort((a, b) => (active(layerOf(a)) ? 1 : 0) - (active(layerOf(b)) ? 1 : 0));

  const scopes: { scope: string; items: Item[]; routes: Route[]; zones: Zone[] }[] = [];
  if (project.site) scopes.push({ scope: 'site', ...project.site });
  scopes.push({ scope: level.id, items: level.items, routes: level.routes, zones: level.zones });

  const shadowPrims = useMemo(
    () => (project.site && project.sun.enabled && vis('landscape') ? siteShadowPrims(project) : []),
    [project.site, project.sun, project.levels, layers.landscape.visible], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const applyCalibration = () => {
    const ask = pv.calibAsk;
    const real = Number(calibValue.replace(',', '.'));
    if (!ask || !(real > 0)) return;
    const f = real / dist(ask.a, ask.b);
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

  const hoverRoom = tool === 'select' && cursor ? level.rooms.find((r) => pointInPolygon(cursor, r.polygon)) : null;
  const single = multi.length === 1;
  const moving = !!pv.rel || pv.guides.length > 0;
  const windowSel = marquee ? marquee.b.x >= marquee.a.x : true;

  return (
    <div ref={wrapRef} className="editor2d" onContextMenu={onContextMenu} onDragOver={(e) => e.dataTransfer.types.includes('application/x-hb-kind') && e.preventDefault()} onDrop={onDrop} data-mode={mode}>
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
          <g data-t="site" data-id="site" data-scope="site" opacity={dimmed('landscape') ? 0.45 : 1} style={{ pointerEvents: locked('landscape') ? 'none' : 'stroke' }}>
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
              <polygon key={r.id} points={ptsAttr(r.polygon)} fill={project.finishes.find((f) => f.id === r.floorFinish)?.color ?? '#e5e7eb'} fillOpacity={hoverRoom?.id === r.id ? 0.42 : 0.3} />
            ))}
          </g>
        )}
        {scopes.map((sc) => (
          <g key={`z${sc.scope}`}>
            {sc.zones
              .filter((z) => vis(layerOfZone(z)))
              .map((z) => (
                <ZoneG key={z.id} zone={z} k={k} scope={sc.scope} locked={locked(layerOfZone(z))} dim={dimmed(layerOfZone(z))} label={ls(zoneDef(z.kind)?.name)} />
              ))}
          </g>
        ))}
        {project.site && vis('landscape') && (
          <g>
            {project.site.routes.map((r) => (
              <RouteG key={r.id} route={r} k={k} scope="site" locked={locked('landscape')} dim={dimmed('landscape')} />
            ))}
          </g>
        )}
        {belowGeom && vis('walls') && <WallsLayer walls={belowGeom.walls} openings={belowGeom.openings} k={k} ghost />}
        {vis('walls') && geom.demolished.length > 0 && (
          <g style={{ pointerEvents: 'none' }} data-demolished={geom.demolished.length}>
            <Prims prims={demolishedPrims(geom.demolished)} k={k} />
          </g>
        )}
        {vis('walls') && <WallsLayer walls={geom.walls} openings={geom.openings} k={k} />}
        {vis('walls') && (
          <g>
            {hitPolys.map(({ wall, polys }) => (
              <g key={wall.id} data-t="wall" data-id={wall.id} data-scope={level.id} style={{ pointerEvents: locked('walls') ? 'none' : undefined, cursor: 'move' }}>
                {polys.map((pg, i) => (
                  <polygon key={i} points={ptsAttr(pg)} fill="#000" fillOpacity={0.001} />
                ))}
              </g>
            ))}
            {geom.openings.map((o) => {
              const w = geom.walls.find((x) => x.id === o.wallId);
              return w ? <OpeningG key={o.id} o={o} wall={w} k={k} scope={level.id} locked={locked('walls')} /> : null;
            })}
          </g>
        )}
        {scopes.map((sc) => (
          <g key={`i${sc.scope}`}>
            {byActive(
              sc.items.filter((it) => vis(layerOfItem(it))).sort((a, b) => (layerOfItem(a) === 'furniture' ? 0 : 1) - (layerOfItem(b) === 'furniture' ? 0 : 1) || a.z - b.z),
              layerOfItem,
            ).map((it) => (
              <ItemG key={it.id} item={it} k={k} scope={sc.scope} locked={locked(layerOfItem(it))} dim={dimmed(layerOfItem(it))} />
            ))}
          </g>
        ))}
        <g>
          {byActive(
            level.routes.filter((r) => vis(layerOfRoute(r))),
            layerOfRoute,
          ).map((r) => (
            <RouteG key={r.id} route={r} k={k} scope={level.id} locked={locked(layerOfRoute(r))} dim={dimmed(layerOfRoute(r))} color={typeof r.params.group === 'string' ? groupColors.get(r.params.group) : undefined} />
          ))}
        </g>
        {vis('rooms') && (
          <g>
            {level.rooms.map((r) => (
              <g key={r.id} data-t="room" data-id={r.id} data-scope={level.id} style={{ cursor: 'pointer', pointerEvents: locked('rooms') ? 'none' : undefined }}>
                <rect x={r.seed.x - 14 * k} y={r.seed.y - 4 * k} width={28 * k} height={9.5 * k} fill="#fff" fillOpacity={0.01} />
                <Prims prims={roomLabelPrims(r, k)} k={k} />
              </g>
            ))}
          </g>
        )}
        {vis('dimensions') && (
          <g opacity={dimmed('dimensions') ? 0.35 : 1}>
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
        <g data-selection={multi.length}>
          {multi.map((s) => (
            <SelOverlay key={`${s.type}:${s.id}`} sel={s} single={single} project={project} level={level} geom={geom} hitPolys={hitPolys} k={k} zoom={view.zoom} moving={moving} />
          ))}
        </g>
        {marquee && (
          <rect
            data-marquee={windowSel ? 'window' : 'crossing'}
            x={Math.min(marquee.a.x, marquee.b.x)}
            y={Math.min(marquee.a.y, marquee.b.y)}
            width={Math.abs(marquee.b.x - marquee.a.x)}
            height={Math.abs(marquee.b.y - marquee.a.y)}
            fill={windowSel ? '#2563eb' : '#16a34a'}
            fillOpacity={0.1}
            stroke={windowSel ? '#2563eb' : '#16a34a'}
            strokeWidth={1.2 / view.zoom}
            strokeDasharray={windowSel ? undefined : `${5 / view.zoom}`}
            style={{ pointerEvents: 'none' }}
          />
        )}
        <ToolPreview pv={pv} tool={tool} level={level} k={k} zoom={view.zoom} wallThickness={wallThickness} t={t} />
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
          X {cursor ? Math.round(cursor.x) : '—'} · Y {cursor ? Math.round(cursor.y) : '—'} {t('мм', 'мм')}
        </span>
        {hoverRoom && (
          <span>
            {hoverRoom.name}: {hoverRoom.area.toFixed(2).replace('.', ',')} м²
          </span>
        )}
        {multi.length > 1 && (
          <span className="accent" data-count={multi.length}>
            {t('Виділено', 'Выделено')}: {multi.length}
          </span>
        )}
        {tool === 'wall' && pv.pts.length === 1 && <span className="accent">{pv.typed ? `${t('Довжина', 'Длина')}: ${pv.typed} мм ⏎` : t('Введіть довжину цифрами та натисніть Enter', 'Введите длину цифрами и нажмите Enter')}</span>}
        <span className="grow" />
        <span>1:{Math.round(k)}</span>
        <button className="link" onClick={() => window.dispatchEvent(new Event('hb-fit'))}>
          {t('Показати все', 'Показать всё')}
        </button>
      </div>
    </div>
  );
}
