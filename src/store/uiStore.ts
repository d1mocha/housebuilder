// Состояние интерфейса (не входит в модель проекта).
import { create } from 'zustand';
import type { Lang, LayerId, Sel, Vec2 } from '../model/types';

export type ToolId =
  | 'select'
  | 'wall'
  | 'room'
  | 'door'
  | 'window'
  | 'portal'
  | 'dim'
  | 'item'
  | 'route'
  | 'zone'
  | 'calibrate'
  | 'site';

export type ViewMode = '2d' | '3d' | 'split';

export type DialogId = null | 'new' | 'projects' | 'rules' | 'estimate' | 'drawings' | 'cabinet' | 'finishes' | 'groups' | 'help' | 'settings';

export type LeftTab = 'build' | 'library' | 'eng' | 'site';

export interface LayerState {
  visible: boolean;
  locked: boolean;
}

export const LAYER_ORDER: LayerId[] = ['walls', 'rooms', 'furniture', 'electrical', 'plumbing', 'heating', 'gas', 'ventilation', 'landscape', 'dimensions', 'underlay'];

const defaultLayers = (): Record<LayerId, LayerState> =>
  Object.fromEntries(LAYER_ORDER.map((l) => [l, { visible: true, locked: false }])) as Record<LayerId, LayerState>;

const LS_KEY = 'hb.ui';

interface Persisted {
  lang: Lang;
  hintsSeen: string[];
  lastProjectId: string | null;
}

function loadPersisted(): Persisted {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (raw) return { lang: 'uk', hintsSeen: [], lastProjectId: null, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { lang: 'uk', hintsSeen: [], lastProjectId: null };
}

function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

interface UiState extends Persisted {
  tool: ToolId;
  /** Вид размещаемого объекта / трассы / зоны. */
  toolKind: string | null;
  /** Параметры размещаемого объекта (изделие конструктора, пользовательская модель). */
  toolParams: Record<string, number | string | boolean>;
  selection: Sel | null;
  activeLevelId: string;
  viewMode: ViewMode;
  walk: boolean;
  layers: Record<LayerId, LayerState>;
  snapGrid: boolean;
  snapAngle: boolean;
  autoDims: boolean;
  dialog: DialogId;
  cabinetEditId: string | null;
  leftTab: LeftTab;
  /** Запрос на центрирование вида на точке. */
  focus: { point: Vec2; nonce: number } | null;
  cursor: Vec2 | null;
  toast: { text: string; nonce: number } | null;
  showCeiling: boolean;
  showRoof: boolean;
  wallDefaults: { thickness: number; material: string; loadBearing: boolean; exterior: boolean };
  setTool: (tool: ToolId, kind?: string | null, params?: Record<string, number | string | boolean>) => void;
  select: (sel: Sel | null) => void;
  setActiveLevel: (id: string) => void;
  setViewMode: (m: ViewMode) => void;
  setWalk: (w: boolean) => void;
  toggleLayer: (l: LayerId, key: keyof LayerState) => void;
  setLang: (l: Lang) => void;
  setDialog: (d: DialogId, cabinetId?: string | null) => void;
  setLeftTab: (t: LeftTab) => void;
  markHint: (id: string) => void;
  setLastProject: (id: string | null) => void;
  focusOn: (p: Vec2) => void;
  set: (p: Partial<UiState>) => void;
  notify: (text: string) => void;
}

const persisted = loadPersisted();

export const useUi = create<UiState>((set, get) => ({
  ...persisted,
  tool: 'select',
  toolKind: null,
  toolParams: {},
  selection: null,
  activeLevelId: '',
  viewMode: 'split',
  walk: false,
  layers: defaultLayers(),
  snapGrid: true,
  snapAngle: true,
  autoDims: false,
  dialog: null,
  cabinetEditId: null,
  leftTab: 'build',
  focus: null,
  cursor: null,
  toast: null,
  showCeiling: false,
  showRoof: false,
  wallDefaults: { thickness: 120, material: 'brick', loadBearing: false, exterior: false },

  setTool: (tool, kind = null, params = {}) => set({ tool, toolKind: kind, toolParams: params }),
  select: (selection) => set({ selection }),
  setActiveLevel: (activeLevelId) => set({ activeLevelId, selection: null }),
  setViewMode: (viewMode) => set({ viewMode, walk: viewMode === '2d' ? false : get().walk }),
  setWalk: (walk) => set({ walk, viewMode: walk && get().viewMode === '2d' ? '3d' : get().viewMode }),
  toggleLayer: (l, key) => set({ layers: { ...get().layers, [l]: { ...get().layers[l], [key]: !get().layers[l][key] } } }),
  setLang: (lang) => {
    set({ lang });
    savePersisted({ lang, hintsSeen: get().hintsSeen, lastProjectId: get().lastProjectId });
  },
  setDialog: (dialog, cabinetId) => set({ dialog, cabinetEditId: cabinetId === undefined ? get().cabinetEditId : cabinetId }),
  setLeftTab: (leftTab) => set({ leftTab }),
  markHint: (id) => {
    if (get().hintsSeen.includes(id)) return;
    const hintsSeen = [...get().hintsSeen, id];
    set({ hintsSeen });
    savePersisted({ lang: get().lang, hintsSeen, lastProjectId: get().lastProjectId });
  },
  setLastProject: (lastProjectId) => {
    set({ lastProjectId });
    savePersisted({ lang: get().lang, hintsSeen: get().hintsSeen, lastProjectId });
  },
  focusOn: (point) => set({ focus: { point, nonce: (get().focus?.nonce ?? 0) + 1 } }),
  set: (p) => set(p),
  notify: (text) => set({ toast: { text, nonce: (get().toast?.nonce ?? 0) + 1 } }),
}));
