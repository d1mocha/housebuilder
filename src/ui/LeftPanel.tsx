// Левая панель: инструменты построения, библиотека, инженерные системы, участок.
import { useMemo, useState } from 'react';
import { WALL_MATERIALS } from '../catalog/finishes';
import { GROUP_NAMES, allItemDefs, allRouteDefs, allZoneDefs } from '../catalog/registry';
import type { ItemDef, RouteDef, ZoneDef } from '../catalog/registry';
import { useT } from '../i18n';
import { newId } from '../model/ids';
import type { CustomModel, LayerId } from '../model/types';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import type { Mode, ToolId } from '../store/uiStore';
import { CatalogSearch, ItemCard, KindCard, matches } from './Catalog';
import { Check, Num, Section, Select } from './fields';

const TOOLS: { id: ToolId; key: string; uk: string; ru: string; icon: string }[] = [
  { id: 'select', key: 'V', uk: 'Вибір', ru: 'Выбор', icon: '↖' },
  { id: 'wall', key: 'W', uk: 'Стіна', ru: 'Стена', icon: '▬' },
  { id: 'arc', key: 'A', uk: 'Дуга', ru: 'Дуга', icon: '◠' },
  { id: 'room', key: 'R', uk: 'Кімната', ru: 'Комната', icon: '▭' },
  { id: 'door', key: 'D', uk: 'Двері', ru: 'Дверь', icon: '🚪' },
  { id: 'window', key: 'N', uk: 'Вікно', ru: 'Окно', icon: '▦' },
  { id: 'portal', key: 'O', uk: 'Проріз', ru: 'Проём', icon: '⊓' },
  { id: 'dim', key: 'M', uk: 'Розмір', ru: 'Размер', icon: '↔' },
  { id: 'measure', key: 'T', uk: 'Рулетка', ru: 'Рулетка', icon: '📏' },
];

function BuildTab() {
  const { t, ls } = useT();
  const tool = useUi((s) => s.tool);
  const wd = useUi((s) => s.wallDefaults);
  const snapGrid = useUi((s) => s.snapGrid);
  const snapAngle = useUi((s) => s.snapAngle);
  const autoDims = useUi((s) => s.autoDims);
  const set = useUi((s) => s.set);
  const setWd = (p: Partial<typeof wd>) => set({ wallDefaults: { ...wd, ...p } });
  return (
    <>
      <Section title={t('Інструменти', 'Инструменты')}>
        <div className="tool-grid">
          {TOOLS.map((x) => (
            <button key={x.id} className={`tool ${tool === x.id ? 'active' : ''}`} onClick={() => useUi.getState().setTool(x.id)} title={`${t(x.uk, x.ru)} (${x.key})`} data-tool={x.id}>
              <span className="tool-icon">{x.icon}</span>
              <span>{t(x.uk, x.ru)}</span>
              <kbd>{x.key}</kbd>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('Нова стіна', 'Новая стена')}>
        <Num label={t('Товщина', 'Толщина')} value={wd.thickness} min={30} max={1000} step={10} unit="мм" onChange={(v) => setWd({ thickness: v })} />
        <Select
          label={t('Матеріал', 'Материал')}
          value={wd.material}
          options={WALL_MATERIALS.map((m) => ({ value: m.id, label: ls(m.name) }))}
          onChange={(v) => setWd({ material: v, thickness: WALL_MATERIALS.find((m) => m.id === v)?.thickness ?? wd.thickness })}
        />
        <Check label={t('Несуча', 'Несущая')} value={wd.loadBearing} onChange={(v) => setWd({ loadBearing: v })} />
        <Check label={t('Зовнішня', 'Наружная')} value={wd.exterior} onChange={(v) => setWd({ exterior: v })} />
        <div className="preset-row">
          {[
            [t('Перегородка 120', 'Перегородка 120'), { thickness: 120, material: 'brick', loadBearing: false, exterior: false }],
            [t('Несуча 250', 'Несущая 250'), { thickness: 250, material: 'brick', loadBearing: true, exterior: false }],
            [t('Зовнішня 400', 'Наружная 400'), { thickness: 400, material: 'aerated', loadBearing: true, exterior: true }],
            [t('ГКЛ 100', 'ГКЛ 100'), { thickness: 100, material: 'gkl', loadBearing: false, exterior: false }],
          ].map(([name, v]) => (
            <button key={name as string} className="chip" onClick={() => setWd(v as typeof wd)}>
              {name as string}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('Прив’язки', 'Привязки')}>
        <Check label={t('До сітки (G)', 'К сетке (G)')} value={snapGrid} onChange={(v) => set({ snapGrid: v })} />
        <Check label={t('Кути кратні 45°', 'Углы кратные 45°')} value={snapAngle} onChange={(v) => set({ snapAngle: v })} />
        <Check label={t('Авторозміри приміщень', 'Авторазмеры помещений')} value={autoDims} onChange={(v) => set({ autoDims: v })} />
        <p className="hint">{t('Вузли та осі стін прив’язуються завжди. Під час малювання стіни введіть довжину цифрами й натисніть Enter.', 'Узлы и оси стен привязываются всегда. При рисовании стены введите длину цифрами и нажмите Enter.')}</p>
      </Section>
    </>
  );
}

/** Раздел «Обране»: избранные объекты, трассы и зоны слоёв текущего режима. */
function Favorites({ layers, q }: { layers: LayerId[]; q: string }) {
  const { t, ls } = useT();
  const favs = useUi((s) => s.favorites);
  const tool = useUi((s) => s.tool);
  const toolKind = useUi((s) => s.toolKind);
  const items = allItemDefs().filter((d) => favs.includes(d.kind) && layers.includes(d.layer) && !d.hidden && matches(ls(d.name), q));
  const routes = allRouteDefs().filter((d) => favs.includes(d.kind) && layers.includes(d.layer) && matches(ls(d.name), q));
  const zones = allZoneDefs().filter((d) => favs.includes(d.kind) && layers.includes(d.layer) && matches(ls(d.name), q));
  if (!items.length && !routes.length && !zones.length) return null;
  return (
    <Section title={`★ ${t('Обране', 'Избранное')} · ${items.length + routes.length + zones.length}`}>
      <div className="lib-grid cards" data-favorites>
        {items.map((d) => (
          <ItemCard key={d.kind} def={d} label={ls(d.name)} favKey={d.kind} active={tool === 'item' && toolKind === d.kind} onPick={() => useUi.getState().setTool('item', d.kind)} />
        ))}
        {routes.map((d) => (
          <KindCard key={d.kind} def={d} type="route" label={ls(d.name)} active={tool === 'route' && toolKind === d.kind} onPick={() => useUi.getState().setTool('route', d.kind)} />
        ))}
        {zones.map((d) => (
          <KindCard key={d.kind} def={d} type="zone" label={ls(d.name)} active={tool === 'zone' && toolKind === d.kind} onPick={() => useUi.getState().setTool('zone', d.kind)} />
        ))}
      </div>
    </Section>
  );
}

function LibraryTab() {
  const { t, ls } = useT();
  const [q, setQ] = useState('');
  const tool = useUi((s) => s.tool);
  const toolKind = useUi((s) => s.toolKind);
  const toolParams = useUi((s) => s.toolParams);
  const cabinets = useProject((s) => s.project.cabinets);
  const models = useProject((s) => s.project.models);
  const groups = useMemo(() => {
    const defs = allItemDefs().filter((d) => d.layer === 'furniture' && !d.hidden);
    const map = new Map<string, ItemDef[]>();
    for (const d of defs) {
      if (!matches(ls(d.name), q)) continue;
      map.set(d.group, [...(map.get(d.group) ?? []), d]);
    }
    return [...map.entries()];
  }, [q, ls]);
  const importModel = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const format = ext === 'obj' ? 'obj' : ext === 'gltf' ? 'gltf' : 'glb';
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    try {
      const { inspectModel } = await import('../view3d/models');
      const bb = await inspectModel(format, dataUrl);
      const model: CustomModel = { id: newId('mdl'), name: file.name.replace(/\.[^.]+$/, ''), format, dataUrl, bbox: bb };
      useProject.getState().update((d) => void d.models.push(model));
      useUi.getState().notify(t('Модель імпортовано — оберіть її у бібліотеці та поставте на план', 'Модель импортирована — выберите её в библиотеке и поставьте на план'));
    } catch (e) {
      useUi.getState().notify(`${t('Не вдалося прочитати модель', 'Не удалось прочитать модель')}: ${(e as Error).message ?? e}`);
    }
  };
  const modelParams = (m: CustomModel) => {
    // модели в метрах (glTF) переводим в мм; если габарит уже большой — считаем, что это мм
    const k = Math.max(m.bbox.w, m.bbox.d, m.bbox.h) < 50 ? 1000 : 1;
    return { modelId: m.id, w: Math.round(m.bbox.w * k), d: Math.round(m.bbox.d * k), h: Math.round(m.bbox.h * k) };
  };
  const cabParams = (c: (typeof cabinets)[number]) => ({ designId: c.id, w: c.width, d: c.depth, h: c.height });
  const found = groups.reduce((s, [, defs]) => s + defs.length, 0);
  return (
    <>
      <CatalogSearch value={q} onChange={setQ} />
      <Favorites layers={['furniture']} q={q} />
      <Section title={t('Власні вироби та моделі', 'Свои изделия и модели')}>
        <button className="primary" onClick={() => useUi.getState().setDialog('cabinet', null)}>
          {t('Конструктор корпусних меблів…', 'Конструктор корпусной мебели…')}
        </button>
        <div className="lib-grid cards">
          {cabinets
            .filter((c) => matches(c.name, q))
            .map((c) => (
              <ItemCard key={c.id} def={undefined} cabinet={c} params={cabParams(c)} label={`${c.name} ${c.width}×${c.height}×${c.depth}`} active={tool === 'item' && toolKind === 'cabinet' && toolParams.designId === c.id} onPick={() => useUi.getState().setTool('item', 'cabinet', cabParams(c))} />
            ))}
        </div>
        <label className="file-btn">
          {t('Імпорт моделі glTF / GLB / OBJ…', 'Импорт модели glTF / GLB / OBJ…')}
          <input type="file" accept=".gltf,.glb,.obj" onChange={(e) => e.target.files?.[0] && importModel(e.target.files[0])} />
        </label>
        {models.map((m) => (
          <button key={m.id} className={`lib-item ${tool === 'item' && toolKind === 'model' && toolParams.modelId === m.id ? 'active' : ''}`} onClick={() => useUi.getState().setTool('item', 'model', modelParams(m))} title={m.name}>
            <i className="swatch" style={{ background: '#94a3b8' }} />
            <span>{m.name}</span>
          </button>
        ))}
      </Section>
      {groups.map(([g, defs]) => (
        <Section key={g} title={`${ls(GROUP_NAMES[g])} · ${defs.length}`}>
          <div className="lib-grid cards">
            {defs.map((d) => (
              <ItemCard key={d.kind} def={d} label={ls(d.name)} favKey={d.kind} active={tool === 'item' && toolKind === d.kind} onPick={() => useUi.getState().setTool('item', d.kind)} />
            ))}
          </div>
        </Section>
      ))}
      {q && found === 0 && <p className="hint pad">{t('Нічого не знайдено', 'Ничего не найдено')}</p>}
      <p className="hint pad">{t('Клік по картці — інструмент встановлення; картку можна перетягнути просто на план або в 3D-вікно. ☆ — додати в обране.', 'Клик по карточке — инструмент постановки; карточку можно перетащить прямо на план или в 3D-окно. ☆ — добавить в избранное.')}</p>
    </>
  );
}

function KindsSection({ layer, title, extra, q }: { layer: LayerId; title: string; extra?: React.ReactNode; q: string }) {
  const { t, ls } = useT();
  const tool = useUi((s) => s.tool);
  const toolKind = useUi((s) => s.toolKind);
  const items: ItemDef[] = allItemDefs().filter((d) => d.layer === layer && !d.hidden && matches(ls(d.name), q));
  const routes: RouteDef[] = allRouteDefs().filter((d) => d.layer === layer && matches(ls(d.name), q));
  const zones: ZoneDef[] = allZoneDefs().filter((d) => d.layer === layer && matches(ls(d.name), q));
  const pick = (tl: ToolId, kind: string) => {
    const ui = useUi.getState();
    if (!ui.layers[layer].visible) ui.toggleLayer(layer, 'visible');
    ui.setTool(tl, kind);
  };
  if (q && !items.length && !routes.length && !zones.length) return null;
  return (
    <Section title={title}>
      {extra}
      <div className="lib-grid cards">
        {items.map((d) => (
          <ItemCard key={d.kind} def={d} label={ls(d.name)} favKey={d.kind} active={tool === 'item' && toolKind === d.kind} onPick={() => pick('item', d.kind)} />
        ))}
        {routes.map((d) => (
          <KindCard key={d.kind} def={d} type="route" label={ls(d.name)} active={tool === 'route' && toolKind === d.kind} onPick={() => pick('route', d.kind)} />
        ))}
        {zones.map((d) => (
          <KindCard key={d.kind} def={d} type="zone" label={ls(d.name)} active={tool === 'zone' && toolKind === d.kind} onPick={() => pick('zone', d.kind)} />
        ))}
      </div>
      {(routes.length > 0 || zones.length > 0) && <p className="hint">{t('Траси й зони: клацайте точки, Enter або подвійний клік — завершити, Backspace — прибрати точку.', 'Трассы и зоны: щёлкайте точки, Enter или двойной клик — завершить, Backspace — убрать точку.')}</p>}
    </Section>
  );
}

function ElectricalTab() {
  const { t } = useT();
  const [q, setQ] = useState('');
  return (
    <>
      <CatalogSearch value={q} onChange={setQ} />
      <Favorites layers={['electrical']} q={q} />
      <KindsSection layer="electrical" q={q} title={t('Електрика', 'Электрика')} extra={<button onClick={() => useUi.getState().setDialog('groups')}>{t('Групи та автомати…', 'Группы и автоматы…')}</button>} />
    </>
  );
}

function WaterTab() {
  const { t } = useT();
  const [q, setQ] = useState('');
  return (
    <>
      <CatalogSearch value={q} onChange={setQ} />
      <Favorites layers={['plumbing']} q={q} />
      <KindsSection layer="plumbing" q={q} title={t('Водопровід і каналізація', 'Водопровод и канализация')} />
    </>
  );
}

function HeatingTab() {
  const { t } = useT();
  const [q, setQ] = useState('');
  return (
    <>
      <CatalogSearch value={q} onChange={setQ} />
      <Favorites layers={['heating', 'gas', 'ventilation']} q={q} />
      <KindsSection layer="heating" q={q} title={t('Опалення', 'Отопление')} />
      <KindsSection
        layer="gas"
        q={q}
        title={t('Газ', 'Газ')}
        extra={<div className="warn-box">{t('Лише відображення точок. Проєктування та підключення газу виконує тільки ліцензована організація (оператор ГРМ).', 'Только отображение точек. Проектирование и подключение газа выполняет только лицензированная организация (оператор ГРМ).')}</div>}
      />
      <KindsSection layer="ventilation" q={q} title={t('Вентиляція', 'Вентиляция')} />
    </>
  );
}

function SiteTab() {
  const { t, ls } = useT();
  const [q, setQ] = useState('');
  const tool = useUi((s) => s.tool);
  const toolKind = useUi((s) => s.toolKind);
  const hasSite = useProject((s) => !!s.project.site);
  const byGroup = useMemo(() => {
    type E = { tl: ToolId; kind: string; label: string; item?: ItemDef; route?: RouteDef; zone?: ZoneDef };
    const m = new Map<string, E[]>();
    const push = (g: string, e: E) => matches(e.label, q) && m.set(g, [...(m.get(g) ?? []), e]);
    for (const d of allItemDefs().filter((x) => x.layer === 'landscape')) push(d.group, { tl: 'item', kind: d.kind, label: ls(d.name), item: d });
    for (const d of allRouteDefs().filter((x) => x.layer === 'landscape')) push(d.group, { tl: 'route', kind: d.kind, label: ls(d.name), route: d });
    for (const d of allZoneDefs().filter((x) => x.layer === 'landscape')) push(d.group, { tl: 'zone', kind: d.kind, label: ls(d.name), zone: d });
    return [...m.entries()];
  }, [ls, q]);
  if (!hasSite) return <p className="hint pad">{t('Ділянка доступна для проєктів типу «Приватний будинок».', 'Участок доступен для проектов типа «Частный дом».')}</p>;
  return (
    <>
      <CatalogSearch value={q} onChange={setQ} />
      <Favorites layers={['landscape']} q={q} />
      <Section title={t('Ділянка', 'Участок')}>
        <button onClick={() => useUi.getState().select({ type: 'site', id: 'site', scope: 'site' })}>{t('Межі, рельєф, сторони світу…', 'Границы, рельеф, стороны света…')}</button>
        <p className="hint">{t('Виділіть ділянку, щоб перетягувати вершини межі та задати позначки рельєфу, північ і тінь від сонця.', 'Выделите участок, чтобы перетаскивать вершины границы и задать отметки рельефа, север и тень от солнца.')}</p>
      </Section>
      {byGroup.map(([g, list]) => (
        <Section key={g} title={ls(GROUP_NAMES[g])}>
          <div className="lib-grid cards">
            {list.map((e) =>
              e.item ? (
                <ItemCard key={e.kind} def={e.item} label={e.label} favKey={e.kind} active={tool === e.tl && toolKind === e.kind} onPick={() => useUi.getState().setTool(e.tl, e.kind)} />
              ) : (
                <KindCard key={e.kind} def={(e.route ?? e.zone)!} type={e.route ? 'route' : 'zone'} label={e.label} active={tool === e.tl && toolKind === e.kind} onPick={() => useUi.getState().setTool(e.tl, e.kind)} />
              ),
            )}
          </div>
        </Section>
      ))}
    </>
  );
}

/** Режимы работы: в каждом видны и кликабельны только свои слои, остальные приглушены. */
export const MODES: { id: Mode; uk: string; ru: string; icon: string; hintUk: string; hintRu: string }[] = [
  { id: 'plan', uk: 'План', ru: 'План', icon: '▦', hintUk: 'Стіни, прорізи, приміщення, розміри', hintRu: 'Стены, проёмы, помещения, размеры' },
  { id: 'furniture', uk: 'Меблі', ru: 'Мебель', icon: '🛋', hintUk: 'Меблі, техніка, сантехніка', hintRu: 'Мебель, техника, сантехника' },
  { id: 'electrical', uk: 'Електрика', ru: 'Электрика', icon: '⚡', hintUk: 'Розетки, вимикачі, світло, кабелі', hintRu: 'Розетки, выключатели, свет, кабели' },
  { id: 'water', uk: 'Вода', ru: 'Вода', icon: '💧', hintUk: 'Водопровід і каналізація', hintRu: 'Водопровод и канализация' },
  { id: 'heating', uk: 'Опалення', ru: 'Отопление', icon: '♨', hintUk: 'Опалення, газ, вентиляція', hintRu: 'Отопление, газ, вентиляция' },
  { id: 'site', uk: 'Ділянка', ru: 'Участок', icon: '🌳', hintUk: 'Ділянка, доріжки, насадження', hintRu: 'Участок, дорожки, насаждения' },
];

export function LeftPanel() {
  const { t } = useT();
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const kind = useProject((s) => s.project.kind);
  const modes = MODES.filter((m) => m.id !== 'site' || kind === 'house');
  return (
    <aside className="left-panel">
      <nav className="tabs mode-tabs" data-mode={mode}>
        {modes.map((m) => (
          <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)} data-tab={m.id} title={t(m.hintUk, m.hintRu)}>
            <span className="mode-icon">{m.icon}</span>
            <span>{t(m.uk, m.ru)}</span>
          </button>
        ))}
      </nav>
      <div className="panel-scroll">
        {mode === 'plan' && <BuildTab />}
        {mode === 'furniture' && <LibraryTab />}
        {mode === 'electrical' && <ElectricalTab />}
        {mode === 'water' && <WaterTab />}
        {mode === 'heating' && <HeatingTab />}
        {mode === 'site' && <SiteTab />}
      </div>
    </aside>
  );
}
