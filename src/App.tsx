import { lazy, Suspense, useEffect, useState } from 'react';
import './catalog';
import { Editor2D } from './editor2d/Editor2D';
import { exportProjectFile } from './export/exports';
import { useT } from './i18n';
import { createDemoProject } from './model/demo';
import { deleteSelection, duplicateSelection, nudgeSelection, rotateSelection, selectAllInMode } from './store/actions';
import { loadProject, saveProject } from './store/persistence';
import { useProject } from './store/projectStore';
import { useUi } from './store/uiStore';
import type { ToolId } from './store/uiStore';
import { BasicDialogs, openProject } from './ui/Dialogs';
import { Hints } from './ui/Hints';
import { LeftPanel } from './ui/LeftPanel';
import { Properties } from './ui/Properties';
import { IssuesPanel, LayersPanel } from './ui/SidePanels';
import { TopBar } from './ui/TopBar';

const View3D = lazy(() => import('./view3d/View3D').then((m) => ({ default: m.View3D })));
const CabinetDialog = lazy(() => import('./ui/CabinetDialog').then((m) => ({ default: m.CabinetDialog })));
const EstimateDialog = lazy(() => import('./ui/EstimateDialog').then((m) => ({ default: m.EstimateDialog })));
const DrawingsDialog = lazy(() => import('./ui/DrawingsDialog').then((m) => ({ default: m.DrawingsDialog })));

const TOOL_KEYS: Record<string, ToolId> = { KeyV: 'select', KeyW: 'wall', KeyA: 'arc', KeyR: 'room', KeyD: 'door', KeyN: 'window', KeyO: 'portal', KeyM: 'dim', KeyT: 'measure' };
/** Инструменты, не привязанные к режиму «План». */
const ANY_MODE_TOOLS: ToolId[] = ['select', 'measure'];

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const ui = useUi.getState();
      const store = useProject.getState();
      if (ui.dialog) {
        if (e.key === 'Escape') ui.setDialog(null);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.code === 'KeyY') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && e.code === 'KeyS') {
        e.preventDefault();
        exportProjectFile(store.project);
        return;
      }
      if (mod && e.code === 'KeyD') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod && e.code === 'KeyA') {
        e.preventDefault();
        if (!ui.walk) {
          if (ui.tool !== 'select') ui.setTool('select');
          selectAllInMode();
        }
        return;
      }
      if (mod || e.altKey) return;
      if (ui.walk) {
        if (e.code === 'KeyF') ui.setWalk(false);
        return;
      }
      // во время рисования стены цифры идут в поле длины — буквы инструментов не мешают
      if (TOOL_KEYS[e.code]) {
        const tl = TOOL_KEYS[e.code];
        if (!ANY_MODE_TOOLS.includes(tl)) ui.setMode('plan');
        ui.setTool(tl);
        if (ui.viewMode === '3d') ui.setViewMode('split');
        return;
      }
      switch (e.code) {
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
          if (ui.tool === 'wall') return;
          ui.setViewMode(e.code === 'Digit1' ? '2d' : e.code === 'Digit2' ? 'split' : '3d');
          return;
        case 'KeyF':
          ui.setWalk(true);
          return;
        case 'KeyG':
          ui.set({ snapGrid: !ui.snapGrid });
          return;
        case 'Home':
          window.dispatchEvent(new Event('hb-fit'));
          return;
        case 'F1':
          e.preventDefault();
          ui.setDialog('help');
          return;
        case 'Delete':
        case 'Backspace':
          if (ui.tool === 'select') deleteSelection();
          return;
        case 'KeyQ':
        case 'KeyE':
          rotateSelection(e.code === 'KeyE' ? 90 : -90);
          return;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown':
          if (ui.multi.length) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : store.project.gridStep;
            nudgeSelection(e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0, e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0);
          }
          return;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Загрузка последнего проекта (или демо при первом запуске) и автосохранение. */
function usePersistence(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const last = useUi.getState().lastProjectId;
      let p = null;
      try {
        if (last) p = await loadProject(last);
      } catch {
        p = null;
      }
      if (!alive) return;
      openProject(p ?? createDemoProject());
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useProject.subscribe((s, prev) => {
      if (s.rev === prev.rev) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveProject(useProject.getState().project).catch(() => undefined);
      }, 700);
    });
    saveProject(useProject.getState().project).catch(() => undefined);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [ready]);
  return ready;
}

function Toast() {
  const toast = useUi((s) => s.toast);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast.text);
    const tm = setTimeout(() => setShown(null), 4500);
    return () => clearTimeout(tm);
  }, [toast]);
  return shown ? <div className="toast">{shown}</div> : null;
}

export default function App() {
  const { t } = useT();
  const ready = usePersistence();
  useHotkeys();
  const viewMode = useUi((s) => s.viewMode);
  const dialog = useUi((s) => s.dialog);
  const rightTab = useUi((s) => s.rightTab);
  const setRightTab = (rightTab: 'props' | 'layers' | 'issues') => useUi.getState().set({ rightTab });
  if (!ready) return <div className="loading">HouseBuilder…</div>;
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <LeftPanel />
        <div className={`center mode-${viewMode}`}>
          {viewMode !== '3d' && <Editor2D />}
          {viewMode !== '2d' && (
            <Suspense fallback={<div className="loading">3D…</div>}>
              <View3D />
            </Suspense>
          )}
          <Hints />
        </div>
        <aside className="right-panel">
          <nav className="tabs">
            <button className={rightTab === 'props' ? 'active' : ''} onClick={() => setRightTab('props')}>
              {t('Властивості', 'Свойства')}
            </button>
            <button className={rightTab === 'layers' ? 'active' : ''} onClick={() => setRightTab('layers')} data-tab="layers">
              {t('Шари', 'Слои')}
            </button>
            <button className={rightTab === 'issues' ? 'active' : ''} onClick={() => setRightTab('issues')} data-tab="issues">
              {t('Норми', 'Нормы')}
            </button>
          </nav>
          <div className="panel-scroll">
            {rightTab === 'props' && <Properties />}
            {rightTab === 'layers' && <LayersPanel />}
            {rightTab === 'issues' && <IssuesPanel />}
          </div>
        </aside>
      </div>
      <BasicDialogs />
      <Suspense fallback={null}>
        {dialog === 'cabinet' && <CabinetDialog />}
        {dialog === 'estimate' && <EstimateDialog />}
        {dialog === 'drawings' && <DrawingsDialog />}
      </Suspense>
      <Toast />
    </div>
  );
}
