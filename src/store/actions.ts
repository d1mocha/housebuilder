// Действия над выделением, общие для горячих клавиш, контекстного меню, панели свойств и 3D.
import { duplicateEntity, layerOfSel, removeEntity, rotateEntities, moveEntities, selsInRect } from '../model/ops';
import type { Sel } from '../model/types';
import { useProject } from './projectStore';
import { MODE_LAYERS, modeOfLayer, useUi } from './uiStore';

/** Выделить объект, переключив режим работы на тот, которому принадлежит его слой. */
export function selectWithMode(sel: Sel): void {
  const ui = useUi.getState();
  const mode = modeOfLayer(layerOfSel(useProject.getState().project, sel));
  if (mode !== ui.mode) ui.set({ mode, tool: 'select', toolKind: null });
  useUi.getState().select(sel);
}

const movable = (s: Sel) => s.type !== 'room' && s.type !== 'site';

export function deleteSelection(): void {
  const ui = useUi.getState();
  const sels = ui.multi.filter(movable);
  if (!sels.length) return;
  useProject.getState().update((d) => {
    for (const s of sels) removeEntity(d, s);
  });
  ui.select(null);
}

export function duplicateSelection(): void {
  const ui = useUi.getState();
  const sels = ui.multi.filter(movable);
  if (!sels.length) return;
  const created: Sel[] = [];
  useProject.getState().update((d) => {
    for (const s of sels) {
      const n = duplicateEntity(d, s);
      if (n) created.push(n);
    }
  });
  if (created.length) ui.selectMany(created);
}

export function rotateSelection(deg: number): void {
  const sels = useUi.getState().multi;
  if (!sels.some((s) => s.type === 'item')) return;
  useProject.getState().update((d) => rotateEntities(d, sels, deg));
}

export function nudgeSelection(dx: number, dy: number): void {
  const sels = useUi.getState().multi.filter(movable);
  if (!sels.length) return;
  useProject.getState().update((d) => moveEntities(d, sels, { x: dx, y: dy }));
}

/** Ctrl+A: все объекты активного режима на текущем этаже (и участке — в режиме «Ділянка»). */
export function selectAllInMode(): void {
  const ui = useUi.getState();
  const p = useProject.getState().project;
  const layers = MODE_LAYERS[ui.mode].filter((l) => ui.layers[l].visible && !ui.layers[l].locked);
  const all = selsInRect(p, ui.activeLevelId, { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 }, layers, false);
  ui.selectMany(all);
}
