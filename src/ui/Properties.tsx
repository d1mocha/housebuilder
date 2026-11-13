// Панель свойств выделенного объекта: точный ввод чисел для любой сущности.
import { useMemo } from 'react';
import { networkSummary, routeLengthWithDrops, sewerDrop } from '../calc/networks';
import { isTiled, tileLayout, tileLayoutRect } from '../calc/tiles';
import { underfloorCalc } from '../calc/underfloor';
import { ROOM_TYPE_NAMES, WALL_MATERIALS } from '../catalog/finishes';
import { itemDef, num, routeDef, zoneDef } from '../catalog/registry';
import type { ParamDef } from '../catalog/registry';
import { itemSize } from '../draw2d/plan';
import { fmt, useT } from '../i18n';
import { snapshotBaseline } from '../model/demo';
import { createLevel } from '../model/defaults';
import { add, dist, mul, norm, polygonArea, polylineLength, sub } from '../model/geometry';
import { duplicateEntity, findEntity, getContainer, getLevel, removeEntity } from '../model/ops';
import type { Dim, ElementStatus, Finish, Item, Level, Opening, Params, ParamValue, Project, Room, Route, Sel, Wall, Zone } from '../model/types';
import { clampOpeningPos, roomSurfaces, surfaceNetArea, wallLen, wallLength } from '../model/walls';
import { ruleValue } from '../rules';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import { Check, Color, Info, Num, Section, Select, Text } from './fields';

const upd = (fn: (d: Project) => void) => useProject.getState().update(fn);

function ParamsForm({ defs, params, onChange, project }: { defs: ParamDef[]; params: Params; onChange: (key: string, v: ParamValue) => void; project: Project }) {
  const { ls } = useT();
  return (
    <>
      {defs.map((d) => {
        const v = params[d.key];
        if (d.type === 'number') return <Num key={d.key} label={ls(d.label)} value={typeof v === 'number' ? v : 0} min={d.min} max={d.max} step={d.step} unit={d.unit} onChange={(x) => onChange(d.key, x)} />;
        if (d.type === 'select') {
          const numeric = typeof v === 'number';
          return <Select key={d.key} label={ls(d.label)} value={String(v ?? '')} options={(d.options ?? []).map((o) => ({ value: o.value, label: ls(o.label) }))} onChange={(x) => onChange(d.key, numeric || /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x)} />;
        }
        if (d.type === 'bool') return <Check key={d.key} label={ls(d.label)} value={!!v} onChange={(x) => onChange(d.key, x)} />;
        if (d.type === 'color') return <Color key={d.key} label={ls(d.label)} value={String(v ?? '#cccccc')} onChange={(x) => onChange(d.key, x)} />;
        if (d.type === 'group') return <Select key={d.key} label={ls(d.label)} value={String(v ?? '')} options={[{ value: '', label: '—' }, ...project.electrical.groups.map((g) => ({ value: g.id, label: `${g.name} (${g.breaker} А)` }))]} onChange={(x) => onChange(d.key, x)} />;
        return <Text key={d.key} label={ls(d.label)} value={String(v ?? '')} onChange={(x) => onChange(d.key, x)} />;
      })}
    </>
  );
}

function FinishSelect({ label, value, target, onChange, project }: { label: string; value: string; target: 'wall' | 'floor' | 'ceiling'; onChange: (id: string) => void; project: Project }) {
  const { ls } = useT();
  const opts = project.finishes.filter((f) => f.target.includes(target) || f.id === value).map((f) => ({ value: f.id, label: ls(f.name) }));
  return <Select label={label} value={value} options={opts} onChange={onChange} />;
}

const STATUS_NAMES: Record<ElementStatus, [string, string]> = {
  existing: ['Існуюче', 'Существующее'],
  demolish: ['Демонтаж', 'Демонтаж'],
  new: ['Нове', 'Новое'],
};

function StatusSelect({ value, onChange }: { value: ElementStatus; onChange: (v: ElementStatus) => void }) {
  const { t } = useT();
  return (
    <Select
      label={t('Статус', 'Статус')}
      value={value}
      options={(Object.keys(STATUS_NAMES) as ElementStatus[]).map((k) => ({ value: k, label: t(STATUS_NAMES[k][0], STATUS_NAMES[k][1]) }))}
      onChange={(v) => onChange(v as ElementStatus)}
    />
  );
}

function Actions({ sel }: { sel: Sel }) {
  const { t } = useT();
  return (
    <div className="row actions">
      {sel.type !== 'room' && sel.type !== 'site' && sel.type !== 'dim' && (
        <button
          onClick={() => {
            let ns: Sel | null = null;
            upd((d) => {
              ns = duplicateEntity(d, sel);
            });
            if (ns) useUi.getState().select(ns);
          }}
        >
          {t('Дублювати', 'Дублировать')}
        </button>
      )}
      {sel.type !== 'room' && sel.type !== 'site' && (
        <button
          className="danger"
          onClick={() => {
            upd((d) => removeEntity(d, sel));
            useUi.getState().select(null);
          }}
        >
          {t('Видалити', 'Удалить')}
        </button>
      )}
    </div>
  );
}

function WallProps({ wall, sel, project }: { wall: Wall; sel: Sel; project: Project }) {
  const { t, ls } = useT();
  const mut = (fn: (w: Wall) => void) =>
    upd((d) => {
      const w = getLevel(d, sel.scope)?.walls.find((x) => x.id === sel.id);
      if (w) fn(w);
    });
  const level = getLevel(project, sel.scope)!;
  return (
    <Section title={t('Стіна', 'Стена')}>
      <Num
        label={t('Довжина (по осі)', 'Длина (по оси)')}
        value={wall.arc ? wallLen(wall) : wallLength(wall)}
        disabled={!!wall.arc}
        min={50}
        unit="мм"
        digits={0}
        onChange={(v) =>
          mut((w) => {
            const dir = norm(sub(w.b, w.a));
            const nb = add(w.a, mul(dir, v));
            w.b = { x: Math.round(nb.x), y: Math.round(nb.y) };
          })
        }
        title={t('Змінюється положення кінця B', 'Меняется положение конца B')}
      />
      <Num label={t('Товщина', 'Толщина')} value={wall.thickness} min={30} max={1000} step={10} unit="мм" onChange={(v) => mut((w) => (w.thickness = v))} />
      <Num label={t('Висота (0 — як поверх)', 'Высота (0 — как этаж)')} value={wall.height ?? 0} min={0} max={10000} step={50} unit="мм" onChange={(v) => mut((w) => (v > 0 ? (w.height = v) : delete w.height))} />
      <Select
        label={t('Матеріал', 'Материал')}
        value={wall.material}
        options={WALL_MATERIALS.map((m) => ({ value: m.id, label: ls(m.name) }))}
        onChange={(v) => mut((w) => (w.material = v))}
      />
      <Check label={t('Несуча', 'Несущая')} value={wall.loadBearing} onChange={(v) => mut((w) => (w.loadBearing = v))} />
      <Check label={t('Зовнішня', 'Наружная')} value={!!wall.exterior} onChange={(v) => mut((w) => (w.exterior = v))} />
      <StatusSelect value={wall.status ?? 'new'} onChange={(v) => mut((w) => (w.status = v))} />
      <Num label={t('Стріла дуги (0 — пряма)', 'Стрела дуги (0 — прямая)')} value={wall.arc ?? 0} min={-20000} max={20000} step={50} unit="мм" title={t('Додатне значення — вигин у бік L', 'Положительное значение — выгиб в сторону L')} onChange={(v) => mut((w) => (Math.abs(v) >= 1 ? (w.arc = v) : delete w.arc))} />
      <FinishSelect label={t('Оздоблення, бік L', 'Отделка, сторона L')} value={wall.finishL} target="wall" project={project} onChange={(v) => mut((w) => (w.finishL = v))} />
      <FinishSelect label={t('Оздоблення, бік R', 'Отделка, сторона R')} value={wall.finishR} target="wall" project={project} onChange={(v) => mut((w) => (w.finishR = v))} />
      <div className="grid2">
        <Num label="A · X" value={wall.a.x} digits={0} onChange={(v) => mut((w) => (w.a.x = v))} />
        <Num label="A · Y" value={wall.a.y} digits={0} onChange={(v) => mut((w) => (w.a.y = v))} />
        <Num label="B · X" value={wall.b.x} digits={0} onChange={(v) => mut((w) => (w.b.x = v))} />
        <Num label="B · Y" value={wall.b.y} digits={0} onChange={(v) => mut((w) => (w.b.y = v))} />
      </div>
      <Info label={t('Об’єм кладки', 'Объём кладки')} value={`${fmt((wallLength(wall) * wall.thickness * (wall.height ?? level.height)) / 1e9, 2)} м³`} />
      <p className="hint">{t('Бік L — ліворуч від напрямку A→B. Щоб задати різне оздоблення частин стіни — розділіть її (контекстне меню).', 'Сторона L — слева от направления A→B. Чтобы задать разную отделку частей стены — разделите её (контекстное меню).')}</p>
      <Actions sel={sel} />
    </Section>
  );
}

function OpeningProps({ o, sel, project }: { o: Opening; sel: Sel; project: Project }) {
  const { t } = useT();
  const level = getLevel(project, sel.scope)!;
  const wall = level.walls.find((w) => w.id === o.wallId);
  const mut = (fn: (x: Opening) => void) =>
    upd((d) => {
      const x = getLevel(d, sel.scope)?.openings.find((q) => q.id === sel.id);
      if (x) fn(x);
    });
  const title = o.kind === 'door' ? t('Двері', 'Дверь') : o.kind === 'window' ? t('Вікно', 'Окно') : t('Проріз', 'Проём');
  return (
    <Section title={title}>
      <Select
        label={t('Тип', 'Тип')}
        value={o.kind}
        options={[
          { value: 'door', label: t('Двері', 'Дверь') },
          { value: 'window', label: t('Вікно', 'Окно') },
          { value: 'portal', label: t('Проріз без заповнення', 'Проём без заполнения') },
        ]}
        onChange={(v) => mut((x) => (x.kind = v as Opening['kind']))}
      />
      <Num label={t('Ширина', 'Ширина')} value={o.width} min={300} max={6000} step={50} unit="мм" onChange={(v) => mut((x) => (x.width = v))} />
      <Num label={t('Висота', 'Высота')} value={o.height} min={300} max={4000} step={50} unit="мм" onChange={(v) => mut((x) => (x.height = v))} />
      <Num label={t('Низ від підлоги', 'Низ от пола')} value={o.sill} min={0} max={3000} step={50} unit="мм" onChange={(v) => mut((x) => (x.sill = v))} />
      {wall && (
        <>
          <Num label={t('Від кінця A до краю', 'От конца A до края')} value={o.pos - o.width / 2} digits={0} unit="мм" onChange={(v) => mut((x) => (x.pos = clampOpeningPos(v + x.width / 2, x.width, wall, 0)))} />
          <Num label={t('Від краю до кінця B', 'От края до конца B')} value={wallLength(wall) - o.pos - o.width / 2} digits={0} unit="мм" onChange={(v) => mut((x) => (x.pos = clampOpeningPos(wallLength(wall) - v - x.width / 2, x.width, wall, 0)))} />
        </>
      )}
      {o.kind === 'door' && (
        <>
          <Select
            label={t('Вид дверей', 'Вид двери')}
            value={o.style}
            options={[
              { value: 'single', label: t('Одностулкові', 'Одностворчатая') },
              { value: 'double', label: t('Двостулкові', 'Двустворчатая') },
              { value: 'sliding', label: t('Розсувні', 'Раздвижная') },
              { value: 'entrance', label: t('Вхідні', 'Входная') },
            ]}
            onChange={(v) => mut((x) => (x.style = v as Opening['style']))}
          />
          <Select label={t('Петлі біля кінця', 'Петли у конца')} value={o.hinge} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} onChange={(v) => mut((x) => (x.hinge = v as 'a' | 'b'))} />
          <Select label={t('Відкривання в бік', 'Открывание в сторону')} value={o.swing} options={[{ value: 'L', label: 'L' }, { value: 'R', label: 'R' }]} onChange={(v) => mut((x) => (x.swing = v as 'L' | 'R'))} />
        </>
      )}
      {o.kind === 'window' && <Num label={t('Стулок', 'Створок')} value={o.sashes} min={1} max={6} digits={0} onChange={(v) => mut((x) => (x.sashes = Math.round(v)))} />}
      <Actions sel={sel} />
    </Section>
  );
}

function TileInfo({ finish, result }: { finish: Finish; result: ReturnType<typeof tileLayout> }) {
  const { t, ls } = useT();
  return (
    <div className="calc-box">
      <b>{ls(finish.name)}</b>
      <div>
        {t('Площа', 'Площадь')}: {fmt(result.areaM2)} м² · {t('цілих', 'целых')}: {result.whole} · {t('підрізаних', 'подрезанных')}: {result.cut}
      </div>
      <div>
        {t('Разом із запасом 10%', 'Всего с запасом 10%')}: <b>{result.withReserve} {t('шт', 'шт')}</b>
        {result.packs != null && (
          <>
            {' '}
            = <b>{result.packs} {t('уп.', 'уп.')}</b> ({fmt(result.buyM2)} м²)
          </>
        )}
      </div>
    </div>
  );
}

function RoomProps({ room, sel, project }: { room: Room; sel: Sel; project: Project }) {
  const { t, ls } = useT();
  const level = getLevel(project, sel.scope)!;
  const mut = (fn: (r: Room) => void) =>
    upd((d) => {
      const r = getLevel(d, sel.scope)?.rooms.find((x) => x.id === sel.id);
      if (r) fn(r);
    });
  const floor = project.finishes.find((f) => f.id === room.floorFinish);
  const surfaces = useMemo(() => roomSurfaces(level, room), [level, room]);
  const wallArea = surfaces.reduce((s, x) => s + surfaceNetArea(x, level.height), 0) / 1e6;
  const floorTiles = isTiled(floor) ? tileLayout(room.polygon, [], floor!.tileW!, floor!.tileH!, floor!.grout ?? 0, floor!.pattern, 10, floor!.packArea) : null;
  // плитка/панели на стенах — суммарно по типам отделки
  const wallTiles = useMemo(() => {
    const acc = new Map<string, ReturnType<typeof tileLayout>>();
    for (const s of surfaces) {
      const f = project.finishes.find((x) => x.id === s.finishId);
      if (!f || !isTiled(f)) continue;
      const res = tileLayoutRect(s.length, level.height, s.openings.map((o) => ({ minX: o.from, maxX: o.to, minY: level.height - o.sill - o.height, maxY: level.height - o.sill })), f, 0);
      const e = acc.get(f.id);
      if (e) {
        e.areaM2 += res.areaM2;
        e.whole += res.whole;
        e.cut += res.cut;
        e.total += res.total;
      } else acc.set(f.id, { ...res });
    }
    return [...acc.entries()].map(([id, r]) => {
      const f = project.finishes.find((x) => x.id === id)!;
      const withReserve = Math.ceil(r.total * 1.1);
      const tileArea = ((f.tileW ?? 0) * (f.tileH ?? 0)) / 1e6;
      const packs = f.packArea ? Math.ceil((withReserve * tileArea) / f.packArea) : null;
      return { f, r: { ...r, withReserve, packs, buyM2: packs && f.packArea ? packs * f.packArea : withReserve * tileArea } };
    });
  }, [surfaces, project.finishes, level.height]);
  return (
    <Section title={t('Приміщення', 'Помещение')}>
      <Text label={t('Назва', 'Название')} value={room.name} onChange={(v) => mut((r) => ((r.name = v), (r.named = true)))} />
      <Select
        label={t('Тип', 'Тип')}
        value={room.type}
        options={Object.entries(ROOM_TYPE_NAMES).map(([value, name]) => ({ value, label: ls(name) }))}
        onChange={(v) =>
          mut((r) => {
            r.type = v as Room['type'];
            if (!r.named) r.name = ROOM_TYPE_NAMES[v].uk;
          })
        }
      />
      <Info label={t('Площа', 'Площадь')} value={<b>{fmt(room.area)} м²</b>} />
      <Info label={t('Периметр', 'Периметр')} value={`${fmt(room.perimeter)} м`} />
      <Info label={t('Об’єм', 'Объём')} value={`${fmt((room.area * level.height) / 1000)} м³`} />
      <Info label={t('Площа стін (без прорізів)', 'Площадь стен (без проёмов)')} value={`${fmt(wallArea)} м²`} />
      <FinishSelect label={t('Підлога', 'Пол')} value={room.floorFinish} target="floor" project={project} onChange={(v) => mut((r) => (r.floorFinish = v))} />
      <FinishSelect label={t('Стеля', 'Потолок')} value={room.ceilingFinish} target="ceiling" project={project} onChange={(v) => mut((r) => (r.ceilingFinish = v))} />
      <Select
        label={t('Оздоблення всіх стін', 'Отделка всех стен')}
        value=""
        options={[{ value: '', label: t('— обрати —', '— выбрать —') }, ...project.finishes.filter((f) => f.target.includes('wall')).map((f) => ({ value: f.id, label: ls(f.name) }))]}
        onChange={(v) => {
          if (!v) return;
          upd((d) => {
            const l = getLevel(d, sel.scope);
            const r = l?.rooms.find((x) => x.id === sel.id);
            if (!l || !r) return;
            for (const s of roomSurfaces(l, r)) {
              const w = l.walls.find((x) => x.id === s.wallId);
              if (w) w[s.side === 'L' ? 'finishL' : 'finishR'] = v;
            }
          });
        }}
      />
      {floorTiles && floor && (
        <>
          <h5>{t('Підлога — розкладка', 'Пол — раскладка')}</h5>
          <TileInfo finish={floor} result={floorTiles} />
        </>
      )}
      {wallTiles.length > 0 && <h5>{t('Стіни — розкладка', 'Стены — раскладка')}</h5>}
      {wallTiles.map(({ f, r }) => (
        <TileInfo key={f.id} finish={f} result={r} />
      ))}
      <button onClick={() => useUi.getState().setDialog('finishes')}>{t('Каталог оздоблення…', 'Каталог отделки…')}</button>
    </Section>
  );
}

function ItemProps({ item, sel, project }: { item: Item; sel: Sel; project: Project }) {
  const { t, ls } = useT();
  const def = itemDef(item.kind);
  const mut = (fn: (x: Item) => void) =>
    upd((d) => {
      const x = getContainer(d, sel.scope)?.items.find((q) => q.id === sel.id);
      if (x) fn(x);
    });
  const s = itemSize(item);
  const design = item.kind === 'cabinet' ? project.cabinets.find((c) => c.id === item.params.designId) : undefined;
  return (
    <Section title={item.name ?? (design?.name || ls(def?.name)) ?? item.kind}>
      {design && (
        <button className="primary" onClick={() => useUi.getState().setDialog('cabinet', design.id)}>
          {t('Відкрити в конструкторі', 'Открыть в конструкторе')}
        </button>
      )}
      <div className="grid2">
        <Num label="X" value={item.x} digits={0} unit="мм" onChange={(v) => mut((x) => (x.x = v))} />
        <Num label="Y" value={item.y} digits={0} unit="мм" onChange={(v) => mut((x) => (x.y = v))} />
        <Num label={t('Поворот', 'Поворот')} value={item.rot} step={15} digits={0} unit="°" onChange={(v) => mut((x) => (x.rot = ((v % 360) + 360) % 360))} />
        <Num label={t('Від підлоги', 'От пола')} value={item.z} step={50} digits={0} unit="мм" onChange={(v) => mut((x) => (x.z = v))} />
      </div>
      {def && def.layer !== 'furniture' && def.layer !== 'landscape' && <StatusSelect value={item.status ?? 'new'} onChange={(v) => mut((x) => (x.status = v))} />}
      {def && item.kind !== 'cabinet' && <ParamsForm defs={def.params} params={item.params} project={project} onChange={(k, v) => mut((x) => (x.params[k] = v))} />}
      <Info label={t('Габарити Ш×Г×В', 'Габариты Ш×Г×В')} value={`${Math.round(s.w)}×${Math.round(s.d)}×${Math.round(s.h)} мм`} />
      {item.kind === 'ht-radiator' && <Info label={t('Теплова потужність', 'Тепловая мощность')} value={<b>{num(item.params, 'sections', 8) * num(item.params, 'sectionPower', 150)} Вт</b>} />}
      {def?.layer === 'gas' && <div className="warn-box">{t('Лише відображення. Проєктування та підключення газу виконує ліцензована організація (оператор ГРМ).', 'Только отображение. Проектирование и подключение газа выполняет лицензированная организация (оператор ГРМ).')}</div>}
      <Actions sel={sel} />
    </Section>
  );
}

function RouteProps({ route, sel, project }: { route: Route; sel: Sel; project: Project }) {
  const { t, ls } = useT();
  const def = routeDef(route.kind);
  const mut = (fn: (x: Route) => void) =>
    upd((d) => {
      const x = getContainer(d, sel.scope)?.routes.find((q) => q.id === sel.id);
      if (x) fn(x);
    });
  const plan = polylineLength(route.points);
  const lvl = sel.scope === 'site' ? null : getLevel(project, sel.scope);
  const drops = lvl && def ? routeLengthWithDrops(route, lvl.items, def.layer).drops : 0;
  return (
    <Section title={ls(def?.name) || route.kind}>
      {def && <ParamsForm defs={def.params} params={route.params} project={project} onChange={(k, v) => mut((x) => (x.params[k] = v))} />}
      <Info label={t('Довжина в плані', 'Длина в плане')} value={`${fmt(plan / 1000)} м`} />
      {drops > 0 && <Info label={t('Опуски до приладів', 'Опуски к приборам')} value={`${fmt(drops / 1000)} м`} />}
      {def?.layer !== 'landscape' && <Info label={t('Разом', 'Всего')} value={<b>{fmt((plan + drops) / 1000)} м</b>} />}
      {route.kind === 'pl-sewer' && (
        <>
          <Info label={t('Перепад висоти', 'Перепад высоты')} value={`${fmt(sewerDrop(route), 0)} мм`} />
          <Info label={t('Мін. ухил за нормами', 'Мин. уклон по нормам')} value={`${ruleValue(project.ruleOverrides, `pl.sewer.minSlope.${num(route.params, 'dia', 50)}`)} мм/м`} />
        </>
      )}
      {route.kind === 'el-cable' && !!route.params.chase && <Info label={t('Штроба', 'Штроба')} value={`${fmt((plan + drops) / 1000)} м · ${num(route.params, 'chaseWidth')}×${num(route.params, 'chaseDepth')} мм`} />}
      <p className="hint">{t('Перетягуйте вершини; подвійний клік по лінії додає вершину.', 'Перетаскивайте вершины; двойной клик по линии добавляет вершину.')}</p>
      <Actions sel={sel} />
    </Section>
  );
}

function ZoneProps({ zone, sel, project }: { zone: Zone; sel: Sel; project: Project }) {
  const { t, ls } = useT();
  const def = zoneDef(zone.kind);
  const mut = (fn: (x: Zone) => void) =>
    upd((d) => {
      const x = getContainer(d, sel.scope)?.zones.find((q) => q.id === sel.id);
      if (x) fn(x);
    });
  const uf = zone.kind === 'ht-floor' ? underfloorCalc(zone.points, num(zone.params, 'pitch', 150), num(zone.params, 'offset', 100), num(zone.params, 'feed', 3000), ruleValue(project.ruleOverrides, `ht.floor.maxLoop.${num(zone.params, 'dia', 16)}`, 90)) : null;
  return (
    <Section title={ls(def?.name) || zone.kind}>
      {def && <ParamsForm defs={def.params} params={zone.params} project={project} onChange={(k, v) => mut((x) => (x.params[k] = v))} />}
      <Info label={t('Площа', 'Площадь')} value={<b>{fmt(polygonArea(zone.points) / 1e6)} м²</b>} />
      {uf && (
        <div className="calc-box">
          <div>
            {t('Площа обігріву', 'Площадь обогрева')}: {fmt(uf.areaM2)} м²
          </div>
          <div>
            {t('Труба разом', 'Труба всего')}: <b>{fmt(uf.pipeM)} м</b>
          </div>
          <div>
            {t('Контурів', 'Контуров')}: <b>{uf.loops}</b> × {fmt(uf.loopM)} м
          </div>
        </div>
      )}
      <Actions sel={sel} />
    </Section>
  );
}

function DimProps({ dm, sel }: { dm: Dim; sel: Sel }) {
  const { t } = useT();
  return (
    <Section title={t('Розмір', 'Размер')}>
      <Info label={t('Довжина', 'Длина')} value={<b>{Math.round(dist(dm.a, dm.b))} мм</b>} />
      <Num
        label={t('Винос', 'Вынос')}
        value={dm.offset}
        digits={0}
        step={50}
        unit="мм"
        onChange={(v) =>
          upd((d) => {
            const x = getLevel(d, sel.scope)?.dims.find((q) => q.id === sel.id);
            if (x) x.offset = v;
          })
        }
      />
      <Actions sel={sel} />
    </Section>
  );
}

function SiteProps({ project }: { project: Project }) {
  const { t } = useT();
  const site = project.site!;
  return (
    <Section title={t('Ділянка', 'Участок')}>
      <Info label={t('Площа', 'Площадь')} value={<b>{fmt(polygonArea(site.boundary) / 1e8, 2)} {t('соток', 'соток')}</b>} />
      <Num label={t('Азимут верху плану (північ = 0°)', 'Азимут верха плана (север = 0°)')} value={site.north} min={0} max={359} step={5} digits={0} unit="°" onChange={(v) => upd((d) => void (d.site && (d.site.north = v)))} />
      <Num label={t('Широта', 'Широта')} value={site.latitude} min={40} max={56} step={0.5} digits={2} unit="°" onChange={(v) => upd((d) => void (d.site && (d.site.latitude = v)))} />
      <h5>{t('Позначки вершин межі (рельєф)', 'Отметки вершин границы (рельеф)')}</h5>
      <div className="grid2">
        {site.boundary.map((_, i) => (
          <Num key={i} label={`${t('Вершина', 'Вершина')} ${i + 1}`} value={site.elevations[i] ?? 0} step={100} digits={0} unit="мм" onChange={(v) => upd((d) => void (d.site && (d.site.elevations[i] = v)))} />
        ))}
      </div>
      <p className="hint">{t('Перетягуйте вершини межі; подвійний клік по межі додає вершину.', 'Перетаскивайте вершины границы; двойной клик по границе добавляет вершину.')}</p>
    </Section>
  );
}

function SunProps({ project }: { project: Project }) {
  const { t } = useT();
  const sun = project.sun;
  const set = (fn: (s: Project['sun']) => void) => useProject.getState().patch((d) => fn(d.sun));
  return (
    <Section title={t('Сонце і тінь', 'Солнце и тень')}>
      <Check label={t('Показувати тінь', 'Показывать тень')} value={sun.enabled} onChange={(v) => set((s) => (s.enabled = v))} />
      <div className="grid2">
        <Num label={t('Місяць', 'Месяц')} value={sun.month} min={1} max={12} digits={0} onChange={(v) => set((s) => (s.month = Math.round(v)))} />
        <Num label={t('День', 'День')} value={sun.day} min={1} max={31} digits={0} onChange={(v) => set((s) => (s.day = Math.round(v)))} />
      </div>
      <label className="field">
        <span className="field-label">
          {t('Година (сонячний час)', 'Час (солнечное время)')}: {fmt(sun.hour, 1)}
        </span>
        <input type="range" min={4} max={21} step={0.5} value={sun.hour} onChange={(e) => set((s) => (s.hour = Number(e.target.value)))} />
      </label>
    </Section>
  );
}

function LevelProps({ level, project }: { level: Level; project: Project }) {
  const { t } = useT();
  const mut = (fn: (l: Level) => void) =>
    upd((d) => {
      const l = getLevel(d, level.id);
      if (l) fn(l);
    });
  const uploadUnderlay = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        mut((l) => {
          // по умолчанию ширина изображения = 10 м; дальше — калибровка
          l.underlay = { dataUrl: String(reader.result), pxW: img.naturalWidth, pxH: img.naturalHeight, x: 0, y: 0, scale: 10000 / img.naturalWidth, opacity: 0.6, visible: true };
        });
        useUi.getState().notify(t('Підкладку завантажено. Відкалібруйте масштаб за відомим розміром.', 'Подложка загружена. Откалибруйте масштаб по известному размеру.'));
        window.dispatchEvent(new Event('hb-fit'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const u = level.underlay;
  const sums = useMemo(() => ({ area: level.rooms.reduce((s, r) => s + r.area, 0) }), [level.rooms]);
  return (
    <>
      <Section title={t('Проєкт', 'Проект')}>
        <Text label={t('Назва', 'Название')} value={project.name} onChange={(v) => upd((d) => void (d.name = v))} />
        <Info label={t('Тип об’єкта', 'Тип объекта')} value={project.kind === 'house' ? t('Приватний будинок', 'Частный дом') : t('Квартира', 'Квартира')} />
        <Num label={t('Крок сітки', 'Шаг сетки')} value={project.gridStep} min={10} max={1000} step={10} unit="мм" onChange={(v) => upd((d) => void (d.gridStep = v))} />
        {project.kind === 'apartment' && (
          <>
            <button
              onClick={() => {
                upd((d) => {
                  // всё, что сейчас есть (кроме стен под демонтаж), — существующее состояние
                  for (const l of d.levels) for (const w of l.walls) if (w.status !== 'demolish') w.status = 'existing';
                  d.baseline = snapshotBaseline(d);
                });
                useUi.getState().notify(t('Поточні стіни зафіксовано як існуючий стан (техпаспорт)', 'Текущие стены зафиксированы как существующее состояние (техпаспорт)'));
              }}
            >
              {project.baseline ? t('Перезафіксувати існуючий стан', 'Перезафиксировать существующее состояние') : t('Зафіксувати існуючий стан (за техпаспортом)', 'Зафиксировать существующее состояние (по техпаспорту)')}
            </button>
            <p className="hint">{t('Усі поточні стіни стають «існуючими», нові стіни далі створюються зі статусом «нове» і потрапляють у кошторис. Після фіксації застосунок попереджає про зміни несучих стін і перегородок, що потребують узаконення.', 'Все текущие стены становятся «существующими», новые стены далее создаются со статусом «новое» и попадают в смету. После фиксации приложение предупреждает об изменениях несущих стен и перегородок, требующих узаконивания.')}</p>
          </>
        )}
      </Section>
      <Section title={`${t('Поверх', 'Этаж')}: ${level.name}`}>
        <Text label={t('Назва', 'Название')} value={level.name} onChange={(v) => mut((l) => (l.name = v))} />
        <Num label={t('Висота стелі', 'Высота потолка')} value={level.height} min={1800} max={6000} step={50} unit="мм" onChange={(v) => mut((l) => (l.height = v))} />
        <Num label={t('Позначка підлоги', 'Отметка пола')} value={level.elevation} step={50} unit="мм" onChange={(v) => mut((l) => (l.elevation = v))} />
        <Num label={t('Товщина перекриття', 'Толщина перекрытия')} value={level.slab} min={50} max={600} step={10} unit="мм" onChange={(v) => mut((l) => (l.slab = v))} />
        <Info label={t('Приміщень', 'Помещений')} value={level.rooms.length} />
        <Info label={t('Загальна площа', 'Общая площадь')} value={<b>{fmt(sums.area)} м²</b>} />
        {project.kind === 'house' && (
          <div className="row actions">
            <button
              onClick={() => {
                const top = project.levels[project.levels.length - 1];
                const nl = createLevel(`${project.levels.length + 1} ${t('поверх', 'этаж')}`, top.elevation + top.height + top.slab, top.height);
                nl.walls = top.walls.filter((w) => w.exterior || w.loadBearing).map((w) => ({ ...w, id: `${w.id}_${project.levels.length + 1}`, a: { ...w.a }, b: { ...w.b } }));
                upd((d) => void d.levels.push(nl));
                useUi.getState().setActiveLevel(nl.id);
              }}
            >
              {t('+ Поверх вище', '+ Этаж выше')}
            </button>
            {project.levels.length > 1 && (
              <button
                className="danger"
                onClick={() => {
                  if (!window.confirm(t('Видалити поверх?', 'Удалить этаж?'))) return;
                  const rest = project.levels.filter((l) => l.id !== level.id);
                  useUi.getState().setActiveLevel(rest[0].id);
                  upd((d) => void (d.levels = d.levels.filter((l) => l.id !== level.id)));
                }}
              >
                {t('Видалити поверх', 'Удалить этаж')}
              </button>
            )}
          </div>
        )}
      </Section>
      {project.kind === 'house' && (
        <Section title={t('Дах', 'Крыша')}>
          <Select
            label={t('Тип', 'Тип')}
            value={project.roof.type}
            options={[
              { value: 'none', label: t('Немає', 'Нет') },
              { value: 'flat', label: t('Плоский', 'Плоская') },
              { value: 'gable', label: t('Двосхилий', 'Двускатная') },
              { value: 'hip', label: t('Вальмовий', 'Вальмовая') },
            ]}
            onChange={(v) => upd((d) => void (d.roof.type = v as Project['roof']['type']))}
          />
          <Num label={t('Ухил', 'Уклон')} value={project.roof.pitch} min={5} max={60} step={1} unit="°" onChange={(v) => upd((d) => void (d.roof.pitch = v))} />
          <Num label={t('Звис', 'Свес')} value={project.roof.overhang} min={0} max={1500} step={50} unit="мм" onChange={(v) => upd((d) => void (d.roof.overhang = v))} />
        </Section>
      )}
      <Section title={t('Підкладка (техпаспорт / план БТІ)', 'Подложка (техпаспорт / план БТИ)')}>
        <label className="file-btn">
          {u ? t('Замінити зображення…', 'Заменить изображение…') : t('Завантажити зображення…', 'Загрузить изображение…')}
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadUnderlay(e.target.files[0])} />
        </label>
        {u && (
          <>
            <button className="primary" onClick={() => useUi.getState().setTool('calibrate')}>
              {t('Калібрувати масштаб за розміром', 'Калибровать масштаб по размеру')}
            </button>
            <Check label={t('Показувати', 'Показывать')} value={u.visible} onChange={(v) => mut((l) => void (l.underlay && (l.underlay.visible = v)))} />
            <label className="field">
              <span className="field-label">{t('Прозорість', 'Прозрачность')}</span>
              <input type="range" min={0.1} max={1} step={0.05} value={u.opacity} onChange={(e) => useProject.getState().patch((d) => void (getLevel(d, level.id)!.underlay!.opacity = Number(e.target.value)))} />
            </label>
            <div className="grid2">
              <Num label="X" value={u.x} digits={0} step={50} unit="мм" onChange={(v) => mut((l) => void (l.underlay && (l.underlay.x = v)))} />
              <Num label="Y" value={u.y} digits={0} step={50} unit="мм" onChange={(v) => mut((l) => void (l.underlay && (l.underlay.y = v)))} />
            </div>
            <Num label={t('Масштаб', 'Масштаб')} value={u.scale} digits={4} step={0.1} unit={t('мм/пікс', 'мм/пикс')} onChange={(v) => mut((l) => void (l.underlay && v > 0 && (l.underlay.scale = v)))} />
            <button className="danger" onClick={() => mut((l) => (l.underlay = null))}>
              {t('Прибрати підкладку', 'Убрать подложку')}
            </button>
          </>
        )}
        <p className="hint">{t('Завантажте фото плану, натисніть «Калібрувати», клацніть дві точки з відомою відстанню та введіть її в мм. Потім обведіть стіни інструментом «Стіна».', 'Загрузите фото плана, нажмите «Калибровать», щёлкните две точки с известным расстоянием и введите его в мм. Затем обведите стены инструментом «Стена».')}</p>
      </Section>
      {project.site && <SunProps project={project} />}
      <NetworkBrief project={project} />
    </>
  );
}

function NetworkBrief({ project }: { project: Project }) {
  const { t } = useT();
  const sum = useMemo(() => networkSummary(project), [project.levels, project.electrical]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sum.cables.length && !sum.pipes.length) return null;
  return (
    <Section title={t('Мережі — підсумок', 'Сети — итог')} right={<button className="link" onClick={() => useUi.getState().setDialog('groups')}>{t('Групи…', 'Группы…')}</button>}>
      {sum.cables.map((c) => (
        <Info key={c.key} label={`${t('Кабель', 'Кабель')} ${c.key} мм²`} value={`${fmt(c.netM)} м (+10% = ${c.grossM} м)`} />
      ))}
      {sum.chases.map((c) => (
        <Info key={c.key} label={`${t('Штроба', 'Штроба')} ${c.key} мм`} value={`${fmt(c.lengthM)} м`} />
      ))}
      {sum.pipes.map((c) => (
        <Info key={c.key} label={`${routeDef(c.kind)?.name.uk ?? c.kind} Ø${c.dia}`} value={`${fmt(c.lengthM)} м`} />
      ))}
    </Section>
  );
}

export function Properties() {
  const project = useProject((s) => s.project);
  const selection = useUi((s) => s.selection);
  const activeLevelId = useUi((s) => s.activeLevelId);
  const level = project.levels.find((l) => l.id === activeLevelId) ?? project.levels[0];
  const ent = findEntity(project, selection);
  if (!selection || !ent) return <LevelProps level={level} project={project} />;
  switch (selection.type) {
    case 'wall':
      return <WallProps wall={ent as Wall} sel={selection} project={project} />;
    case 'opening':
      return <OpeningProps o={ent as Opening} sel={selection} project={project} />;
    case 'room':
      return <RoomProps room={ent as Room} sel={selection} project={project} />;
    case 'item':
      return <ItemProps item={ent as Item} sel={selection} project={project} />;
    case 'route':
      return <RouteProps route={ent as Route} sel={selection} project={project} />;
    case 'zone':
      return <ZoneProps zone={ent as Zone} sel={selection} project={project} />;
    case 'dim':
      return <DimProps dm={ent as Dim} sel={selection} />;
    case 'site':
      return (
        <>
          <SiteProps project={project} />
          <SunProps project={project} />
        </>
      );
    default:
      return <LevelProps level={level} project={project} />;
  }
}
