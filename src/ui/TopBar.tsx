// Верхняя панель: проект, история, вид, этажи, экспорт, язык.
import { useState } from 'react';
import { exportDxf, exportGltf, exportPdf, exportProjectFile } from '../export/exports';
import { useT } from '../i18n';
import { projectFromFile } from '../store/persistence';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import type { ViewMode } from '../store/uiStore';
import { useIssues } from './SidePanels';

export function TopBar() {
  const { t, lang } = useT();
  const project = useProject((s) => s.project);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const viewMode = useUi((s) => s.viewMode);
  const activeLevelId = useUi((s) => s.activeLevelId);
  const [menu, setMenu] = useState<null | 'file' | 'export'>(null);
  const [busy, setBusy] = useState(false);
  const issues = useIssues();
  const warnCount = issues.filter((i) => i.severity !== 'info').length;
  const ui = useUi.getState;
  const level = project.levels.find((l) => l.id === activeLevelId) ?? project.levels[0];

  const run = async (fn: () => Promise<void> | void, done?: string) => {
    setMenu(null);
    setBusy(true);
    try {
      await fn();
      if (done) ui().notify(done);
    } catch (e) {
      ui().notify(`${t('Помилка', 'Ошибка')}: ${(e as Error).message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const importFile = (file: File) => {
    file.text().then((text) => {
      try {
        const p = projectFromFile(text);
        useProject.getState().setProject(p);
        ui().setActiveLevel(p.levels[0].id);
        ui().setLastProject(p.id);
        ui().notify(t('Проєкт імпортовано', 'Проект импортирован'));
      } catch (e) {
        ui().notify(`${t('Не вдалося відкрити файл', 'Не удалось открыть файл')}: ${(e as Error).message}`);
      }
    });
  };

  const modes: [ViewMode, string][] = [
    ['2d', '2D'],
    ['split', t('2D + 3D', '2D + 3D')],
    ['3d', '3D'],
  ];

  return (
    <header className="topbar" onMouseLeave={() => setMenu(null)}>
      <div className="brand">
        <span className="logo">⌂</span>
        <b>HouseBuilder</b>
      </div>
      <div className="menu-wrap">
        <button onClick={() => setMenu(menu === 'file' ? null : 'file')} data-menu="file">
          {t('Проєкт', 'Проект')} ▾
        </button>
        {menu === 'file' && (
          <div className="dropdown">
            <button onClick={() => (setMenu(null), ui().setDialog('new'))}>{t('Новий проєкт…', 'Новый проект…')}</button>
            <button onClick={() => (setMenu(null), ui().setDialog('projects'))}>{t('Мої проєкти…', 'Мои проекты…')}</button>
            <hr />
            <button onClick={() => run(() => exportProjectFile(project))}>{t('Зберегти у файл (.json)', 'Сохранить в файл (.json)')}</button>
            <label className="dropdown-file">
              {t('Відкрити файл (.json)…', 'Открыть файл (.json)…')}
              <input type="file" accept=".json,application/json" onChange={(e) => (setMenu(null), e.target.files?.[0] && importFile(e.target.files[0]))} />
            </label>
          </div>
        )}
      </div>
      <span className="project-name" title={project.name}>
        {project.name}
      </span>
      <div className="sep" />
      <button disabled={!canUndo} onClick={() => useProject.getState().undo()} title="Ctrl+Z">
        ↶
      </button>
      <button disabled={!canRedo} onClick={() => useProject.getState().redo()} title="Ctrl+Y">
        ↷
      </button>
      <div className="sep" />
      <div className="seg">
        {modes.map(([m, name]) => (
          <button key={m} className={viewMode === m ? 'active' : ''} onClick={() => ui().setViewMode(m)} data-view={m}>
            {name}
          </button>
        ))}
      </div>
      {project.levels.length > 1 && (
        <select value={level.id} onChange={(e) => ui().setActiveLevel(e.target.value)} title={t('Поверх', 'Этаж')}>
          {project.levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      <div className="grow" />
      <button onClick={() => ui().setDialog('cabinet', null)}>{t('Конструктор меблів', 'Конструктор мебели')}</button>
      <button onClick={() => ui().setDialog('drawings')}>{t('Креслення', 'Чертежи')}</button>
      <button onClick={() => ui().setDialog('estimate')}>{t('Кошторис', 'Смета')}</button>
      <div className="menu-wrap">
        <button onClick={() => setMenu(menu === 'export' ? null : 'export')} disabled={busy} data-menu="export">
          {busy ? '…' : t('Експорт', 'Экспорт')} ▾
        </button>
        {menu === 'export' && (
          <div className="dropdown right">
            <button onClick={() => run(() => exportPdf(project, [{ kind: 'measure', levelId: level.id, paper: 'A3', landscape: true, scale: 0 }], lang), t('PDF збережено', 'PDF сохранён'))} data-export="pdf">
              {t('План у PDF (A3)', 'План в PDF (A3)')}
            </button>
            <button onClick={() => run(() => exportPdf(project, [{ kind: 'measure', levelId: level.id, paper: 'A4', landscape: true, scale: 0 }], lang), t('PDF збережено', 'PDF сохранён'))}>{t('План у PDF (A4)', 'План в PDF (A4)')}</button>
            <button onClick={() => run(() => exportDxf(project, level), t('DXF збережено', 'DXF сохранён'))} data-export="dxf">
              {t('План у DXF', 'План в DXF')}
            </button>
            <button onClick={() => run(() => exportGltf(project), t('glTF збережено', 'glTF сохранён'))} data-export="gltf">
              {t('3D-модель у glTF (.glb)', '3D-модель в glTF (.glb)')}
            </button>
            <hr />
            <button onClick={() => (setMenu(null), ui().setDialog('drawings'))}>{t('Усі креслення…', 'Все чертежи…')}</button>
          </div>
        )}
      </div>
      <button className={warnCount ? 'warn' : ''} onClick={() => ui().setDialog('rules')} title={t('Довідник норм і перевірка', 'Справочник норм и проверка')}>
        ⚠ {warnCount}
      </button>
      <div className="seg">
        <button className={lang === 'uk' ? 'active' : ''} onClick={() => ui().setLang('uk')}>
          УКР
        </button>
        <button className={lang === 'ru' ? 'active' : ''} onClick={() => ui().setLang('ru')}>
          РУС
        </button>
      </div>
      <button onClick={() => ui().setDialog('help')} title="F1">
        ?
      </button>
    </header>
  );
}
