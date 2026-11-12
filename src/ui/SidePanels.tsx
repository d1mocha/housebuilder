// Слои (видимость/блокировка) и панель нарушений норм.
import { useMemo } from 'react';
import { useT } from '../i18n';
import type { LayerId, LS } from '../model/types';
import { DISCLAIMER } from '../rules';
import { validateProject } from '../rules/validate';
import type { Issue } from '../rules/validate';
import { useProject } from '../store/projectStore';
import { LAYER_ORDER, useUi } from '../store/uiStore';
import { Section } from './fields';

export const LAYER_NAMES: Record<LayerId, LS> = {
  walls: { uk: 'Стіни та прорізи', ru: 'Стены и проёмы' },
  rooms: { uk: 'Приміщення', ru: 'Помещения' },
  furniture: { uk: 'Меблі', ru: 'Мебель' },
  electrical: { uk: 'Електрика', ru: 'Электрика' },
  plumbing: { uk: 'Сантехніка', ru: 'Сантехника' },
  heating: { uk: 'Опалення', ru: 'Отопление' },
  gas: { uk: 'Газ', ru: 'Газ' },
  ventilation: { uk: 'Вентиляція', ru: 'Вентиляция' },
  landscape: { uk: 'Ландшафт', ru: 'Ландшафт' },
  dimensions: { uk: 'Розміри', ru: 'Размеры' },
  underlay: { uk: 'Підкладка', ru: 'Подложка' },
};

export function LayersPanel() {
  const { t, ls } = useT();
  const layers = useUi((s) => s.layers);
  const toggle = useUi((s) => s.toggleLayer);
  const kind = useProject((s) => s.project.kind);
  return (
    <Section title={t('Шари', 'Слои')}>
      <div className="layers">
        {LAYER_ORDER.filter((l) => l !== 'landscape' || kind === 'house').map((l) => (
          <div key={l} className="layer-row" data-layer={l}>
            <button className={`icon-btn ${layers[l].visible ? 'on' : ''}`} title={t('Видимість', 'Видимость')} onClick={() => toggle(l, 'visible')}>
              {layers[l].visible ? '👁' : '—'}
            </button>
            <button className={`icon-btn ${layers[l].locked ? 'on' : ''}`} title={t('Блокування', 'Блокировка')} onClick={() => toggle(l, 'locked')}>
              {layers[l].locked ? '🔒' : '🔓'}
            </button>
            <span className={layers[l].visible ? '' : 'muted'}>{ls(LAYER_NAMES[l])}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function useIssues(): Issue[] {
  const project = useProject((s) => s.project);
  return useMemo(() => {
    try {
      return validateProject(project);
    } catch {
      return [];
    }
  }, [project]);
}

export function IssuesPanel() {
  const { t, ls } = useT();
  const issues = useIssues();
  const jump = (i: Issue) => {
    const ui = useUi.getState();
    if (i.levelId && i.levelId !== ui.activeLevelId) ui.setActiveLevel(i.levelId);
    if (i.sel) ui.select(i.sel);
    if (i.point) ui.focusOn(i.point);
    if (ui.tool !== 'select') ui.setTool('select');
  };
  const order = { error: 0, warn: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <Section
      title={`${t('Перевірка норм', 'Проверка норм')} · ${issues.filter((i) => i.severity !== 'info').length}`}
      right={
        <button className="link" onClick={() => useUi.getState().setDialog('rules')}>
          {t('Довідник…', 'Справочник…')}
        </button>
      }
    >
      <div className="issues">
        {sorted.length === 0 && <p className="hint">{t('Порушень не знайдено.', 'Нарушений не найдено.')}</p>}
        {sorted.map((i) => (
          <button key={i.id} className={`issue ${i.severity}`} onClick={() => jump(i)} title={i.ruleId}>
            <span className="dot" />
            <span>{ls(i.message)}</span>
          </button>
        ))}
      </div>
      <p className="disclaimer">{ls(DISCLAIMER)}</p>
    </Section>
  );
}
