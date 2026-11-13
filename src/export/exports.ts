// Экспорт: PDF (чертежи), DXF (план), glTF (3D), файл проекта.
import { itemDef, routeDef } from '../catalog/registry';
import { autoDimPrims, dimEntityPrims, itemPrims, openingPrims, roomLabelPrims, routePrims, wallsPrims } from '../draw2d/plan';
import { toDxf } from '../drawings/dxf';
import type { DxfLayer } from '../drawings/dxf';
import { loadPdfFonts, sheetsToPdf } from '../drawings/pdf';
import { buildSheet } from '../drawings/sheet';
import type { SheetSpec } from '../drawings/sheet';
import type { Lang, LayerId, Level, Project } from '../model/types';
import { geomOf } from '../model/walls';
import { projectToFile } from '../store/persistence';
import { download, safeName } from './csv';

export async function exportPdf(p: Project, specs: SheetSpec[], lang: Lang, filename?: string): Promise<void> {
  const fonts = await loadPdfFonts();
  const sheets = specs.map((s, i) => buildSheet(p, s, lang, i + 1));
  const doc = sheetsToPdf(sheets, fonts);
  download(filename ?? `${safeName(p.name)}.pdf`, doc.output('blob'));
}

/** DXF-слои плана этажа в мм модели. */
export function planDxfLayers(p: Project, level: Level, k = 50): DxfLayer[] {
  const gm = geomOf(level);
  const layers: DxfLayer[] = [{ name: 'WALLS', color: 7, prims: wallsPrims(gm.walls, gm.openings, true) }];
  const ops: DxfLayer = { name: 'OPENINGS', color: 4, prims: [] };
  for (const o of gm.openings) {
    const w = gm.walls.find((x) => x.id === o.wallId);
    if (w) ops.prims.push(...openingPrims(o, w));
  }
  layers.push(ops);
  const byLayer: Record<string, DxfLayer> = {};
  const colors: Partial<Record<LayerId, number>> = { furniture: 8, electrical: 1, plumbing: 5, heating: 30, gas: 2, ventilation: 4, landscape: 3 };
  const get = (layer: LayerId) => (byLayer[layer] ??= { name: layer.toUpperCase(), color: colors[layer] ?? 7, prims: [] });
  for (const it of level.items) get(itemDef(it.kind)?.layer ?? 'furniture').prims.push(...itemPrims(it));
  for (const r of level.routes) get(routeDef(r.kind)?.layer ?? 'electrical').prims.push(...routePrims(r, k));
  layers.push(...Object.values(byLayer));
  layers.push({ name: 'ROOMS', color: 3, prims: level.rooms.flatMap((r) => roomLabelPrims(r, k)) });
  layers.push({ name: 'DIMENSIONS', color: 6, prims: [...autoDimPrims(level, k), ...level.dims.flatMap((d) => dimEntityPrims(d, k))] });
  return layers;
}

export function exportDxf(p: Project, level: Level): void {
  download(`${safeName(p.name)}_${safeName(level.name)}.dxf`, toDxf(planDxfLayers(p, level), 50), 'application/dxf');
}

export async function exportGltf(p: Project): Promise<void> {
  const [{ GLTFExporter }, { buildProjectGroup }] = await Promise.all([import('three/examples/jsm/exporters/GLTFExporter.js'), import('../view3d/build')]);
  const group = buildProjectGroup(p);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(group, { binary: true });
  download(`${safeName(p.name)}.glb`, result as ArrayBuffer, 'model/gltf-binary');
}

export function exportProjectFile(p: Project): void {
  download(`${safeName(p.name)}.json`, projectToFile(p), 'application/json');
}
