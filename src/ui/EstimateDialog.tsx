// Смета: количество из модели, запас в % по категориям, цены пользователя, экспорт CSV.
import { Fragment, useMemo, useState } from 'react';
import { CATEGORY_NAMES, DEFAULT_RESERVE, buildEstimate, estimateTotal } from '../calc/estimate';
import type { EstimateCategory } from '../calc/estimate';
import { safeShopUrl } from '../calc/materials';
import { matchPrices, parsePriceCsv } from '../calc/priceImport';
import { download, safeName, toCsv } from '../export/csv';
import { countNoun, fmt, useT } from '../i18n';
import { DISCLAIMER } from '../rules';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import { Dialog } from './Dialog';
import { NumInput } from './fields';

export function EstimateDialog() {
  const { t, ls, lang } = useT();
  const project = useProject((s) => s.project);
  const lines = useMemo(() => buildEstimate(project), [project]);
  const total = estimateTotal(lines);
  const cats = [...new Set(lines.map((l) => l.category))];
  const close = () => useUi.getState().setDialog(null);
  /** Строки, которым ещё не задана цена; без цен сумма не показывается. */
  const unpriced = lines.filter((l) => !(l.price > 0)).length;
  const noPrices = lines.length > 0 && unpriced === lines.length;
  const [importInfo, setImportInfo] = useState<{ n: number; unmatched: string[] } | null>(null);
  /** Шаблон для заполнения цен: «Позиція; Ціна» по всем строкам сметы. */
  const exportTemplate = () => {
    const rows: (string | number)[][] = [[t('Позиція', 'Позиция'), t('Ціна', 'Цена')]];
    for (const l of lines) rows.push([ls(l.name), l.price > 0 ? l.price : '']);
    download(`${safeName(project.name)}_ciny.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };
  /** Импорт цен из CSV: совпавшие позиции получают цену одной записью истории. */
  const importPrices = async (file: File) => {
    try {
      const rows = parsePriceCsv(await file.text());
      const m = matchPrices(lines, rows);
      const n = Object.keys(m.prices).length;
      if (n > 0) useProject.getState().update((d) => void Object.assign(d.prices, m.prices));
      setImportInfo({ n, unmatched: m.unmatched });
      if (!rows.length) useUi.getState().notify(t('У файлі не знайдено рядків «позиція; ціна»', 'В файле не найдено строк «позиция; цена»'));
    } catch (e) {
      useUi.getState().notify(`${t('Не вдалося прочитати файл', 'Не удалось прочитать файл')}: ${(e as Error).message}`);
    }
  };
  const exportCsv = () => {
    const rows: (string | number)[][] = [[t('Розділ', 'Раздел'), t('Позиція', 'Позиция'), t('Од.', 'Ед.'), t('Кількість', 'Количество'), t('Запас, %', 'Запас, %'), t('До закупівлі', 'К закупке'), t('Ціна', 'Цена'), t('Сума', 'Сумма'), t('Примітка', 'Примечание'), t('Посилання', 'Ссылка')]];
    for (const l of lines) rows.push([ls(CATEGORY_NAMES[l.category]), ls(l.name), ls(l.unit), l.qty, l.reservePct, l.total, l.price, l.sum, ls(l.note), l.url ?? '']);
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
          <label className="file-btn inline" title={t('CSV: «позиція; ціна». Підходить і файл, вивантажений кнопкою «Експорт CSV» або «Шаблон цін».', 'CSV: «позиция; цена». Подходит и файл, выгруженный кнопкой «Экспорт CSV» или «Шаблон цен».')}>
            {t('Імпорт цін із CSV…', 'Импорт цен из CSV…')}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              data-field="prices-csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importPrices(f);
                e.target.value = '';
              }}
            />
          </label>
          <button onClick={exportTemplate} data-action="csv-template" disabled={!lines.length}>
            {t('Шаблон цін (CSV)', 'Шаблон цен (CSV)')}
          </button>
          <span className="grow" />
          {noPrices ? (
            <span className="muted" data-total="none">
              {t('Введіть ціни, щоб побачити суму', 'Введите цены, чтобы увидеть сумму')}
            </span>
          ) : (
            <b data-total>
              {t('Разом', 'Итого')}: {fmt(total)} грн
              {unpriced > 0 && <span className="muted price-missing"> · {t('без ціни', 'без цены')}: {countNoun(unpriced, 'position', lang)}</span>}
            </b>
          )}
          <button onClick={close}>{t('Закрити', 'Закрыть')}</button>
        </>
      }
    >
      <p className="hint">
        {t('Кількість розраховується з моделі. Запас у % задається для розділу, ціни беруться з матеріалів або вводяться тут (зберігаються в проєкті). Норми витрати сумішей, фарби, розчину — орієнтовні.', 'Количество рассчитывается из модели. Запас в % задаётся для раздела, цены берутся из материалов или вводятся здесь (сохраняются в проекте). Нормы расхода смесей, краски, раствора — ориентировочные.')} {ls(DISCLAIMER)}
      </p>
      {importInfo && (
        <div className={importInfo.unmatched.length ? 'warn-box' : 'calc-box'} data-import-info={importInfo.n}>
          {t('Імпортовано', 'Импортировано')}: <b>{countNoun(importInfo.n, 'price', lang)}</b>.
          {importInfo.unmatched.length > 0 && (
            <>
              {' '}
              {t('Не знайдено в кошторисі', 'Не найдено в смете')} ({importInfo.unmatched.length}): {importInfo.unmatched.slice(0, 8).join('; ')}
              {importInfo.unmatched.length > 8 ? '…' : ''}
            </>
          )}{' '}
          <button className="link" onClick={() => setImportInfo(null)}>
            {t('сховати', 'скрыть')}
          </button>
        </div>
      )}
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
            <td colSpan={noPrices ? 6 : 5}>{noPrices ? <span className="muted">{t('Введіть ціни (або імпортуйте їх із CSV), щоб побачити суму', 'Введите цены (или импортируйте их из CSV), чтобы увидеть сумму')}</span> : t('Разом', 'Итого')}</td>
            {!noPrices && <td className="num-cell">{fmt(total)}</td>}
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
          <td className="num-cell">{rows.some((l) => l.sum > 0) ? fmt(rows.reduce((s, l) => s + l.sum, 0)) : ''}</td>
        </tr>
        {rows.map((l) => (
          <tr key={l.key} data-line={l.key}>
            <td>
              {ls(l.name)}
              {safeShopUrl(l.url) && (
                <a className="shop-link" href={safeShopUrl(l.url)!} target="_blank" rel="noopener noreferrer" title={t('Відкрити в магазині', 'Открыть в магазине')} data-shop-link>
                  🛒↗
                </a>
              )}
              {l.note && <span className="muted"> — {ls(l.note)}</span>}
            </td>
            <td>{ls(l.unit)}</td>
            <td className="num-cell">{fmt(l.qty)}</td>
            <td className="num-cell">
              <b>{fmt(l.total, 1)}</b>
            </td>
            <td>
              <NumInput value={l.price} min={0} digits={2} onChange={(v) => useProject.getState().update((d) => void (d.prices[l.key] = v))} />
              {l.priceFrom === 'material' && (
                <span className="price-src" data-price-src="material">
                  {t('з матеріалу', 'из материала')}
                </span>
              )}
              {l.priceFrom === 'user' && l.url !== undefined && (
                <button className="link price-src" title={t('Повернути ціну з матеріалу', 'Вернуть цену из материала')} onClick={() => useProject.getState().update((d) => void delete d.prices[l.key])}>
                  {t('своя · скинути', 'своя · сбросить')}
                </button>
              )}
            </td>
            <td className="num-cell">{l.sum ? fmt(l.sum) : ''}</td>
          </tr>
        ))}
      </>
    );
  }
}
