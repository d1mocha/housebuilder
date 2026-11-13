// Чистые построители 3D-объектов из модели (используются сценой R3F и экспортом glTF).
// Масштаб: метры. План (x, y) → three (x, высота, y).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { generateCabinet } from '../cabinet/generate';
import { wallMaterial } from '../catalog/finishes';
import { itemDef, num, routeDef, zoneDef } from '../catalog/registry';
import type { Mat3, Prim3 } from '../catalog/registry';
import { itemSize } from '../draw2d/plan';
import { add, bbox, dist, mul, norm, perp, sub } from '../model/geometry';
import type { Finish, Item, Level, Opening, Project, Room, Route, Sel, Vec2, Wall, Zone } from '../model/types';
import { detectRooms, wallDir, wallLength, wallPolygon } from '../model/walls';
import { finishMaterial, partMaterial } from './materials';

const MM = 0.001;

interface FaceBuf {
  pos: number[];
  nor: number[];
  uv: number[];
}
const newBuf = (): FaceBuf => ({ pos: [], nor: [], uv: [] });

/** Добавить четырёхугольник (p0..p3 по контуру) с нормалью n; порядок обхода исправляется автоматически. */
function pushQuad(buf: FaceBuf, p: THREE.Vector3[], n: THREE.Vector3, uv: [number, number][]) {
  const e1 = new THREE.Vector3().subVectors(p[1], p[0]);
  const e2 = new THREE.Vector3().subVectors(p[2], p[0]);
  const flip = new THREE.Vector3().crossVectors(e1, e2).dot(n) < 0;
  const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
  for (const i of order) {
    buf.pos.push(p[i].x, p[i].y, p[i].z);
    buf.nor.push(n.x, n.y, n.z);
    buf.uv.push(uv[i][0], uv[i][1]);
  }
}

const V = (p: Vec2, z: number) => new THREE.Vector3(p.x * MM, z * MM, p.y * MM);

function buffersToGeometry(bufs: FaceBuf[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  let start = 0;
  bufs.forEach((b, i) => {
    pos.push(...b.pos);
    nor.push(...b.nor);
    uv.push(...b.uv);
    const count = b.pos.length / 3;
    g.addGroup(start, count, i);
    start += count;
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export interface WallPiece {
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

/** Разбить стену на призмы: сплошные участки и участки под/над проёмами. */
export function wallPieces(wall: Wall, openings: Opening[], H: number): WallPiece[] {
  const L = wallLength(wall);
  const ops = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({ s0: Math.max(0, o.pos - o.width / 2), s1: Math.min(L, o.pos + o.width / 2), sill: Math.max(0, o.sill), top: Math.min(H, o.sill + o.height) }))
    .filter((o) => o.s1 - o.s0 > 1)
    .sort((a, b) => a.s0 - b.s0);
  const out: WallPiece[] = [];
  let cur = 0;
  for (const o of ops) {
    const s0 = Math.max(cur, o.s0);
    if (s0 > cur) out.push({ s0: cur, s1: s0, z0: 0, z1: H });
    if (o.s1 > s0) {
      if (o.sill > 0) out.push({ s0, s1: o.s1, z0: 0, z1: o.sill });
      if (o.top < H) out.push({ s0, s1: o.s1, z0: o.top, z1: H });
      cur = o.s1;
    }
  }
  if (cur < L) out.push({ s0: cur, s1: L, z0: 0, z1: H });
  return out;
}

export function buildWallGeometry(wall: Wall, walls: Wall[], openings: Opening[], H: number): THREE.BufferGeometry {
  const L = wallLength(wall);
  const dir = wallDir(wall);
  const n = perp(dir);
  const h = wall.thickness / 2;
  const [aL, bL, bR, aR] = wallPolygon(wall, walls);
  const pt = (s: number, side: 1 | -1): Vec2 => {
    if (s <= 0.5) return side === 1 ? aL : aR;
    if (s >= L - 0.5) return side === 1 ? bL : bR;
    return add(add(wall.a, mul(dir, s)), mul(n, side * h));
  };
  const bufL = newBuf();
  const bufR = newBuf();
  const core = newBuf();
  const nL = new THREE.Vector3(n.x, 0, n.y);
  const nR = nL.clone().negate();
  const nD = new THREE.Vector3(dir.x, 0, dir.y);
  const up = new THREE.Vector3(0, 1, 0);
  for (const pc of wallPieces(wall, openings, H)) {
    const L0 = pt(pc.s0, 1);
    const L1 = pt(pc.s1, 1);
    const R0 = pt(pc.s0, -1);
    const R1 = pt(pc.s1, -1);
    const u0 = pc.s0 * MM;
    const u1 = pc.s1 * MM;
    const v0 = pc.z0 * MM;
    const v1 = pc.z1 * MM;
    const sideUv: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    pushQuad(bufL, [V(L0, pc.z0), V(L1, pc.z0), V(L1, pc.z1), V(L0, pc.z1)], nL, sideUv);
    pushQuad(bufR, [V(R0, pc.z0), V(R1, pc.z0), V(R1, pc.z1), V(R0, pc.z1)], nR, sideUv);
    const t = wall.thickness * MM;
    const capUv: [number, number][] = [[0, v0], [t, v0], [t, v1], [0, v1]];
    const flatUv: [number, number][] = [[u0, 0], [u1, 0], [u1, t], [u0, t]];
    pushQuad(core, [V(L0, pc.z1), V(L1, pc.z1), V(R1, pc.z1), V(R0, pc.z1)], up, flatUv);
    if (pc.z0 > 0) pushQuad(core, [V(L0, pc.z0), V(L1, pc.z0), V(R1, pc.z0), V(R0, pc.z0)], up.clone().negate(), flatUv);
    pushQuad(core, [V(L0, pc.z0), V(R0, pc.z0), V(R0, pc.z1), V(L0, pc.z1)], nD.clone().negate(), capUv);
    pushQuad(core, [V(L1, pc.z0), V(R1, pc.z0), V(R1, pc.z1), V(L1, pc.z1)], nD, capUv);
  }
  return buffersToGeometry([bufL, bufR, core]);
}

const finishOf = (p: Project, id: string | null | undefined): Finish | undefined => p.finishes.find((f) => f.id === id);

const FRAME_WHITE = '#f4f4f2';

function boxMesh(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w * MM, h * MM, d * MM), mat);
  m.position.set(x * MM, y * MM, z * MM);
  return m;
}

/** Заполнение проёма: окно (рама + стекло) или дверь (коробка + полотно). Локальные оси: x вдоль стены, z — сторона L. */
export function buildOpeningObject(o: Opening, wall: Wall, H: number): THREE.Group {
  const g = new THREE.Group();
  const dir = wallDir(wall);
  const c = add(wall.a, mul(dir, o.pos));
  g.position.set(c.x * MM, 0, c.y * MM);
  g.rotation.y = -Math.atan2(dir.y, dir.x);
  const hgt = Math.min(o.height, H - o.sill);
  const frameMat = partMaterial(o.kind === 'door' ? (o.style === 'entrance' ? '#4a4f57' : '#e9e4da') : FRAME_WHITE);
  const fd = Math.min(wall.thickness, o.kind === 'window' ? 70 : 100);
  const ft = o.kind === 'window' ? 55 : 40;
  if (o.kind === 'portal') return g;
  // рама
  g.add(boxMesh(ft, hgt, fd, -o.width / 2 + ft / 2, o.sill + hgt / 2, 0, frameMat));
  g.add(boxMesh(ft, hgt, fd, o.width / 2 - ft / 2, o.sill + hgt / 2, 0, frameMat));
  g.add(boxMesh(o.width - 2 * ft, ft, fd, 0, o.sill + hgt - ft / 2, 0, frameMat));
  if (o.kind === 'window') {
    g.add(boxMesh(o.width - 2 * ft, ft, fd, 0, o.sill + ft / 2, 0, frameMat));
    const n = Math.max(1, Math.round(o.sashes));
    for (let i = 1; i < n; i++) g.add(boxMesh(ft, hgt - 2 * ft, fd, -o.width / 2 + (o.width * i) / n, o.sill + hgt / 2, 0, frameMat));
    g.add(boxMesh(o.width - 2 * ft, hgt - 2 * ft, 8, 0, o.sill + hgt / 2, 0, partMaterial('#bfe3f2', 'glass')));
    // подоконник
    g.add(boxMesh(o.width + 60, 30, wall.thickness / 2 + 60, 0, o.sill - 15, wall.thickness / 4 + 30, partMaterial(FRAME_WHITE)));
    return g;
  }
  // дверь
  const leafMat = partMaterial(o.style === 'entrance' ? '#5b4636' : '#d8cbb6', 'wood');
  const leafT = 40;
  const lh = hgt - ft;
  const side = o.swing === 'L' ? 1 : -1;
  const mkLeaf = (hingeX: number, width: number, dirSign: 1 | -1, open: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(hingeX * MM, 0, 0);
    pivot.add(boxMesh(width, lh, leafT, (dirSign * width) / 2, o.sill + lh / 2, 0, leafMat));
    pivot.add(boxMesh(20, 120, leafT + 50, dirSign * (width - 70), o.sill + 1000, 0, partMaterial('#b8bcc2', 'metal')));
    pivot.rotation.y = -dirSign * side * open;
    g.add(pivot);
  };
  const iw = o.width - 2 * ft;
  if (o.style === 'sliding') {
    g.add(boxMesh(iw, lh, leafT, iw * 0.85, o.sill + lh / 2, side * (wall.thickness / 2 + leafT / 2 + 5), leafMat));
  } else if (o.style === 'double') {
    mkLeaf(-iw / 2, iw / 2, 1, 1.45);
    mkLeaf(iw / 2, iw / 2, -1, 1.45);
  } else {
    const open = o.style === 'entrance' ? 0 : 1.45;
    if (o.hinge === 'a') mkLeaf(-iw / 2, iw, 1, open);
    else mkLeaf(iw / 2, iw, -1, open);
  }
  return g;
}

/** Стены этажа: по мешу на стену (3 материала: сторона L, сторона R, тело) + заполнения проёмов. */
export function buildWalls(project: Project, level: Level): THREE.Group {
  const g = new THREE.Group();
  g.name = 'walls';
  for (const w of level.walls) {
    if (wallLength(w) < 1) continue;
    const H = w.height ?? level.height;
    const geo = buildWallGeometry(w, level.walls, level.openings, H);
    const mats = [finishMaterial(finishOf(project, w.finishL), 'wall'), finishMaterial(finishOf(project, w.finishR), 'wall'), partMaterial(wallMaterial(w.material).estimate === 'gkl' ? '#e5e7eb' : '#d9d5cd')];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.sel = { type: 'wall', id: w.id, scope: level.id } satisfies Sel;
    g.add(mesh);
  }
  for (const o of level.openings) {
    const w = level.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const og = buildOpeningObject(o, w, w.height ?? level.height);
    og.traverse((c) => {
      c.userData.sel = { type: 'opening', id: o.id, scope: level.id } satisfies Sel;
    });
    g.add(og);
  }
  return g;
}

function polygonGeometry(poly: Vec2[], y: number, faceUp: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x * MM, p.y * MM)));
  const geo = new THREE.ShapeGeometry(shape);
  // ShapeGeometry лежит в XY → переводим в XZ; UV = метры
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const yy = pos.getY(i);
    pos.setXYZ(i, x, y, yy);
    uv.setXY(i, x, yy);
  }
  const idx = geo.index;
  if (idx) {
    // нормаль ShapeGeometry (+Z) после перестановки осей смотрит вниз (−Y) → для пола разворачиваем
    const a = idx.array as Uint16Array | Uint32Array;
    const probe = triNormalY(pos, a[0], a[1], a[2]);
    if (probe > 0 !== faceUp) {
      for (let i = 0; i < a.length; i += 3) {
        const t = a[i + 1];
        a[i + 1] = a[i + 2];
        a[i + 2] = t;
      }
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function triNormalY(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i0: number, i1: number, i2: number): number {
  const ax = pos.getX(i1) - pos.getX(i0);
  const az = pos.getZ(i1) - pos.getZ(i0);
  const bx = pos.getX(i2) - pos.getX(i0);
  const bz = pos.getZ(i2) - pos.getZ(i0);
  return az * bx - ax * bz;
}

/** Полы и потолки помещений + плита основания/перекрытия по контуру здания. */
export function buildFloors(project: Project, level: Level, withCeiling: boolean): THREE.Group {
  const g = new THREE.Group();
  g.name = 'floors';
  for (const r of level.rooms) {
    if (r.polygon.length < 3) continue;
    const floor = new THREE.Mesh(polygonGeometry(r.polygon, 0, true), finishMaterial(finishOf(project, r.floorFinish), 'floor'));
    floor.receiveShadow = true;
    floor.userData.sel = { type: 'room', id: r.id, scope: level.id } satisfies Sel;
    g.add(floor);
    if (withCeiling) {
      const ceil = new THREE.Mesh(polygonGeometry(r.polygon, level.height * MM, false), finishMaterial(finishOf(project, r.ceilingFinish), 'ceiling'));
      g.add(ceil);
    }
  }
  const { outline } = detectRooms(level.walls);
  const slabMat = partMaterial('#8f9399');
  for (const o of outline) {
    if (o.length < 3) continue;
    const base = new THREE.Mesh(polygonGeometry(o, -0.004, true), slabMat);
    base.receiveShadow = true;
    g.add(base);
    // тело перекрытия под этажом (для верхних этажей) — видно с торца
    if (level.elevation > 0) {
      const shape = new THREE.Shape(o.map((p) => new THREE.Vector2(p.x * MM, -p.y * MM)));
      const ex = new THREE.ExtrudeGeometry(shape, { depth: level.slab * MM, bevelEnabled: false });
      ex.rotateX(-Math.PI / 2);
      ex.translate(0, -level.slab * MM - 0.005, 0);
      g.add(new THREE.Mesh(ex, slabMat));
    }
  }
  return g;
}

// ───────── Объекты ─────────

function primGeometry(p: Prim3, s: { w: number; d: number }): THREE.BufferGeometry {
  const ox = -s.w / 2;
  const oz = -s.d / 2;
  if (p.t === 'box') {
    const g = new THREE.BoxGeometry(Math.max(p.w, 1) * MM, Math.max(p.h, 1) * MM, Math.max(p.d, 1) * MM);
    g.translate((ox + p.x + p.w / 2) * MM, (p.z + p.h / 2) * MM, (oz + p.y + p.d / 2) * MM);
    return g;
  }
  if (p.t === 'cyl') {
    const g = new THREE.CylinderGeometry((p.r2 ?? p.r) * MM, p.r * MM, p.h * MM, 20);
    const axis = p.axis ?? 'z';
    if (axis === 'z') g.translate((ox + p.x) * MM, (p.z + p.h / 2) * MM, (oz + p.y) * MM);
    else if (axis === 'x') {
      g.rotateZ(-Math.PI / 2);
      g.translate((ox + p.x + p.h / 2) * MM, p.z * MM, (oz + p.y) * MM);
    } else {
      g.rotateX(Math.PI / 2);
      g.translate((ox + p.x) * MM, p.z * MM, (oz + p.y + p.h / 2) * MM);
    }
    return g;
  }
  const g = new THREE.SphereGeometry(p.r * MM, 16, 12);
  g.translate((ox + p.x) * MM, p.z * MM, (oz + p.y) * MM);
  return g;
}

/** Собрать набор примитивов в группу, слив геометрию по материалам. */
export function primsToGroup(prims: Prim3[], s: { w: number; d: number }): THREE.Group {
  const g = new THREE.Group();
  const byMat = new Map<string, { geos: THREE.BufferGeometry[]; c: string; m: Mat3 | undefined }>();
  for (const p of prims) {
    const key = `${p.c}|${p.m ?? ''}`;
    let e = byMat.get(key);
    if (!e) {
      e = { geos: [], c: p.c, m: p.m };
      byMat.set(key, e);
    }
    const geo = primGeometry(p, s);
    e.geos.push(geo.index ? geo.toNonIndexed() : geo);
  }
  for (const e of byMat.values()) {
    const merged = e.geos.length > 1 ? mergeGeometries(e.geos, false) : e.geos[0];
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, partMaterial(e.c, e.m));
    mesh.castShadow = e.m !== 'glass';
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

/** Примитивы изделия из конструктора (детали корпуса). */
export function cabinetPrims(project: Project, designId: string): { prims: Prim3[]; w: number; d: number } | null {
  const design = project.cabinets.find((c) => c.id === designId);
  if (!design) return null;
  const res = generateCabinet(design, project.cabinetCatalog);
  const prims: Prim3[] = [];
  for (const part of res.parts) {
    if (!part.box) continue;
    if (part.role === 'slidingProfile') {
      prims.push({ t: 'box', x: part.box.x, y: part.box.y, z: part.box.z, w: part.box.sx, d: part.box.sy, h: part.box.sz, c: '#b8bcc2', m: 'metal' });
      continue;
    }
    const board = project.cabinetCatalog.boards.find((b) => b.id === part.materialId);
    const isFacade = part.role === 'facade' || part.role === 'drawerFront' || part.role === 'slidingDoor';
    prims.push({ t: 'box', x: part.box.x, y: part.box.y, z: part.box.z, w: part.box.sx, d: part.box.sy, h: part.box.sz, c: isFacade && design.color ? design.color : (board?.color ?? '#cdb58a'), m: 'wood' });
  }
  return { prims, w: design.width, d: res.overallDepth };
}

/** 3D-объект для Item (без пользовательских моделей — они грузятся асинхронно в сцене). */
export function buildItemObject(project: Project, item: Item, baseY = 0): THREE.Group | null {
  const def = itemDef(item.kind);
  const s = itemSize(item);
  let group: THREE.Group | null = null;
  if (item.kind === 'cabinet') {
    const cp = cabinetPrims(project, String(item.params.designId));
    if (cp) group = primsToGroup(cp.prims, cp);
  } else if (def?.parts) {
    group = primsToGroup(def.parts(item.params, s), s);
  }
  if (!group) return null;
  group.position.set(item.x * MM, (baseY + item.z) * MM, item.y * MM);
  group.rotation.y = (-item.rot * Math.PI) / 180;
  return group;
}

// ───────── Трассы и зоны ─────────

export function buildRouteObject(route: Route, baseY = 0, colorOverride?: string): THREE.Group | null {
  const def = routeDef(route.kind);
  if (!def || route.points.length < 2) return null;
  const color = colorOverride ?? (typeof def.color === 'function' ? def.color(route.params) : def.color);
  const g = new THREE.Group();
  const width = def.width?.(route.params);
  const fenceH = num(route.params, 'h', 0);
  const geos: THREE.BufferGeometry[] = [];
  const z = num(route.params, 'z', 0);
  const dia = Math.max(12, num(route.params, 'dia', num(route.params, 'd', 20)));
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1];
    const b = route.points[i];
    const L = dist(a, b);
    if (L < 1) continue;
    let geo: THREE.BufferGeometry;
    if (def.layer === 'landscape' && fenceH > 0) geo = new THREE.BoxGeometry(L * MM, fenceH * MM, 0.05);
    else if (width) geo = new THREE.BoxGeometry((L + width) * MM, 0.03, width * MM);
    else geo = new THREE.BoxGeometry(L * MM, dia * MM, dia * MM);
    const yc = def.layer === 'landscape' ? (fenceH > 0 ? fenceH / 2 : 15) : z;
    geo.rotateY(-Math.atan2(b.y - a.y, b.x - a.x));
    geo.translate(((a.x + b.x) / 2) * MM, (baseY + yc) * MM, ((a.y + b.y) / 2) * MM);
    geos.push(geo);
  }
  if (!geos.length) return null;
  const mesh = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos, false) : geos[0], partMaterial(color, fenceH > 0 ? 'wood' : 'matte'));
  mesh.castShadow = fenceH > 0;
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

export function buildZoneObject(zone: Zone, baseY = 0): THREE.Group | null {
  const def = zoneDef(zone.kind);
  if (!def || zone.points.length < 3) return null;
  const g = new THREE.Group();
  const depth = num(zone.params, 'depth', 0);
  const height = num(zone.params, 'h', 0);
  const isWater = zone.kind === 'pool';
  const y = (baseY + (isWater ? -150 : height > 0 ? height : def.layer === 'landscape' ? 12 : 6)) * MM;
  const mesh = new THREE.Mesh(polygonGeometry(zone.points, y, true), partMaterial(def.color, isWater ? 'water' : 'matte'));
  mesh.receiveShadow = true;
  g.add(mesh);
  if (height > 0 || (isWater && depth > 0)) {
    // боковые грани (терраса / чаша бассейна)
    const geos: THREE.BufferGeometry[] = [];
    const hh = isWater ? depth : height;
    for (let i = 0; i < zone.points.length; i++) {
      const a = zone.points[i];
      const b = zone.points[(i + 1) % zone.points.length];
      const L = dist(a, b);
      if (L < 1) continue;
      const geo = new THREE.BoxGeometry(L * MM, hh * MM, 0.04);
      geo.rotateY(-Math.atan2(b.y - a.y, b.x - a.x));
      geo.translate(((a.x + b.x) / 2) * MM, (baseY + (isWater ? -hh / 2 : hh / 2)) * MM, ((a.y + b.y) / 2) * MM);
      geos.push(geo);
    }
    if (geos.length) g.add(new THREE.Mesh(mergeGeometries(geos, false), partMaterial(isWater ? '#9fd3e6' : '#a08467')));
  }
  return g;
}

// ───────── Крыша ─────────

export function buildRoof(project: Project): THREE.Group | null {
  const top = project.levels[project.levels.length - 1];
  if (!top || project.roof.type === 'none') return null;
  const { outline } = detectRooms(top.walls);
  const pts = outline.flat();
  if (pts.length < 3) return null;
  const bb = bbox(pts);
  const ov = project.roof.overhang;
  const x0 = (bb.minX - ov) * MM;
  const x1 = (bb.maxX + ov) * MM;
  const z0 = (bb.minY - ov) * MM;
  const z1 = (bb.maxY + ov) * MM;
  const y0 = (top.elevation + top.height + top.slab) * MM;
  const g = new THREE.Group();
  g.name = 'roof';
  const mat = partMaterial('#7a3b2e');
  const matSide = new THREE.MeshStandardMaterial({ color: '#7a3b2e', roughness: 0.8, side: THREE.DoubleSide });
  const tan = Math.tan((project.roof.pitch * Math.PI) / 180);
  if (project.roof.type === 'flat') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.25, z1 - z0), partMaterial('#6b7280'));
    m.position.set((x0 + x1) / 2, y0 + 0.125, (z0 + z1) / 2);
    g.add(m);
    return g;
  }
  const alongX = x1 - x0 >= z1 - z0; // конёк вдоль длинной стороны
  const span = alongX ? z1 - z0 : x1 - x0;
  const rise = (span / 2) * tan;
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const tris: THREE.Vector3[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tris.push(a, b, c, a, c, d);
  const inset = project.roof.type === 'hip' ? Math.min(span / 2, (alongX ? x1 - x0 : z1 - z0) / 2) : 0;
  if (alongX) {
    const zm = (z0 + z1) / 2;
    const r0 = P(x0 + inset, y0 + rise, zm);
    const r1 = P(x1 - inset, y0 + rise, zm);
    quad(P(x0, y0, z0), P(x1, y0, z0), r1, r0);
    quad(P(x1, y0, z1), P(x0, y0, z1), r0, r1);
    tris.push(P(x0, y0, z1), P(x0, y0, z0), r0, P(x1, y0, z0), P(x1, y0, z1), r1);
  } else {
    const xm = (x0 + x1) / 2;
    const r0 = P(xm, y0 + rise, z0 + inset);
    const r1 = P(xm, y0 + rise, z1 - inset);
    quad(P(x0, y0, z1), P(x0, y0, z0), r0, r1);
    quad(P(x1, y0, z0), P(x1, y0, z1), r1, r0);
    tris.push(P(x0, y0, z0), P(x1, y0, z0), r0, P(x1, y0, z1), P(x0, y0, z1), r1);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(tris);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, project.roof.type === 'gable' ? matSide : mat);
  mesh.material = matSide;
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

// ───────── Участок ─────────

/** Высота рельефа в точке (обратные взвешенные расстояния по отметкам вершин границы), мм. */
export function terrainHeight(boundary: Vec2[], elevations: number[], p: Vec2): number {
  let sw = 0;
  let sh = 0;
  for (let i = 0; i < boundary.length; i++) {
    const d = Math.max(1, dist(p, boundary[i]));
    const w = 1 / (d * d);
    sw += w;
    sh += w * (elevations[i] ?? 0);
  }
  return sw > 0 ? sh / sw : 0;
}

export function buildSiteGround(project: Project): THREE.Group | null {
  const site = project.site;
  if (!site || site.boundary.length < 3) return null;
  const g = new THREE.Group();
  g.name = 'ground';
  const flat = site.elevations.every((e) => !e);
  const shape = new THREE.Shape(site.boundary.map((p) => new THREE.Vector2(p.x * MM, p.y * MM)));
  let geo: THREE.BufferGeometry;
  if (flat) geo = polygonGeometry(site.boundary, -0.03, true);
  else {
    // триангуляция с уплотнением: сетка точек внутри границы
    const bb = bbox(site.boundary);
    const step = Math.max(1000, Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) / 24);
    const nx = Math.ceil((bb.maxX - bb.minX) / step);
    const ny = Math.ceil((bb.maxY - bb.minY) / step);
    const pos: number[] = [];
    const hAt = (x: number, y: number) => (terrainHeight(site.boundary, site.elevations, { x, y }) - 30) * MM;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const xa = bb.minX + i * step;
        const xb = Math.min(bb.maxX, xa + step);
        const ya = bb.minY + j * step;
        const yb = Math.min(bb.maxY, ya + step);
        const q = [
          [xa, ya],
          [xb, ya],
          [xb, yb],
          [xa, yb],
        ];
        for (const k of [0, 2, 1, 0, 3, 2]) pos.push(q[k][0] * MM, hAt(q[k][0], q[k][1]), q[k][1] * MM);
      }
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    void shape;
  }
  const mesh = new THREE.Mesh(geo, partMaterial('#8fae7c', 'leaf'));
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

// ───────── Вся сцена (для экспорта glTF) ─────────

export function buildProjectGroup(project: Project): THREE.Group {
  const root = new THREE.Group();
  root.name = project.name;
  for (const level of project.levels) {
    const lg = new THREE.Group();
    lg.name = level.name;
    lg.position.y = level.elevation * MM;
    lg.add(buildWalls(project, level));
    lg.add(buildFloors(project, level, true));
    for (const it of level.items) {
      const o = buildItemObject(project, it);
      if (o) lg.add(o);
    }
    for (const r of level.routes) {
      const o = buildRouteObject(r);
      if (o) lg.add(o);
    }
    root.add(lg);
  }
  const roof = buildRoof(project);
  if (roof) root.add(roof);
  if (project.site) {
    const ground = buildSiteGround(project);
    if (ground) root.add(ground);
    for (const it of project.site.items) {
      const o = buildItemObject(project, it, terrainHeight(project.site.boundary, project.site.elevations, it));
      if (o) root.add(o);
    }
    for (const r of project.site.routes) {
      const o = buildRouteObject(r);
      if (o) root.add(o);
    }
    for (const z of project.site.zones) {
      const o = buildZoneObject(z);
      if (o) root.add(o);
    }
  }
  return root;
}

/** Сплошные отрезки стен для коллизий прогулки: [a, b, полутолщина] в мм. */
export function collisionSegments(level: Level): { a: Vec2; b: Vec2; h: number }[] {
  const out: { a: Vec2; b: Vec2; h: number }[] = [];
  for (const w of level.walls) {
    const L = wallLength(w);
    if (L < 1) continue;
    const dir = norm(sub(w.b, w.a));
    const gaps = level.openings
      .filter((o) => o.wallId === w.id && o.kind !== 'window')
      .map((o) => [o.pos - o.width / 2, o.pos + o.width / 2])
      .sort((p, q) => p[0] - q[0]);
    let cur = 0;
    const push = (s0: number, s1: number) => {
      if (s1 - s0 > 1) out.push({ a: add(w.a, mul(dir, s0)), b: add(w.a, mul(dir, s1)), h: w.thickness / 2 });
    };
    for (const [g0, g1] of gaps) {
      push(cur, Math.max(cur, g0));
      cur = Math.max(cur, g1);
    }
    push(cur, L);
  }
  return out;
}

export type { Room };
