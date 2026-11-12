import { defaultCabinetCatalog } from '../cabinet/catalog';
import { defaultFinishes } from '../catalog/finishes';
import { SCHEMA_VERSION, defaultGroups } from './defaults';
import type { Project } from './types';

/** Привести загруженный проект к текущей схеме, дозаполнив отсутствующие поля. */
export function migrateProject(raw: Project): Project {
  const p = { ...raw } as Project;
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
