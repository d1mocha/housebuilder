// 3D-вид: сцена строится из модели; орбита или прогулка от первого лица.
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { planDir, sunPosition } from '../calc/sun';
import { itemDef, routeDef, zoneDef } from '../catalog/registry';
import { itemSize } from '../draw2d/plan';
import { useT } from '../i18n';
import { bbox } from '../model/geometry';
import { getContainer } from '../model/ops';
import type { Item, LayerId, Level, Project, Sel, Vec2 } from '../model/types';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import { buildFloors, buildItemObject, buildRoof, buildRouteObject, buildSiteGround, buildWalls, buildZoneObject, collisionSegments, terrainHeight } from './build';
import { loadCustomModel } from './models';
import { resolveCollisions } from './walk';

const MM = 0.001;
const EYE = 1600;
const BODY_R = 220;

function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.geometry?.dispose();
  });
}

function useBuilt<T extends THREE.Object3D | null>(factory: () => T, deps: unknown[]): T {
  const obj = useMemo(factory, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      if (obj) disposeObject(obj);
    },
    [obj],
  );
  return obj;
}

function selOf(o: THREE.Object3D | null): Sel | null {
  let c: THREE.Object3D | null = o;
  while (c) {
    if (c.userData?.sel) return c.userData.sel as Sel;
    c = c.parent;
  }
  return null;
}

const onPick = (e: ThreeEvent<MouseEvent>) => {
  if (useUi.getState().walk || e.delta > 4) return;
  const sel = selOf(e.object);
  if (sel) {
    e.stopPropagation();
    useUi.getState().select(sel);
  }
};

const Item3D = memo(function Item3D({ item, project, scope, baseY }: { item: Item; project: Project; scope: string; baseY: number }) {
  const [custom, setCustom] = useState<THREE.Object3D | null>(null);
  const model = item.kind === 'model' ? project.models.find((m) => m.id === item.params.modelId) : undefined;
  useEffect(() => {
    let alive = true;
    if (model) {
      loadCustomModel(model)
        .then((o) => {
          if (!alive) return;
          const s = itemSize(item);
          const inst = o.clone(true);
          const g = new THREE.Group();
          // исходная модель нормализована в единичный куб [−.5,.5]×[0,1]×[−.5,.5]
          inst.scale.set(s.w * MM, s.h * MM, s.d * MM);
          g.add(inst);
          setCustom(g);
        })
        .catch(() => setCustom(null));
    } else setCustom(null);
    return () => {
      alive = false;
    };
  }, [model, item.params.w, item.params.d, item.params.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const built = useBuilt(() => {
    if (item.kind === 'model') return null;
    return buildItemObject(project, { ...item, x: 0, y: 0, z: 0, rot: 0 });
  }, [item.kind, item.params, item.kind === 'cabinet' ? project.cabinets : null, item.kind === 'cabinet' ? project.cabinetCatalog : null]);

  const obj = item.kind === 'model' ? custom : built;
  if (!obj) return null;
  return (
    <group position={[item.x * MM, (baseY + item.z) * MM, item.y * MM]} rotation={[0, (-item.rot * Math.PI) / 180, 0]} userData={{ sel: { type: 'item', id: item.id, scope } }} onClick={onPick}>
      <primitive object={obj} />
    </group>
  );
});

const LevelGroup = memo(function LevelGroup({ project, level, ceiling, layers }: { project: Project; level: Level; ceiling: boolean; layers: Record<LayerId, { visible: boolean }> }) {
  const walls = useBuilt(() => buildWalls(project, level), [level.walls, level.openings, level.height, project.finishes]);
  const floors = useBuilt(() => buildFloors(project, level, ceiling), [level.rooms, level.walls, level.height, level.elevation, level.slab, project.finishes, ceiling]);
  const routes = useBuilt(() => {
    const g = new THREE.Group();
    const colors = new Map(project.electrical.groups.map((x) => [x.id, x.color]));
    for (const r of level.routes) {
      if (!layers[routeDef(r.kind)?.layer ?? 'electrical'].visible) continue;
      const o = buildRouteObject(r, 0, typeof r.params.group === 'string' ? colors.get(r.params.group) : undefined);
      if (o) {
        o.userData.sel = { type: 'route', id: r.id, scope: level.id };
        g.add(o);
      }
    }
    for (const z of level.zones) {
      if (!layers[zoneDef(z.kind)?.layer ?? 'heating'].visible) continue;
      const o = buildZoneObject(z);
      if (o) {
        o.userData.sel = { type: 'zone', id: z.id, scope: level.id };
        g.add(o);
      }
    }
    return g;
  }, [level.routes, level.zones, layers, project.electrical.groups]);
  return (
    <group position={[0, level.elevation * MM, 0]}>
      {layers.walls.visible && <primitive object={walls} onClick={onPick} />}
      <primitive object={floors} onClick={onPick} />
      <primitive object={routes} onClick={onPick} />
      {level.items
        .filter((it) => layers[itemDef(it.kind)?.layer ?? 'furniture'].visible)
        .map((it) => (
          <Item3D key={it.id} item={it} project={project} scope={level.id} baseY={0} />
        ))}
    </group>
  );
});

const SiteGroup = memo(function SiteGroup({ project }: { project: Project }) {
  const site = project.site!;
  const ground = useBuilt(() => buildSiteGround(project), [site.boundary, site.elevations]);
  const extras = useBuilt(() => {
    const g = new THREE.Group();
    for (const r of site.routes) {
      const o = buildRouteObject(r);
      if (o) {
        o.userData.sel = { type: 'route', id: r.id, scope: 'site' };
        g.add(o);
      }
    }
    for (const z of site.zones) {
      const o = buildZoneObject(z);
      if (o) {
        o.userData.sel = { type: 'zone', id: z.id, scope: 'site' };
        g.add(o);
      }
    }
    return g;
  }, [site.routes, site.zones]);
  return (
    <group>
      {ground && <primitive object={ground} />}
      <primitive object={extras} onClick={onPick} />
      {site.items.map((it) => (
        <Item3D key={it.id} item={it} project={project} scope="site" baseY={terrainHeight(site.boundary, site.elevations, it)} />
      ))}
    </group>
  );
});

function Roof({ project }: { project: Project }) {
  const roof = useBuilt(() => buildRoof(project), [project.roof, project.levels]);
  return roof ? <primitive object={roof} /> : null;
}

function SelectionBox({ project, sel }: { project: Project; sel: Sel | null }) {
  if (!sel || sel.type !== 'item') return null;
  const it = getContainer(project, sel.scope)?.items.find((i) => i.id === sel.id);
  if (!it) return null;
  const s = itemSize(it);
  const lvl = project.levels.find((l) => l.id === sel.scope);
  const base = lvl ? lvl.elevation : project.site ? terrainHeight(project.site.boundary, project.site.elevations, it) : 0;
  return (
    <group position={[it.x * MM, (base + it.z + s.h / 2) * MM, it.y * MM]} rotation={[0, (-it.rot * Math.PI) / 180, 0]}>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry((s.w + 30) * MM, (s.h + 30) * MM, (s.d + 30) * MM)]} />
        <lineBasicMaterial color="#f97316" />
      </lineSegments>
    </group>
  );
}

/** Точка старта прогулки: центр самого большого помещения. */
function walkStart(level: Level): Vec2 {
  const r = [...level.rooms].sort((a, b) => b.area - a.area)[0];
  if (r) return r.seed;
  const pts = level.walls.flatMap((w) => [w.a, w.b]);
  if (!pts.length) return { x: 0, y: 0 };
  const bb = bbox(pts);
  return { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
}

function WalkControls({ level }: { level: Level }) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const pos = useRef<Vec2>({ x: 0, y: 0 });
  const dragging = useRef(false);
  const segs = useMemo(() => collisionSegments(level), [level.walls, level.openings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pos.current = walkStart(level);
    const dom = gl.domElement;
    const lock = () => {
      try {
        const r = dom.requestPointerLock?.() as unknown;
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
      } catch {
        /* нет pointer lock — остаётся обзор перетаскиванием */
      }
    };
    const onDown = () => {
      dragging.current = true;
      lock();
    };
    const onUp = () => (dragging.current = false);
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === dom || dragging.current) {
        yaw.current -= e.movementX * 0.0025;
        pitch.current = Math.max(-1.4, Math.min(1.4, pitch.current - e.movementY * 0.0025));
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      keys.current[e.code] = e.type === 'keydown';
      if (e.type === 'keydown' && e.code === 'Escape' && document.pointerLockElement !== dom) useUi.getState().setWalk(false);
      if (e.type === 'keydown' && (e.code === 'PageUp' || e.code === 'PageDown')) {
        const p = useProject.getState().project;
        const i = p.levels.findIndex((l) => l.id === useUi.getState().activeLevelId);
        const n = p.levels[i + (e.code === 'PageUp' ? 1 : -1)];
        if (n) useUi.getState().setActiveLevel(n.id);
      }
    };
    dom.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      dom.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      if (document.pointerLockElement === dom) document.exitPointerLock?.();
    };
  }, [level.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const k = keys.current;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    if (k.ArrowLeft) yaw.current += dt * 1.8;
    if (k.ArrowRight) yaw.current -= dt * 1.8;
    const speed = (k.ShiftLeft || k.ShiftRight ? 3200 : 1500) * Math.min(dt, 0.05);
    if (f || s) {
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      // вперёд = (−sin, −cos), вправо = (cos, −sin) в координатах (X, Z)
      const len = Math.hypot(f, s);
      const dx = ((-sin * f + cos * s) / len) * speed;
      const dy = ((-cos * f - sin * s) / len) * speed;
      pos.current = resolveCollisions({ x: pos.current.x + dx, y: pos.current.y + dy }, segs, BODY_R);
    }
    camera.position.set(pos.current.x * MM, (level.elevation + EYE) * MM, pos.current.y * MM);
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });
  useEffect(() => {
    // отладочный доступ к положению камеры (e2e)
    const w = window as unknown as Record<string, unknown>;
    w.__hbCam = () => ({ x: camera.position.x, y: camera.position.y - level.elevation * MM, z: camera.position.z });
    return () => void delete w.__hbCam;
  }, [camera, level.elevation]);
  return null;
}

function OrbitRig({ project, levelId }: { project: Project; levelId: string }) {
  const { camera, invalidate } = useThree();
  const ctrl = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  const focus = useUi((s) => s.focus);
  const frame = () => {
    const pts: Vec2[] = [];
    for (const l of project.levels) for (const w of l.walls) pts.push(w.a, w.b);
    if (!pts.length && project.site) pts.push(...project.site.boundary);
    const bb = pts.length ? bbox(pts) : { minX: 0, minY: 0, maxX: 8000, maxY: 6000 };
    const cx = ((bb.minX + bb.maxX) / 2) * MM;
    const cz = ((bb.minY + bb.maxY) / 2) * MM;
    // радиус описанной сферы здания (с учётом высоты этажей и крыши)
    let top = 0;
    for (const l of project.levels) top = Math.max(top, (l.elevation + l.height + l.slab) * MM);
    if (project.roof.type === 'gable' || project.roof.type === 'hip') top += 1.5;
    const radius = Math.max(3, 0.5 * Math.hypot((bb.maxX - bb.minX) * MM, (bb.maxY - bb.minY) * MM, top));
    const cam = camera as THREE.PerspectiveCamera;
    const vfov = ((cam.fov ?? 50) * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (cam.aspect || 1));
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.02;
    const dir = new THREE.Vector3(0.14, 0.8, 0.58).normalize();
    const ty = top * 0.35;
    camera.position.set(cx + dir.x * dist, ty + dir.y * dist, cz + dir.z * dist);
    camera.rotation.set(0, 0, 0);
    ctrl.current?.target.set(cx, ty, cz);
    ctrl.current?.update();
    invalidate();
  };
  const aspectKey = useThree((st) => Math.round((st.size.width / Math.max(1, st.size.height)) * 4));
  useEffect(frame, [project.id, levelId, aspectKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (focus && ctrl.current) {
      ctrl.current.target.set(focus.point.x * MM, 0.8, focus.point.y * MM);
      ctrl.current.update();
      invalidate();
    }
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    window.addEventListener('hb-fit', frame);
    return () => window.removeEventListener('hb-fit', frame);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <OrbitControls ref={ctrl as any} makeDefault maxPolarAngle={Math.PI / 2 - 0.03} minDistance={0.5} maxDistance={150} />;
}

function Lights({ project }: { project: Project }) {
  const sunOn = !!project.site && project.sun.enabled;
  const sunDir = useMemo(() => {
    if (!project.site) return null;
    const sp = sunPosition(project.site.latitude, project.sun.month, project.sun.day, project.sun.hour);
    if (sp.elevation <= 0) return null;
    const d = planDir(sp.azimuth, project.site.north);
    const el = (sp.elevation * Math.PI) / 180;
    return new THREE.Vector3(d.x * Math.cos(el), Math.sin(el), d.y * Math.cos(el));
  }, [project.site, project.sun]);
  const center = useMemo(() => {
    const pts = project.levels.flatMap((l) => l.walls.flatMap((w) => [w.a, w.b]));
    if (!pts.length) return new THREE.Vector3();
    const bb = bbox(pts);
    return new THREE.Vector3(((bb.minX + bb.maxX) / 2) * MM, 0, ((bb.minY + bb.maxY) / 2) * MM);
  }, [project.levels]);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(center);
    return o;
  }, [center]);
  return (
    <>
      <ambientLight intensity={sunOn ? 0.55 : 0.85} />
      <hemisphereLight args={['#ffffff', '#b9b3a8', sunOn ? 0.5 : 0.7]} />
      <primitive object={target} />
      {sunOn && sunDir ? (
        <directionalLight
          position={[center.x + sunDir.x * 60, sunDir.y * 60, center.z + sunDir.z * 60]}
          target={target}
          intensity={2.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-35}
          shadow-camera-right={35}
          shadow-camera-top={35}
          shadow-camera-bottom={-35}
          shadow-camera-far={160}
          shadow-bias={-0.0005}
        />
      ) : (
        <>
          <directionalLight position={[center.x + 8, 14, center.z + 6]} target={target} intensity={0.9} />
          <directionalLight position={[center.x - 9, 10, center.z - 7]} target={target} intensity={0.35} />
        </>
      )}
    </>
  );
}

function Scene() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    // отладочный доступ к статистике рендера (e2e, оценка производительности)
    const w = window as unknown as Record<string, unknown>;
    w.__hbGl = () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures });
    return () => void delete w.__hbGl;
  }, [gl]);
  const project = useProject((s) => s.project);
  const activeLevelId = useUi((s) => s.activeLevelId);
  const walk = useUi((s) => s.walk);
  const showCeiling = useUi((s) => s.showCeiling);
  const layers = useUi((s) => s.layers);
  const selection = useUi((s) => s.selection);
  const showRoof = useUi((s) => s.showRoof);
  const idx = Math.max(0, project.levels.findIndex((l) => l.id === activeLevelId));
  const level = project.levels[idx] ?? project.levels[0];
  const ceiling = walk || showCeiling;
  const visibleLevels = walk || showRoof ? project.levels : project.levels.slice(0, idx + 1);
  return (
    <>
      <color attach="background" args={[project.site ? '#dbe9f4' : '#eef1f4']} />
      <Lights project={project} />
      {visibleLevels.map((l) => (
        <LevelGroup key={l.id} project={project} level={l} ceiling={ceiling || l !== level} layers={layers} />
      ))}
      {(showRoof || walk) && <Roof project={project} />}
      {project.site && layers.landscape.visible && <SiteGroup project={project} />}
      {!project.site && (
        <gridHelper args={[60, 60, '#cbd2da', '#e1e5ea']} position={[0, -0.01, 0]} />
      )}
      {!walk && <SelectionBox project={project} sel={selection} />}
      {walk ? <WalkControls level={level} /> : <OrbitRig project={project} levelId={level.id} />}
    </>
  );
}

export function View3D() {
  const { t } = useT();
  const walk = useUi((s) => s.walk);
  const showCeiling = useUi((s) => s.showCeiling);
  const showRoof = useUi((s) => s.showRoof);
  const kind = useProject((s) => s.project.kind);
  const sunOn = useProject((s) => !!s.project.site && s.project.sun.enabled);
  const set = useUi((s) => s.set);
  return (
    <div className="view3d">
      <Canvas shadows={sunOn} frameloop={walk ? 'always' : 'demand'} camera={{ fov: walk ? 70 : 50, near: 0.05, far: 400, position: [8, 10, 10] }} dpr={[1, 1.75]} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <Scene />
      </Canvas>
      <div className="view3d-bar">
        <button className={walk ? 'active' : ''} onClick={() => useUi.getState().setWalk(!walk)} title="F">
          {walk ? t('Вийти з прогулянки', 'Выйти из прогулки') : t('Прогулянка', 'Прогулка')}
        </button>
        {!walk && (
          <button className={showCeiling ? 'active' : ''} onClick={() => set({ showCeiling: !showCeiling })}>
            {t('Стеля', 'Потолок')}
          </button>
        )}
        {!walk && kind === 'house' && (
          <button className={showRoof ? 'active' : ''} onClick={() => set({ showRoof: !showRoof })}>
            {t('Дах і всі поверхи', 'Крыша и все этажи')}
          </button>
        )}
      </div>
      {walk && (
        <div className="walk-hint">
          {t('Клацніть у вікні, щоб керувати оглядом мишею · WASD / стрілки — рух · Shift — швидше · PgUp/PgDn — поверх · Esc — вихід', 'Щёлкните в окне, чтобы управлять обзором мышью · WASD / стрелки — движение · Shift — быстрее · PgUp/PgDn — этаж · Esc — выход')}
        </div>
      )}
    </div>
  );
}
