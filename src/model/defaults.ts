import { defaultCabinetCatalog } from '../cabinet/catalog';
import { DEFAULT_CEILING_FINISH, DEFAULT_FLOOR_FINISH, DEFAULT_WALL_FINISH, defaultFinishes, wallMaterial } from '../catalog/finishes';
import { newId } from './ids';
import type { ElGroup, ElementStatus, Level, Opening, Project, ProjectKind, Site, Vec2, Wall } from './types';

export const SCHEMA_VERSION = 2;

export function createLevel(name: string, elevation = 0, height = 2700): Level {
  return {
    id: newId('lvl'),
    name,
    elevation,
    height,
    slab: 200,
    walls: [],
    openings: [],
    rooms: [],
    items: [],
    routes: [],
    zones: [],
    dims: [],
    underlay: null,
  };
}

export function createWall(a: Vec2, b: Vec2, opts: Partial<Wall> = {}): Wall {
  const material = opts.material ?? 'brick';
  return {
    id: newId('w'),
    a: { x: Math.round(a.x), y: Math.round(a.y) },
    b: { x: Math.round(b.x), y: Math.round(b.y) },
    thickness: opts.thickness ?? wallMaterial(material).thickness,
    material,
    loadBearing: opts.loadBearing ?? false,
    exterior: opts.exterior ?? false,
    finishL: opts.finishL ?? DEFAULT_WALL_FINISH,
    finishR: opts.finishR ?? DEFAULT_WALL_FINISH,
    ...(opts.height ? { height: opts.height } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.arc ? { arc: opts.arc } : {}),
  };
}

/**
 * Статус новой стены: пока в квартире не зафиксировано существующее состояние, стены считаются
 * существующими (идёт обводка техпаспорта); после фиксации и в доме — новыми.
 */
export function defaultWallStatus(p: Pick<Project, 'kind' | 'baseline'>): ElementStatus {
  return p.kind === 'apartment' && !p.baseline ? 'existing' : 'new';
}

export function createOpening(wallId: string, kind: Opening['kind'], pos: number, opts: Partial<Opening> = {}): Opening {
  const base: Record<Opening['kind'], Partial<Opening>> = {
    door: { width: 800, height: 2000, sill: 0 },
    window: { width: 1300, height: 1400, sill: 850 },
    portal: { width: 900, height: 2100, sill: 0 },
  };
  return {
    id: newId('o'),
    wallId,
    kind,
    pos,
    width: 800,
    height: 2000,
    sill: 0,
    hinge: 'a',
    swing: 'L',
    style: 'single',
    sashes: 2,
    ...base[kind],
    ...opts,
  };
}

export function defaultGroups(): ElGroup[] {
  return [
    { id: 'g-light', name: 'Освітлення', breaker: 10, section: 1.5, cores: 3, rcd: false, color: '#f59e0b' },
    { id: 'g-sockets', name: 'Розетки', breaker: 16, section: 2.5, cores: 3, rcd: true, color: '#ef4444' },
    { id: 'g-kitchen', name: 'Кухня', breaker: 16, section: 2.5, cores: 3, rcd: true, color: '#8b5cf6' },
    { id: 'g-cooker', name: 'Варильна поверхня', breaker: 32, section: 6, cores: 3, rcd: true, color: '#0ea5e9' },
  ];
}

export function createSite(): Site {
  // Участок 6 соток: 20 × 30 м вокруг начала координат.
  return {
    boundary: [
      { x: -6000, y: -9000 },
      { x: 14000, y: -9000 },
      { x: 14000, y: 21000 },
      { x: -6000, y: 21000 },
    ],
    elevations: [0, 0, 0, 0],
    north: 0,
    latitude: 50.45,
    items: [],
    routes: [],
    zones: [],
  };
}

export function createProject(kind: ProjectKind, name: string): Project {
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION,
    id: newId('prj'),
    name,
    kind,
    createdAt: now,
    updatedAt: now,
    levels: [createLevel(kind === 'house' ? '1 поверх' : 'Квартира', 0, kind === 'house' ? 2800 : 2600)],
    site: kind === 'house' ? createSite() : null,
    finishes: defaultFinishes(),
    cabinets: [],
    cabinetCatalog: defaultCabinetCatalog(),
    models: [],
    electrical: { groups: defaultGroups() },
    baseline: null,
    ruleOverrides: {},
    prices: {},
    reserves: {},
    roof: { type: kind === 'house' ? 'gable' : 'none', pitch: 30, overhang: 500 },
    sun: { month: 6, day: 21, hour: 14, enabled: false },
    stamp: { object: name, address: '', author: '', customer: '' },
    gridStep: 100,
  };
}

export const roomDefaults = (lang: 'uk' | 'ru' = 'uk') => ({
  floorFinish: DEFAULT_FLOOR_FINISH,
  ceilingFinish: DEFAULT_CEILING_FINISH,
  namePrefix: lang === 'ru' ? 'Помещение' : 'Приміщення',
});
