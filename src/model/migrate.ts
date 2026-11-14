import { defaultCabinetCatalog } from '../cabinet/catalog';
import { defaultFinishes } from '../catalog/finishes';
import { SCHEMA_VERSION, defaultGroups } from './defaults';
import type { Project } from './types';

/** Привести загруженный проект к текущей схеме, дозаполнив отсутствующие поля. */
export function migrateProject(raw: Project): Project {
  const p = { ...raw } as Project;
  const from = raw.schema ?? 1;
  p.schema = SCHEMA_VERSION;
  p.levels = (p.levels ?? []).map((l) => ({
    ...l,
    slab: l.slab ?? 200,
    walls: l.walls ?? [],
    openings: l.openings ?? [],
    rooms: l.rooms ?? [],
    items: l.items ?? [],
    routes: l.routes ?? [],
    zones: l.zones ?? [],
    dims: l.dims ?? [],
    underlay: l.underlay ?? null,
  }));
  p.site = p.site ?? null;
  if (p.site) {
    p.site = { ...p.site, items: p.site.items ?? [], routes: p.site.routes ?? [], zones: p.site.zones ?? [], elevations: p.site.elevations ?? p.site.boundary.map(() => 0) };
  }
  p.finishes = p.finishes?.length ? p.finishes : defaultFinishes();
  p.cabinets = p.cabinets ?? [];
  p.cabinetCatalog = p.cabinetCatalog ?? defaultCabinetCatalog();
  if (from < 2) {
    // v2: ЛДСП 10 мм для наполнения дверей-купе; статусы стен
    const add = defaultCabinetCatalog().boards.filter((b) => b.id === 'ldsp10' && !p.cabinetCatalog.boards.some((x) => x.id === b.id));
    if (add.length) p.cabinetCatalog = { ...p.cabinetCatalog, boards: [...add, ...p.cabinetCatalog.boards] };
    const baseIds = new Set((p.baseline ?? []).map((b) => b.id));
    p.levels = p.levels.map((l) => ({
      ...l,
      walls: l.walls.map((w) => (w.status ? w : { ...w, status: p.kind === 'apartment' && (!p.baseline || baseIds.has(w.id)) ? ('existing' as const) : ('new' as const) })),
    }));
  }
  if (from < 3) {
    // v3: библиотека текстур и параметры материалов — стандартные позиции дополняются новыми полями
    // (текстура, рулон, раппорт, класс), пользовательские значения не затираются; новые позиции добавляются
    const defs = defaultFinishes();
    const byId = new Map(defs.map((f) => [f.id, f]));
    const have = new Set(p.finishes.map((f) => f.id));
    p.finishes = [...p.finishes.map((f) => (byId.has(f.id) ? { ...byId.get(f.id)!, ...f } : f)), ...defs.filter((f) => !have.has(f.id))];
    // декоры ЛДСП: текстуры стандартным плитам, новые декоры — в каталог
    const boards = defaultCabinetCatalog().boards;
    const haveB = new Set(p.cabinetCatalog.boards.map((b) => b.id));
    p.cabinetCatalog = {
      ...p.cabinetCatalog,
      boards: [...p.cabinetCatalog.boards.map((b) => ({ ...b, textureId: b.textureId ?? boards.find((x) => x.id === b.id)?.textureId })), ...boards.filter((b) => !haveB.has(b.id))],
    };
  }
  p.models = p.models ?? [];
  p.electrical = p.electrical ?? { groups: defaultGroups() };
  p.baseline = p.baseline ?? null;
  p.ruleOverrides = p.ruleOverrides ?? {};
  p.prices = p.prices ?? {};
  p.reserves = p.reserves ?? {};
  p.roof = p.roof ?? { type: 'none', pitch: 30, overhang: 500 };
  p.sun = p.sun ?? { month: 6, day: 21, hour: 14, enabled: false };
  p.stamp = p.stamp ?? { object: p.name, address: '', author: '', customer: '' };
  p.gridStep = p.gridStep ?? 100;
  return p;
}
