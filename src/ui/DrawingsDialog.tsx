// Чертежи: список листов, предпросмотр (SVG), настройки бумаги/масштаба/штампа, экспорт PDF и DXF.
import { useMemo, useState } from 'react';
import { Prims } from '../draw2d/Svg';
import { SHEET_TITLES, buildSheet, defaultSheetSpecs } from '../drawings/sheet';
import type { SheetSpec } from '../drawings/sheet';
import { exportDxf, exportPdf } from '../export/exports';
import { useT } from '../i18n';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import { Num, Select, Text } from './fields';

const SCALES = [0, 20, 25, 50, 75, 100, 150, 200, 250, 500];

export function DrawingsDialog() {
  const { t, ls, lang } = useT();
  const project = useProject((s) => s.project);
  const [paper, setPaper] = useState<'A4' | 'A3'>('A3');
  const [landscape, setLandscape] = useState(true);
  const [scale, setScale] = useState(0);
  const [index, setIndex] = useState(0);
  const [sectionPos, setSectionPos] = useState(0.5);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const close = () => useUi.getState().setDialog(null);

  const specs: SheetSpec[] = useMemo(() => defaultSheetSpecs(project, paper).map((s) => ({ ...s, paper, landscape, scale, sectionPos: s.kind === 'section' ? sectionPos : undefined })), [project, paper, landscape, scale, sectionPos]);
  const cur = specs[Math.min(index, specs.length - 1)];
  const sheet = useMemo(() => (cur ? buildSheet(project, cur, lang, Math.min(index, specs.length - 1) + 1) : null), [project, cur, lang, index, specs.length]);
  const label = (s: SheetSpec): string => {
    const lvl = project.levels.find((l) => l.id === s.levelId);
    let name = ls(SHEET_TITLES[s.kind]);
    if (s.kind === 'elevations') name += ` — ${lvl?.rooms.find((r) => r.id === s.roomId)?.name ?? ''}`;
    else if (s.kind === 'section') name += s.sectionAxis === 'y' ? ' 1–1' : ' 2–2';
    else if (project.levels.length > 1 && s.kind !== 'facades' && s.kind !== 'site') name += ` — ${lvl?.name ?? ''}`;
    return name;
  };
  const selected = specs.filter((_, i) => checked[i] ?? true);
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      useUi.getState().notify(`${t('Помилка', 'Ошибка')}: ${(e as Error).message ?? e}`);
    } finally {
      setBusy(false);
    }
  };
  const stamp = (key: keyof typeof project.stamp, v: string) => useProject.getState().update((d) => void (d.stamp[key] = v));
  const level = project.levels.find((l) => l.id === cur?.levelId) ?? project.levels[0];

  return (
    <div className="dialog-backdrop">
      <div className="dialog full" role="dialog">
        <header>
          <h3>{t('Креслення', 'Чертежи')}</h3>
          <button className="icon-btn" onClick={close} aria-label="close">
            ✕
          </button>
        </header>
        <div className="dialog-body">
          <div className="sheets-layout">
            <div className="sheets-list">
              <div className="grid2">
                <Select label={t('Формат', 'Формат')} value={paper} options={[{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }]} onChange={(v) => setPaper(v as 'A4' | 'A3')} />
                <Select label={t('Орієнтація', 'Ориентация')} value={landscape ? 'l' : 'p'} options={[{ value: 'l', label: t('Альбомна', 'Альбомная') }, { value: 'p', label: t('Книжкова', 'Книжная') }]} onChange={(v) => setLandscape(v === 'l')} />
              </div>
              <Select label={t('Масштаб', 'Масштаб')} value={String(scale)} options={SCALES.map((s) => ({ value: String(s), label: s === 0 ? t('Авто', 'Авто') : `1:${s}` }))} onChange={(v) => setScale(Number(v))} />
              {cur?.kind === 'section' && <Num label={t('Положення січної, %', 'Положение секущей, %')} value={Math.round(sectionPos * 100)} min={2} max={98} step={5} digits={0} onChange={(v) => setSectionPos(v / 100)} />}
              <h4>{t('Аркуші', 'Листы')}</h4>
              {specs.map((s, i) => (
                <div key={i} className="row">
                  <input type="checkbox" checked={checked[i] ?? true} onChange={(e) => setChecked({ ...checked, [i]: e.target.checked })} />
                  <button className={`grow ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)} data-sheet={s.kind}>
                    {i + 1}. {label(s)}
                  </button>
                </div>
              ))}
              <h4>{t('Штамп', 'Штамп')}</h4>
              <Text label={t('Об’єкт', 'Объект')} value={project.stamp.object} onChange={(v) => stamp('object', v)} />
              <Text label={t('Адреса', 'Адрес')} value={project.stamp.address} onChange={(v) => stamp('address', v)} />
              <Text label={t('Розробив', 'Разработал')} value={project.stamp.author} onChange={(v) => stamp('author', v)} />
              <Text label={t('Замовник', 'Заказчик')} value={project.stamp.customer} onChange={(v) => stamp('customer', v)} />
            </div>
            <div className="sheet-preview">
              {sheet && (
                <svg viewBox={`0 0 ${sheet.w} ${sheet.h}`} width={sheet.w * 3.2} height={sheet.h * 3.2} data-sheet-preview>
                  <Prims prims={sheet.prims} k={1} />
                </svg>
              )}
            </div>
          </div>
        </div>
        <footer>
          <button className="primary" disabled={busy || !selected.length} onClick={() => run(() => exportPdf(project, selected, lang))} data-action="pdf-all">
            {busy ? '…' : `${t('PDF — вибрані аркуші', 'PDF — выбранные листы')} (${selected.length})`}
          </button>
          <button disabled={busy || !cur} onClick={() => cur && run(() => exportPdf(project, [cur], lang))} data-action="pdf-one">
            {t('PDF — цей аркуш', 'PDF — этот лист')}
          </button>
          <button disabled={busy} onClick={() => run(() => exportDxf(project, level))} data-action="dxf">
            {t('DXF — план поверху', 'DXF — план этажа')}
          </button>
          <span className="grow" />
          {sheet && (
            <span className="muted">
              {sheet.title} · 1:{sheet.scale} · {paper}
            </span>
          )}
          <button onClick={close}>{t('Закрити', 'Закрыть')}</button>
        </footer>
      </div>
    </div>
  );
}
