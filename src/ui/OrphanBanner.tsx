// Предложение убрать объекты вне помещений и участка — после открытия сохранённого проекта.
import { useMemo } from 'react';
import { countNoun, useT } from '../i18n';
import { orphanItems } from '../model/checks';
import { getContainer, removeEntity } from '../model/ops';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';

export function OrphanBanner() {
  const { t, lang } = useT();
  const prompt = useUi((s) => s.orphanPrompt);
  const project = useProject((s) => s.project);
  const orphans = useMemo(() => (prompt ? orphanItems(project) : []), [prompt, project]);
  if (!prompt || orphans.length === 0) return null;
  const n = orphans.length;
  const close = () => useUi.getState().set({ orphanPrompt: false });
  const show = () => {
    const ui = useUi.getState();
    const first = orphans[0];
    const it = getContainer(project, first.scope)?.items.find((i) => i.id === first.id);
    // все слои объектов должны быть доступны для выделения: показываем их списком без смены режима
    ui.selectMany(orphans);
    if (it) ui.focusOn({ x: it.x, y: it.y });
  };
  const remove = () => {
    // одна запись истории: Ctrl+Z возвращает все убранные объекты
    useProject.getState().update((d) => {
      for (const s of orphanItems(d)) removeEntity(d, s);
    });
    const ui = useUi.getState();
    ui.select(null);
    ui.set({ orphanPrompt: false });
    ui.notify(t(`Прибрано: ${countNoun(n, 'item', lang)}. Ctrl+Z — повернути`, `Убрано: ${countNoun(n, 'item', lang)}. Ctrl+Z — вернуть`));
  };
  return (
    <div className="orphan-banner" data-orphans={n} role="alert">
      <span>
        ⚠ {t('У проєкті', 'В проекте')} <b>{countNoun(n, 'item', lang)}</b> {t('поза контуром приміщень або ділянки — ймовірно, залишилися після зміни стін.', 'вне контура помещений или участка — вероятно, остались после изменения стен.')}
      </span>
      <button data-action="orphans-show" onClick={show}>
        {t('Показати', 'Показать')}
      </button>
      <button className="primary" data-action="orphans-remove" onClick={remove}>
        {t(`Прибрати ${countNoun(n, 'item', lang)} поза приміщеннями`, `Убрать ${countNoun(n, 'item', lang)} вне помещений`)}
      </button>
      <button className="icon-btn" data-action="orphans-dismiss" onClick={close} title={t('Залишити як є', 'Оставить как есть')}>
        ✕
      </button>
    </div>
  );
}
