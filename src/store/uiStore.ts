// Состояние интерфейса (не входит в модель проекта).
import { create } from 'zustand';
import type { Lang, LayerId, Sel, Vec2 } from '../model/types';

export type ToolId = 'select' | 'wall' | 'arc' | 'room' | 'door' | 'window' | 'portal' | 'dim' | 'measure' | 'item' | 'route' | 'zone' | 'calibrate';

export type ViewMode = '2d' | '3d' | 'split';

export type DialogId = null | 'new' | 'projects' | 'rules' | 'estimate' | 'drawings' | 'cabinet' | 'finishes' | 'groups' | 'help' | 'settings';

/** Режим работы: определяет, какие слои активны (видны полностью и кликабельны). */
export type Mode = 'plan' | 'furniture' | 'electrical' | 'water' | 'heating' | 'site';

export const MODE_LAYERS: Record<Mode, LayerId[]> = {
  plan: ['walls', 'rooms', 'dimensions', 'underlay'],
  furniture: ['furniture'],
  electrical: ['electrical'],
  water: ['plumbing'],
  heating: ['heating', 'gas', 'ventilation'],
  site: ['landscape'],
};

export const modeOfLayer = (layer: LayerId): Mode => (Object.keys(MODE_LAYERS) as Mode[]).find((m) => MODE_LAYERS[m].includes(layer)) ?? 'plan';

export interface LayerState {
  visible: boolean;
  locked: boolean;
}

export const LAYER_ORDER: LayerId[] = ['walls', 'rooms', 'furniture', 'electrical', 'plumbing', 'heating', 'gas', 'ventilation', 'landscape', 'dimensions', 'underlay'];

const defaultLayers = (): Record<LayerId, LayerState> => Object.fromEntries(LAYER_ORDER.map((l) => [l, { visible: true, locked: false }])) as Record<LayerId, LayerState>;

const LS_KEY = 'hb.ui';

interface Persisted {
  lang: Lang;
  hintsSeen: string[];
  /** Подсказки отключены совсем («не показувати більше»). */
  hintsOff: boolean;
  lastProjectId: string | null;
  /** Избранные объекты каталога (kind). */
  favorites: string[];
}

const PERSIST_DEFAULT: Persisted = { lang: 'uk', hintsSeen: [], hintsOff: false, lastProjectId: null, favorites: [] };

function loadPersisted(): Persisted {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (raw) return { ...PERSIST_DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...PERSIST_DEFAULT };
}

function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const sameSel = (a: Sel, b: Sel) => a.type === b.type && a.id === b.id && a.scope === b.scope;

interface UiState extends Persisted {
  tool: ToolId;
  /** Вид размещаемого объекта / трассы / зоны. */
  toolKind: string | null;
  /** Параметры размещаемого объекта (изделие конструктора, пользовательская модель). */
  toolParams: Record<string, number | string | boolean>;
  /** Основной выделенный объект (последний). */
  selection: Sel | null;
  /** Все выделенные объекты (включая основной). */
  multi: Sel[];
  activeLevelId: string;
  viewMode: ViewMode;
  mode: Mode;
  walk: boolean;
  layers: Record<LayerId, LayerState>;
  snapGrid: boolean;
  snapAngle: boolean;
  autoDims: boolean;
  dialog: DialogId;
  cabinetEditId: string | null;
  rightTab: 'props' | 'layers' | 'issues';
  /** Запрос на центрирование вида на точке. */
  focus: { point: Vec2; nonce: number } | null;
  cursor: Vec2 | null;
  toast: { text: string; nonce: number } | null;
  showCeiling: boolean;
  showRoof: boolean;
  /** Показывать инженерные сети в 3D (по умолчанию скрыты). */
  show3dNetworks: boolean;
  /** Тени и расширенное освещение в 3D. */
  shadows3d: boolean;
  wallDefaults: { thickness: number; material: string; loadBearing: boolean; exterior: boolean };
  setTool: (tool: ToolId, kind?: string | null, params?: Record<string, number | string | boolean>) => void;
  select: (sel: Sel | null) => void;
  selectMany: (sels: Sel[]) => void;
  toggleSelect: (sel: Sel) => void;
  setActiveLevel: (id: string) => void;
  setViewMode: (m: ViewMode) => void;
  setMode: (m: Mode) => void;
  setWalk: (w: boolean) => void;
  toggleLayer: (l: LayerId, key: keyof LayerState) => void;
  setLang: (l: Lang) => void;
  setDialog: (d: DialogId, cabinetId?: string | null) => void;
  markHint: (id: string) => void;
  setHintsOff: (off: boolean) => void;
  toggleFavorite: (kind: string) => void;
  setLastProject: (id: string | null) => void;
  focusOn: (p: Vec2) => void;
  set: (p: Partial<UiState>) => void;
  notify: (text: string) => void;
}

const persisted = loadPersisted();

export const useUi = create<UiState>((set, get) => {
  const persist = (patch: Partial<Persisted>) => {
    set(patch);
    const s = get();
    savePersisted({ lang: s.lang, hintsSeen: s.hintsSeen, hintsOff: s.hintsOff, lastProjectId: s.lastProjectId, favorites: s.favorites });
  };
  return {
    ...persisted,
    tool: 'select',
    toolKind: null,
    toolParams: {},
    selection: null,
    multi: [],
    activeLevelId: '',
    viewMode: 'split',
    mode: 'plan',
    walk: false,
    layers: defaultLayers(),
    snapGrid: true,
    snapAngle: true,
    autoDims: false,
    dialog: null,
    cabinetEditId: null,
    rightTab: 'props',
    focus: null,
    cursor: null,
    toast: null,
    showCeiling: false,
    showRoof: false,
    show3dNetworks: false,
    shadows3d: true,
    wallDefaults: { thickness: 120, material: 'brick', loadBearing: false, exterior: false },

    setTool: (tool, kind = null, params = {}) => set({ tool, toolKind: kind, toolParams: params }),
    select: (selection) => set({ selection, multi: selection ? [selection] : [], ...(selection ? { rightTab: 'props' as const } : {}) }),
    selectMany: (multi) => set({ multi, selection: multi[multi.length - 1] ?? null, ...(multi.length ? { rightTab: 'props' as const } : {}) }),
    toggleSelect: (sel) => {
      const cur = get().multi;
      const next = cur.some((s) => sameSel(s, sel)) ? cur.filter((s) => !sameSel(s, sel)) : [...cur, sel];
      set({ multi: next, selection: next[next.length - 1] ?? null, rightTab: 'props' });
    },
    setActiveLevel: (activeLevelId) => set({ activeLevelId, selection: null, multi: [] }),
    setViewMode: (viewMode) => set({ viewMode, walk: viewMode === '2d' ? false : get().walk }),
    setMode: (mode) => {
      if (mode === get().mode) return;
      set({ mode, tool: 'select', toolKind: null, selection: null, multi: [] });
    },
    setWalk: (walk) => set({ walk, viewMode: walk && get().viewMode === '2d' ? '3d' : get().viewMode }),
    toggleLayer: (l, key) => set({ layers: { ...get().layers, [l]: { ...get().layers[l], [key]: !get().layers[l][key] } } }),
    setLang: (lang) => persist({ lang }),
    setDialog: (dialog, cabinetId) => set({ dialog, cabinetEditId: cabinetId === undefined ? get().cabinetEditId : cabinetId }),
    markHint: (id) => {
      if (!get().hintsSeen.includes(id)) persist({ hintsSeen: [...get().hintsSeen, id] });
    },
    setHintsOff: (hintsOff) => persist({ hintsOff }),
    toggleFavorite: (kind) => {
      const f = get().favorites;
      persist({ favorites: f.includes(kind) ? f.filter((k) => k !== kind) : [...f, kind] });
    },
    setLastProject: (lastProjectId) => persist({ lastProjectId }),
    focusOn: (point) => set({ focus: { point, nonce: (get().focus?.nonce ?? 0) + 1 } }),
    set: (p) => set(p),
    notify: (text) => set({ toast: { text, nonce: (get().toast?.nonce ?? 0) + 1 } }),
  };
});
