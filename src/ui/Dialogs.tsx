// Диалоги: новый проект, список проектов, справка, справочник норм, каталог отделки, электрические группы.
import { Fragment, useEffect, useState } from 'react';
import { cableAmpacity, networkSummary } from '../calc/networks';
import { FINISH_TYPE_NAMES } from '../catalog/finishes';
import { fmt, useT } from '../i18n';
import { createDemoProject } from '../model/demo';
import { createProject } from '../model/defaults';
import { newId } from '../model/ids';
import type { Finish, Project, ProjectKind } from '../model/types';
import { DISCLAIMER, RULE_CATEGORIES, effectiveRules } from '../rules';
import { deleteProject, listProjects, loadProject } from '../store/persistence';
import type { ProjectInfo } from '../store/persistence';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import { Dialog } from './Dialog';
import { NumInput } from './fields';
import { useIssues } from './SidePanels';

export function openProject(p: Project) {
  useProject.getState().setProject(p);
  const ui = useUi.getState();
  ui.setActiveLevel(useProject.getState().project.levels[0].id);
  ui.setLastProject(p.id);
  ui.set({ selection: null, multi: [], tool: 'select', toolKind: null, dialog: null, mode: 'plan' });
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [kind, setKind] = useState<ProjectKind>('apartment');
  const [name, setName] = useState('');
  return (
    <Dialog
      title={t('Новий проєкт', 'Новый проект')}
      onClose={onClose}
      footer={
        <>
          <button onClick={() => openProject(createDemoProject())}>{t('Відкрити демо-квартиру', 'Открыть демо-квартиру')}</button>
          <span className="grow" />
          <button onClick={onClose}>{t('Скасувати', 'Отмена')}</button>
          <button className="primary" data-action="create" onClick={() => openProject(createProject(kind, name.trim() || (kind === 'house' ? t('Мій будинок', 'Мой дом') : t('Моя квартира', 'Моя квартира'))))}>
            {t('Створити', 'Создать')}
          </button>
        </>
      }
    >
      <p>{t('Оберіть тип об’єкта:', 'Выберите тип объекта:')}</p>
      <div className="kind-cards">
        <button className={`kind-card ${kind === 'apartment' ? 'active' : ''}`} onClick={() => setKind('apartment')} data-kind="apartment">
          <span className="big">🏢</span>
          <b>{t('Квартира', 'Квартира')}</b>
          <small>{t('Обведення плану з техпаспорта, перепланування, інтер’єр, меблі', 'Обводка плана из техпаспорта, перепланировка, интерьер, мебель')}</small>
        </button>
        <button className={`kind-card ${kind === 'house' ? 'active' : ''}`} onClick={() => setKind('house')} data-kind="house">
          <span className="big">🏡</span>
          <b>{t('Приватний будинок', 'Частный дом')}</b>
          <small>{t('Поверхи, дах, ділянка, ландшафт, мережі', 'Этажи, крыша, участок, ландшафт, сети')}</small>
        </button>
      </div>
      <label className="field">
        <span className="field-label">{t('Назва проєкту', 'Название проекта')}</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'house' ? t('Мій будинок', 'Мой дом') : t('Моя квартира', 'Моя квартира')} />
      </label>
    </Dialog>
  );
}

function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [list, setList] = useState<ProjectInfo[] | null>(null);
  const currentId = useProject((s) => s.project.id);
  const refresh = () => listProjects().then(setList).catch(() => setList([]));
  useEffect(() => {
    refresh();
  }, []);
  return (
    <Dialog title={t('Мої проєкти', 'Мои проекты')} onClose={onClose} footer={<button onClick={() => useUi.getState().setDialog('new')}>{t('Новий проєкт…', 'Новый проект…')}</button>}>
      {!list && <p>…</p>}
      {list && list.length === 0 && <p className="hint">{t('Збережених проєктів ще немає.', 'Сохранённых проектов пока нет.')}</p>}
      <div className="project-list">
        {list?.map((p) => (
          <div key={p.id} className={`project-row ${p.id === currentId ? 'current' : ''}`}>
            <span>{p.kind === 'house' ? '🏡' : '🏢'}</span>
            <div className="grow">
              <b>{p.name}</b>
              <small>{new Date(p.updatedAt).toLocaleString()}</small>
            </div>
            <button
              className="primary"
              onClick={async () => {
                const full = await loadProject(p.id);
                if (full) openProject(full);
              }}
            >
              {t('Відкрити', 'Открыть')}
            </button>
            <button
              className="danger"
              disabled={p.id === currentId}
              onClick={async () => {
                if (!window.confirm(t('Видалити проєкт назавжди?', 'Удалить проект навсегда?'))) return;
                await deleteProject(p.id);
                refresh();
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <p className="hint">{t('Проєкти автоматично зберігаються в браузері (IndexedDB). Для резервної копії та перенесення використовуйте «Зберегти у файл».', 'Проекты автоматически сохраняются в браузере (IndexedDB). Для резервной копии и переноса используйте «Сохранить в файл».')}</p>
    </Dialog>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const keys: [string, string][] = [
    ['V', t('Вибір і перетягування', 'Выбор и перетаскивание')],
    ['W', t('Стіна (цифри + Enter — точна довжина)', 'Стена (цифры + Enter — точная длина)')],
    ['R', t('Прямокутна кімната', 'Прямоугольная комната')],
    ['D / N / O', t('Двері / вікно / проріз', 'Дверь / окно / проём')],
    ['M', t('Розмірна лінія', 'Размерная линия')],
    ['Q / E', t('Повернути об’єкт на 90°', 'Повернуть объект на 90°')],
    ['← ↑ → ↓', t('Зсунути об’єкт на крок сітки', 'Сдвинуть объект на шаг сетки')],
    ['Del', t('Видалити виділене', 'Удалить выделенное')],
    ['Ctrl+Z / Ctrl+Y', t('Скасувати / повторити', 'Отменить / повторить')],
    ['Ctrl+D', t('Дублювати', 'Дублировать')],
    ['Ctrl+S', t('Зберегти у файл', 'Сохранить в файл')],
    ['1 / 2 / 3', t('2D / розділений вид / 3D', '2D / разделённый вид / 3D')],
    ['F', t('Прогулянка від першої особи', 'Прогулка от первого лица')],
    ['G', t('Прив’язка до сітки', 'Привязка к сетке')],
    ['Home', t('Показати все', 'Показать всё')],
    ['Esc', t('Скасувати дію / вийти з інструмента', 'Отменить действие / выйти из инструмента')],
    [t('Пробіл / середня кнопка', 'Пробел / средняя кнопка'), t('Панорамування плану', 'Панорамирование плана')],
    [t('Колесо миші', 'Колесо мыши'), t('Масштаб', 'Масштаб')],
    ['Shift', t('Вільний рух стіни / вільний кут / ставити кілька об’єктів', 'Свободное движение стены / свободный угол / ставить несколько объектов')],
    ['Alt', t('Не прилипати до стін під час перетягування', 'Не прилипать к стенам при перетаскивании')],
  ];
  return (
    <Dialog title={t('Довідка та гарячі клавіші', 'Справка и горячие клавиши')} onClose={onClose}>
      <ol className="help-steps">
        <li>{t('Квартира за техпаспортом: праворуч «Підкладка» → завантажте фото → «Калібрувати» → обведіть стіни інструментом «Стіна».', 'Квартира по техпаспорту: справа «Подложка» → загрузите фото → «Калибровать» → обведите стены инструментом «Стена».')}</li>
        <li>{t('Додайте двері та вікна, назвіть приміщення (клік по назві на плані), задайте оздоблення.', 'Добавьте двери и окна, назовите помещения (клик по названию на плане), задайте отделку.')}</li>
        <li>{t('Розставте меблі з вкладки «Меблі», спроєктуйте шафу в «Конструкторі меблів».', 'Расставьте мебель из вкладки «Мебель», спроектируйте шкаф в «Конструкторе мебели».')}</li>
        <li>{t('Перейдіть у 3D і натисніть «Прогулянка».', 'Перейдите в 3D и нажмите «Прогулка».')}</li>
        <li>{t('Вивантажте креслення (PDF), план (DXF), модель (glTF), специфікації (CSV).', 'Выгрузите чертежи (PDF), план (DXF), модель (glTF), спецификации (CSV).')}</li>
      </ol>
      <table className="keys">
        <tbody>
          {keys.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  const { t, ls } = useT();
  const overrides = useProject((s) => s.project.ruleOverrides);
  const rules = effectiveRules(overrides);
  const issues = useIssues();
  const cats = [...new Set(rules.map((r) => r.category))];
  const setOv = (id: string, patch: { value?: number; verified?: boolean }) => useProject.getState().update((d) => void (d.ruleOverrides[id] = { ...d.ruleOverrides[id], ...patch }));
  return (
    <Dialog title={t('Довідник норм', 'Справочник норм')} onClose={onClose} wide>
      <div className="warn-box">{ls(DISCLAIMER)}</div>
      <p className="hint">
        {t('Значення редагуються і зберігаються в проєкті. Позначка «перевірено» — ваша відмітка, що значення звірено з чинним документом. Базовий довідник: src/rules/rules.json.', 'Значения редактируются и сохраняются в проекте. Отметка «проверено» — ваша отметка, что значение сверено с действующим документом. Базовый справочник: src/rules/rules.json.')}
      </p>
      <table className="data rules-table" data-table="rules">
        <colgroup>
          <col style={{ width: '32%' }} />
          <col style={{ width: '150px' }} />
          <col />
          <col style={{ width: '96px' }} />
          <col style={{ width: '96px' }} />
        </colgroup>
        <thead>
          <tr>
            <th>{t('Правило', 'Правило')}</th>
            <th>{t('Значення', 'Значение')}</th>
            <th>{t('Джерело', 'Источник')}</th>
            <th className="center">{t('Перевірено', 'Проверено')}</th>
            <th className="center">{t('Порушень', 'Нарушений')}</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((c) => (
            <Fragment key={c}>
              <tr className="total">
                <td colSpan={5}>{ls(RULE_CATEGORIES[c] ?? { uk: c, ru: c })}</td>
              </tr>
              {rules
                .filter((r) => r.category === c)
                .map((r) => (
                  <tr key={r.id} data-rule={r.id}>
                    <td>
                      {ls(r.title)}
                      <br />
                      <code>{r.id}</code>
                    </td>
                    <td className="nowrap">{r.unit ? <NumInput value={r.value} onChange={(v) => setOv(r.id, { value: v })} unit={r.unit} digits={2} /> : '—'}</td>
                    <td className="small">{r.source}</td>
                    <td className="center">
                      <input type="checkbox" checked={r.verified} onChange={(e) => setOv(r.id, { verified: e.target.checked })} />
                    </td>
                    <td className="center" data-col="count">
                      {issues.filter((i) => i.ruleId === r.id).length || '—'}
                    </td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}

function FinishesDialog({ onClose }: { onClose: () => void }) {
  const { t, ls, lang } = useT();
  const finishes = useProject((s) => s.project.finishes);
  const mut = (id: string, fn: (f: Finish) => void) =>
    useProject.getState().update((d) => {
      const f = d.finishes.find((x) => x.id === id);
      if (f) fn(f);
    });
  const add = (type: Finish['type']) =>
    useProject.getState().update((d) => {
      const tiled = type === 'tile' || type === 'laminate' || type === 'panel';
      d.finishes.push({
        id: newId('fin'),
        name: { uk: `${FINISH_TYPE_NAMES[type].uk} (нове)`, ru: `${FINISH_TYPE_NAMES[type].ru} (новое)` },
        type,
        color: '#d8d4cc',
        target: type === 'laminate' ? ['floor'] : type === 'tile' ? ['wall', 'floor'] : ['wall', 'ceiling'],
        ...(tiled ? { tileW: type === 'tile' ? 600 : type === 'panel' ? 200 : 1380, tileH: type === 'tile' ? 300 : type === 'panel' ? 2600 : 193, grout: type === 'tile' ? 2 : 0, groutColor: '#b0b4b8', pattern: type === 'tile' ? 'grid' : 'brick', packArea: 1.5 } : {}),
      });
    });
  return (
    <Dialog
      title={t('Каталог оздоблення', 'Каталог отделки')}
      onClose={onClose}
      wide
      footer={
        <>
          <span>{t('Додати:', 'Добавить:')}</span>
          {(['paint', 'plaster', 'tile', 'laminate', 'panel', 'gkl'] as Finish['type'][]).map((ty) => (
            <button key={ty} onClick={() => add(ty)}>
              + {ls(FINISH_TYPE_NAMES[ty])}
            </button>
          ))}
        </>
      }
    >
      <table className="data">
        <thead>
          <tr>
            <th>{t('Назва', 'Название')}</th>
            <th>{t('Тип', 'Тип')}</th>
            <th>{t('Колір', 'Цвет')}</th>
            <th>{t('Застосування', 'Применение')}</th>
            <th>{t('Елемент Ш×В, мм', 'Элемент Ш×В, мм')}</th>
            <th>{t('Шов', 'Шов')}</th>
            <th>{t('Розкладка', 'Раскладка')}</th>
            <th>{t('м² в упак.', 'м² в упак.')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {finishes.map((f) => {
            const tiled = f.tileW !== undefined;
            return (
              <tr key={f.id}>
                <td>
                  <input type="text" value={f.name[lang]} onChange={(e) => mut(f.id, (x) => (x.name = { ...x.name, [lang]: e.target.value }))} />
                </td>
                <td>{ls(FINISH_TYPE_NAMES[f.type])}</td>
                <td>
                  <input type="color" value={f.color} onChange={(e) => mut(f.id, (x) => (x.color = e.target.value))} />
                </td>
                <td className="nowrap">
                  {(['wall', 'floor', 'ceiling'] as const).map((tg) => (
                    <label key={tg} className="mini-check" title={tg}>
                      <input type="checkbox" checked={f.target.includes(tg)} onChange={(e) => mut(f.id, (x) => (x.target = e.target.checked ? [...x.target, tg] : x.target.filter((q) => q !== tg)))} />
                      {tg === 'wall' ? t('ст', 'ст') : tg === 'floor' ? t('підл', 'пол') : t('стеля', 'потол')}
                    </label>
                  ))}
                </td>
                <td className="nowrap">
                  {tiled && (
                    <>
                      <NumInput value={f.tileW ?? 0} min={10} max={5000} onChange={(v) => mut(f.id, (x) => (x.tileW = v))} /> × <NumInput value={f.tileH ?? 0} min={10} max={5000} onChange={(v) => mut(f.id, (x) => (x.tileH = v))} />
                    </>
                  )}
                </td>
                <td>{tiled && <NumInput value={f.grout ?? 0} min={0} max={20} onChange={(v) => mut(f.id, (x) => (x.grout = v))} />}</td>
                <td>
                  {tiled && (
                    <select value={f.pattern ?? 'grid'} onChange={(e) => mut(f.id, (x) => (x.pattern = e.target.value as Finish['pattern']))}>
                      <option value="grid">{t('Шов у шов', 'Шов в шов')}</option>
                      <option value="brick">{t('Урозбіжку', 'Вразбежку')}</option>
                      <option value="diagonal">{t('Діагональ', 'Диагональ')}</option>
                    </select>
                  )}
                </td>
                <td>{tiled && <NumInput value={f.packArea ?? 0} min={0} max={50} digits={2} onChange={(v) => mut(f.id, (x) => (x.packArea = v))} />}</td>
                <td>
                  <button className="icon-btn danger" title={t('Видалити', 'Удалить')} onClick={() => useProject.getState().update((d) => void (d.finishes = d.finishes.filter((x) => x.id !== f.id)))}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Dialog>
  );
}

function GroupsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const project = useProject((s) => s.project);
  const sum = networkSummary(project);
  const mut = (id: string, fn: (g: Project['electrical']['groups'][number]) => void) =>
    useProject.getState().update((d) => {
      const g = d.electrical.groups.find((x) => x.id === id);
      if (g) fn(g);
    });
  return (
    <Dialog
      title={t('Електричні групи та автомати', 'Электрические группы и автоматы')}
      onClose={onClose}
      wide
      footer={
        <button onClick={() => useProject.getState().update((d) => void d.electrical.groups.push({ id: newId('g'), name: t('Нова група', 'Новая группа'), breaker: 16, section: 2.5, cores: 3, rcd: true, color: '#10b981' }))}>
          + {t('Група', 'Группа')}
        </button>
      }
    >
      <table className="data">
        <thead>
          <tr>
            <th />
            <th>{t('Назва', 'Название')}</th>
            <th>{t('Автомат, А', 'Автомат, А')}</th>
            <th>{t('Кабель, мм²', 'Кабель, мм²')}</th>
            <th>{t('ПЗВ', 'УЗО')}</th>
            <th>{t('Точок', 'Точек')}</th>
            <th>{t('Навантаження', 'Нагрузка')}</th>
            <th>{t('Струм', 'Ток')}</th>
            <th>{t('Кабель у трасах', 'Кабель в трассах')}</th>
            <th>{t('Перевірка', 'Проверка')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sum.groups.map((g) => {
            const src = project.electrical.groups.find((x) => x.id === g.id)!;
            const amp = cableAmpacity(g.section);
            const problems: string[] = [];
            if (g.currentA > g.breaker) problems.push(t('навантаження більше номіналу автомата', 'нагрузка больше номинала автомата'));
            if (g.breaker > amp) problems.push(t(`автомат ${g.breaker} А завеликий для кабелю ${g.section} мм² (до ~${amp} А)`, `автомат ${g.breaker} А велик для кабеля ${g.section} мм² (до ~${amp} А)`));
            return (
              <tr key={g.id}>
                <td>
                  <input type="color" value={src.color} onChange={(e) => mut(g.id, (x) => (x.color = e.target.value))} />
                </td>
                <td>
                  <input type="text" value={g.name} onChange={(e) => mut(g.id, (x) => (x.name = e.target.value))} />
                </td>
                <td>
                  <select value={g.breaker} onChange={(e) => mut(g.id, (x) => (x.breaker = Number(e.target.value)))}>
                    {[6, 10, 16, 20, 25, 32, 40, 50, 63].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={g.section} onChange={(e) => mut(g.id, (x) => (x.section = Number(e.target.value)))}>
                    {[1.5, 2.5, 4, 6, 10].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </td>
                <td className="center">
                  <input type="checkbox" checked={g.rcd} onChange={(e) => mut(g.id, (x) => (x.rcd = e.target.checked))} />
                </td>
                <td className="center">{g.points}</td>
                <td>{g.loadW} Вт</td>
                <td>{fmt(g.currentA, 1)} А</td>
                <td>{fmt(g.cableM)} м</td>
                <td className={problems.length ? 'bad' : 'ok'}>{problems.length ? problems.join('; ') : 'OK'}</td>
                <td>
                  <button className="icon-btn danger" onClick={() => useProject.getState().update((d) => void (d.electrical.groups = d.electrical.groups.filter((x) => x.id !== g.id)))}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h4>{t('Кабель за перерізами', 'Кабель по сечениям')}</h4>
      <table className="data">
        <thead>
          <tr>
            <th>{t('Марка', 'Марка')}</th>
            <th>{t('Чиста довжина', 'Чистая длина')}</th>
            <th>{t('Із запасом 10%', 'С запасом 10%')}</th>
          </tr>
        </thead>
        <tbody>
          {sum.cables.map((c) => (
            <tr key={c.key}>
              <td>ВВГнг {c.key}</td>
              <td>{fmt(c.netM)} м</td>
              <td>{c.grossM} м</td>
            </tr>
          ))}
          {sum.chases.map((c) => (
            <tr key={c.key}>
              <td>
                {t('Штроба', 'Штроба')} {c.key} мм
              </td>
              <td>{fmt(c.lengthM)} м</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{t('Групу призначають розетці, вимикачу, світильнику та кабельній трасі у властивостях об’єкта. Довжина кабелю = довжина трас у плані + опуски до приладів. Допустимі струми кабелю — орієнтовні, уточнюйте за ПУЕ.', 'Группу назначают розетке, выключателю, светильнику и кабельной трассе в свойствах объекта. Длина кабеля = длина трасс в плане + опуски к приборам. Допустимые токи кабеля — ориентировочные, уточняйте по ПУЭ.')}</p>
    </Dialog>
  );
}

export function BasicDialogs() {
  const dialog = useUi((s) => s.dialog);
  const close = () => useUi.getState().setDialog(null);
  switch (dialog) {
    case 'new':
      return <NewProjectDialog onClose={close} />;
    case 'projects':
      return <ProjectsDialog onClose={close} />;
    case 'help':
      return <HelpDialog onClose={close} />;
    case 'rules':
      return <RulesDialog onClose={close} />;
    case 'finishes':
      return <FinishesDialog onClose={close} />;
    case 'groups':
      return <GroupsDialog onClose={close} />;
    default:
      return null;
  }
}
