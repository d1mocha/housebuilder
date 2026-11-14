// Мемоизированные слои отрисовки 2D-редактора и вспомогательные функции вида.
import { memo, useMemo } from 'react';
import { itemDef, routeDef, zoneDef } from '../catalog/registry';
import { Prims } from '../draw2d/Svg';
import { itemLocalPrims, itemSize, openingPrims, routePrims, wallsPrims, zonePrims } from '../draw2d/plan';
import { bbox } from '../model/geometry';
import type { Item, LayerId, Level, Opening, Project, Route, Vec2, Wall, Zone } from '../model/types';
import { arcMid, baseWallId, geomOf, openingGeom, wallPolygon } from '../model/walls';

export const PX_PER_PAPER_MM = 3.78;

export interface View {
  cx: number;
  cy: number;
  zoom: number;
}

export const layerOfItem = (it: Item): LayerId => itemDef(it.kind)?.layer ?? 'furniture';
export const layerOfRoute = (r: Route): LayerId => routeDef(r.kind)?.layer ?? 'electrical';
export const layerOfZone = (z: Zone): LayerId => zoneDef(z.kind)?.layer ?? 'heating';
export const ptsAttr = (pts: Vec2[]) => pts.map((q) => `${q.x},${q.y}`).join(' ');

export const WallsLayer = memo(function WallsLayer({ walls, openings, k, ghost }: { walls: Wall[]; openings: Opening[]; k: number; ghost?: boolean }) {
  const prims = useMemo(() => wallsPrims(walls, openings), [walls, openings]);
  return (
    <g opacity={ghost ? 0.18 : 1} style={{ pointerEvents: 'none' }}>
      <Prims prims={prims} k={k} />
    </g>
  );
});

export const OpeningG = memo(function OpeningG({ o, wall, k, scope, locked }: { o: Opening; wall: Wall; k: number; scope: string; locked: boolean }) {
  const prims = useMemo(() => openingPrims(o, wall), [o, wall]);
  const g = openingGeom(o, wall);
  return (
    <g data-t="opening" data-id={o.id} data-scope={scope} style={{ pointerEvents: locked ? 'none' : undefined, cursor: 'move' }}>
      <polygon points={ptsAttr(g.quad)} fill="#fff" fillOpacity={0.01} stroke="none" />
      <Prims prims={prims} k={k} />
    </g>
  );
});

export const ItemG = memo(function ItemG({ item, k, scope, locked, ghost, dim }: { item: Item; k: number; scope: string; locked: boolean; ghost?: boolean; dim?: boolean }) {
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
      opacity={ghost ? 0.6 : dim ? 0.3 : item.status === 'demolish' ? 0.45 : 1}
      style={{ pointerEvents: locked || ghost ? 'none' : undefined, cursor: 'move' }}
    >
      <rect x={-hw} y={-hd} width={hw * 2} height={hd * 2} fill="#fff" fillOpacity={0.01} />
      <Prims prims={prims} k={k} />
    </g>
  );
});

export const RouteG = memo(function RouteG({ route, k, scope, locked, color, dim }: { route: Route; k: number; scope: string; locked: boolean; color?: string; dim?: boolean }) {
  const prims = useMemo(() => routePrims(route, k, color), [route, k, color]);
  return (
    <g data-t="route" data-id={route.id} data-scope={scope} opacity={dim ? 0.3 : 1} style={{ pointerEvents: locked ? 'none' : undefined, cursor: 'move' }}>
      <polyline points={ptsAttr(route.points)} fill="none" stroke="#000" strokeOpacity={0.001} strokeWidth={Math.max(8 / (PX_PER_PAPER_MM / k), routeDef(route.kind)?.width?.(route.params) ?? 0)} />
      <Prims prims={prims} k={k} />
    </g>
  );
});

export const ZoneG = memo(function ZoneG({ zone, k, scope, locked, label, dim }: { zone: Zone; k: number; scope: string; locked: boolean; label: string; dim?: boolean }) {
  const prims = useMemo(() => zonePrims(zone, k, label), [zone, k, label]);
  return (
    <g data-t="zone" data-id={zone.id} data-scope={scope} opacity={dim ? 0.3 : 1} style={{ pointerEvents: locked ? 'none' : undefined, cursor: 'move' }}>
      <Prims prims={prims} k={k} />
    </g>
  );
});

export function Grid({ view, w, h }: { view: View; w: number; h: number }) {
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
export function contentBBox(project: Project, level: Level | undefined) {
  const pts: Vec2[] = [];
  if (level) {
    for (const w of level.walls) {
      pts.push(w.a, w.b);
      if (w.arc) pts.push(arcMid(w));
    }
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

/** Полигоны попадания по стене: у дуговой — по сегментам, у демонтируемой — собственный контур. */
export function wallHitPolys(level: Level): { wall: Wall; polys: Vec2[][] }[] {
  const g = geomOf(level);
  return level.walls.map((w) => {
    if (w.status === 'demolish') return { wall: w, polys: [wallPolygon(w, [w])] };
    const segs = g.walls.filter((x) => baseWallId(x.id) === w.id);
    return { wall: w, polys: segs.map((x) => wallPolygon(x, g.walls)) };
  });
}

export const clampPos = (pos: number, width: number, len: number, margin = 50) => {
  const lo = width / 2 + margin;
  const hi = len - width / 2 - margin;
  return hi < lo ? len / 2 : Math.max(lo, Math.min(hi, pos));
};

export { zoneDef };
