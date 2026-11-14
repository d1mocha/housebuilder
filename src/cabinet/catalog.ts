import type { BoardMaterial, CabinetCatalog, EdgeBand } from './types';

export const SHEET_L = 2800;
export const SHEET_W = 2070;

export function defaultCabinetCatalog(): CabinetCatalog {
  const boards: BoardMaterial[] = [
    { id: 'ldsp10', name: { uk: 'ЛДСП 10 мм (наповнення дверей-купе)', ru: 'ЛДСП 10 мм (наполнение дверей-купе)' }, kind: 'ldsp', thickness: 10, sheetL: SHEET_L, sheetW: SHEET_W, grain: true, color: '#b89572', textureId: 'wood-oak-natural' },
    { id: 'ldsp16', name: { uk: 'ЛДСП 16 мм', ru: 'ЛДСП 16 мм' }, kind: 'ldsp', thickness: 16, sheetL: SHEET_L, sheetW: SHEET_W, grain: true, color: '#cfa57c', textureId: 'wood-maple' },
    { id: 'ldsp18', name: { uk: 'ЛДСП 18 мм', ru: 'ЛДСП 18 мм' }, kind: 'ldsp', thickness: 18, sheetL: SHEET_L, sheetW: SHEET_W, grain: true, color: '#b08c6c', textureId: 'wood-oak-natural' },
    { id: 'ldsp18-walnut', name: { uk: 'ЛДСП 18 мм «горіх»', ru: 'ЛДСП 18 мм «орех»' }, kind: 'ldsp', thickness: 18, sheetL: SHEET_L, sheetW: SHEET_W, grain: true, color: '#6a4322', textureId: 'wood-walnut' },
    { id: 'ldsp18-wenge', name: { uk: 'ЛДСП 18 мм «венге»', ru: 'ЛДСП 18 мм «венге»' }, kind: 'ldsp', thickness: 18, sheetL: SHEET_L, sheetW: SHEET_W, grain: true, color: '#41342e', textureId: 'wood-wenge' },
    { id: 'ldsp18-grey', name: { uk: 'ЛДСП 18 мм «дуб сірий»', ru: 'ЛДСП 18 мм «дуб серый»' }, kind: 'ldsp', thickness: 18, sheetL: SHEET_L, sheetW: SHEET_W, grain: true, color: '#7b634e', textureId: 'wood-oak-grey' },
    { id: 'ldsp18w', name: { uk: 'ЛДСП 18 мм біла', ru: 'ЛДСП 18 мм белая' }, kind: 'ldsp', thickness: 18, sheetL: SHEET_L, sheetW: SHEET_W, grain: false, color: '#f1f1ee' },
    { id: 'mdf16', name: { uk: 'МДФ 16 мм', ru: 'МДФ 16 мм' }, kind: 'mdf', thickness: 16, sheetL: SHEET_L, sheetW: SHEET_W, grain: false, color: '#e7e2d8' },
    { id: 'mdf19', name: { uk: 'МДФ 19 мм', ru: 'МДФ 19 мм' }, kind: 'mdf', thickness: 19, sheetL: SHEET_L, sheetW: SHEET_W, grain: false, color: '#dcd6ca' },
    { id: 'hdf3', name: { uk: 'ХДФ 3 мм', ru: 'ХДФ 3 мм' }, kind: 'hdf', thickness: 3, sheetL: SHEET_L, sheetW: SHEET_W, grain: false, color: '#efe9dc' },
  ];
  const bands: EdgeBand[] = [
    { id: 'pvc04', name: { uk: 'Крайка ПВХ 0,4 мм', ru: 'Кромка ПВХ 0,4 мм' }, thickness: 0.4, material: 'pvc', color: '#cdb58a' },
    { id: 'pvc08', name: { uk: 'Крайка ПВХ 0,8 мм', ru: 'Кромка ПВХ 0,8 мм' }, thickness: 0.8, material: 'pvc', color: '#cdb58a' },
    { id: 'abs1', name: { uk: 'Крайка ABS 1 мм', ru: 'Кромка ABS 1 мм' }, thickness: 1, material: 'abs', color: '#cdb58a' },
    { id: 'pvc2', name: { uk: 'Крайка ПВХ 2 мм', ru: 'Кромка ПВХ 2 мм' }, thickness: 2, material: 'pvc', color: '#cdb58a' },
    { id: 'abs2', name: { uk: 'Крайка ABS 2 мм', ru: 'Кромка ABS 2 мм' }, thickness: 2, material: 'abs', color: '#cdb58a' },
  ];
  return { boards, bands, kerf: 4, trim: 10, edgeMinThickness: 0 };
}
