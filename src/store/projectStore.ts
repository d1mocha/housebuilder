// Хранилище модели: единственный источник правды, транзакции и undo/redo.
import { produce } from 'immer';
import { create } from 'zustand';
import { createProject, roomDefaults } from '../model/defaults';
import type { Project } from '../model/types';
import { syncRooms } from '../model/walls';

const HISTORY_LIMIT = 100;

export type Recipe = (draft: Project) => void;

/** Применить изменение и пересчитать производные данные (помещения) на этажах с изменёнными стенами. */
export function applyRecipe(base: Project, fn: Recipe): Project {
  let next = produce(base, fn);
  if (next === base) return base;
  const changed = new Set<string>();
  for (const l of next.levels) {
    const o = base.levels.find((x) => x.id === l.id);
    if (!o || o.walls !== l.walls) changed.add(l.id);
  }
  if (changed.size) {
    next = produce(next, (d) => {
      for (const l of d.levels) if (changed.has(l.id)) syncRooms(l, roomDefaults());
    });
  }
  return next;
}

interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  /** Базовое состояние открытой транзакции (перетаскивание). */
  txBase: Project | null;
  /** Счётчик изменений для автосохранения. */
  rev: number;
  setProject: (p: Project) => void;
  /** Атомарное изменение с записью в историю. */
  update: (fn: Recipe) => void;
  /** Изменение без записи в историю (настройки вида и т.п.). */
  patch: (fn: Recipe) => void;
  begin: () => void;
  /** Промежуточное изменение: применяется к базе транзакции. */
  transient: (fn: Recipe) => void;
  commit: () => void;
  cancel: () => void;
  undo: () => void;
  redo: () => void;
}

export const useProject = create<ProjectState>((set, get) => ({
  project: createProject('apartment', 'Новий проєкт'),
  past: [],
  future: [],
  txBase: null,
  rev: 0,

  setProject: (p) => {
    // Пересчитать помещения на случай импорта файла без производных данных.
    const fixed = produce(p, (d) => {
      for (const l of d.levels) syncRooms(l, roomDefaults());
    });
    set({ project: fixed, past: [], future: [], txBase: null, rev: get().rev + 1 });
  },

  update: (fn) => {
    const { project, past, rev } = get();
    const next = applyRecipe(project, (d) => {
      fn(d);
      d.updatedAt = Date.now();
    });
    if (next === project) return;
    set({ project: next, past: [...past, project].slice(-HISTORY_LIMIT), future: [], rev: rev + 1 });
  },

  patch: (fn) => {
    const { project, rev } = get();
    const next = applyRecipe(project, fn);
    if (next !== project) set({ project: next, rev: rev + 1 });
  },

  begin: () => {
    if (!get().txBase) set({ txBase: get().project });
  },

  transient: (fn) => {
    const base = get().txBase ?? get().project;
    if (!get().txBase) set({ txBase: base });
    set({ project: applyRecipe(base, fn) });
  },

  commit: () => {
    const { txBase, project, past, rev } = get();
    if (!txBase) return;
    if (txBase === project) {
      set({ txBase: null });
      return;
    }
    const stamped = produce(project, (d) => {
      d.updatedAt = Date.now();
    });
    set({ project: stamped, past: [...past, txBase].slice(-HISTORY_LIMIT), future: [], txBase: null, rev: rev + 1 });
  },

  cancel: () => {
    const { txBase } = get();
    if (txBase) set({ project: txBase, txBase: null });
  },

  undo: () => {
    const { past, project, future, rev, txBase } = get();
    if (txBase || past.length === 0) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], rev: rev + 1 });
  },

  redo: () => {
    const { past, project, future, rev, txBase } = get();
    if (txBase || future.length === 0) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1), rev: rev + 1 });
  },
}));

export const getProject = () => useProject.getState().project;
