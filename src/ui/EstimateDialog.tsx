// Смета: количество из модели, запас в % по категориям, цены пользователя, экспорт CSV.
import { Fragment, useMemo } from 'react';
import { CATEGORY_NAMES, DEFAULT_RESERVE, buildEstimate, estimateTotal } from '../calc/estimate';
import type { EstimateCategory } from '../calc/estimate';
import { download, safeName, toCsv } from '../export/csv';
import { fmt, useT } from '../i18n';
import { DISCLAIMER } from '../rules';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import { Dialog } from './Dialog';
import { NumInput } from './fields';

export function EstimateDialog() {
  const { t, ls } = useT();
  const project = useProject((s) => s.project);
  const lines = useMemo(() => buildEstimate(project), [project]);
  const total = estimateTotal(lines);
  const cats = [...new Set(lines.map((l) => l.category))];
  const close = () => useUi.getState().setDialog(null);
  const exportCsv = () => {
    const rows: (string | number)[][] = [[t('Розділ', 'Раздел'), t('Позиція', 'Позиция'), t('Од.', 'Ед.'), t('Кількість', 'Количество'), t('Запас, %', 'Запас, %'), t('До закупівлі', 'К закупке'), t('Ціна', 'Цена'), t('Сума', 'Сумма'), t('Примітка', 'Примечание')]];
    for (const l of lines) rows.push([ls(CATEGORY_NAMES[l.category]), ls(l.name), ls(l.unit), l.qty, l.reservePct, l.total, l.price, l.sum, ls(l.note)]);
    rows.push([], [t('Разом', 'Итого'), '', '', '', '', '', '', total]);
    download(`${safeName(project.name)}_koshtorys.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };
  return (
    <Dialog
      title={t('Кошторис матеріалів', 'Смета материалов')}
      onClose={close}
      wide
      footer={
        <>
          <button className="primary" onClick={exportCsv} data-action="csv-estimate">
            {t('Експорт CSV', 'Экспорт CSV')}
          </button>
          <span className="grow" />
          <b data-total>
            {t('Разом', 'Итого')}: {fmt(total)} грн
          </b>
          <button onClick={close}>{t('Закрити', 'Закрыть')}</button>
        </>
      }
    >
      <p className="hint">
        {t('Кількість розраховується з моделі. Запас у % задається для розділу, ціни вводите ви (зберігаються в проєкті). Норми витрати сумішей, фарби, розчину — орієнтовні.', 'Количество рассчитывается из модели. Запас в % задаётся для раздела, цены вводите вы (сохраняются в проекте). Нормы расхода смесей, краски, раствора — ориентировочные.')} {ls(DISCLAIMER)}
      </p>
      {lines.length === 0 && <p>{t('Поки що нічого рахувати: намалюйте стіни й призначте оздоблення.', 'Пока нечего считать: нарисуйте стены и назначьте отделку.')}</p>}
      <table className="data" data-table="estimate">
        <thead>
          <tr>
            <th>{t('Позиція', 'Позиция')}</th>
            <th>{t('Од.', 'Ед.')}</th>
            <th>{t('Кількість', 'Количество')}</th>
            <th>{t('До закупівлі', 'К закупке')}</th>
            <th>{t('Ціна, грн', 'Цена, грн')}</th>
            <th>{t('Сума, грн', 'Сумма, грн')}</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((c) => (
            <Fragment key={c}>{categoryRows(c as EstimateCategory)}</Fragment>
          ))}
          <tr className="total">
            <td colSpan={5}>{t('Разом', 'Итого')}</td>
            <td className="num-cell">{fmt(total)}</td>
          </tr>
        </tbody>
      </table>
    </Dialog>
  );

  function categoryRows(category: EstimateCategory) {
    const reserve = project.reserves[category] ?? DEFAULT_RESERVE[category];
    const rows = lines.filter((l) => l.category === category);
    return (
      <>
        <tr className="total" data-category={category}>
          <td colSpan={3}>{ls(CATEGORY_NAMES[category])}</td>
          <td colSpan={2} className="nowrap">
            {t('запас', 'запас')} <NumInput value={reserve} min={0} max={100} unit="%" onChange={(v) => useProject.getState().update((d) => void (d.reserves[category] = v))} />
          </td>
          <td className="num-cell">{fmt(rows.reduce((s, l) => s + l.sum, 0))}</td>
        </tr>
        {rows.map((l) => (
          <tr key={l.key} data-line={l.key}>
            <td>
              {ls(l.name)}
              {l.note && <span className="muted"> — {ls(l.note)}</span>}
            </td>
            <td>{ls(l.unit)}</td>
            <td className="num-cell">{fmt(l.qty)}</td>
            <td className="num-cell">
              <b>{fmt(l.total, 1)}</b>
            </td>
            <td>
              <NumInput value={l.price} min={0} digits={2} onChange={(v) => useProject.getState().update((d) => void (d.prices[l.key] = v))} />
            </td>
            <td className="num-cell">{l.sum ? fmt(l.sum) : ''}</td>
          </tr>
        ))}
      </>
    );
  }
}
