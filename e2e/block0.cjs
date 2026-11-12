// Блок 0 (итерация 2): регрессионные проверки исправленных багов в браузере.
const { launch, clickWorld, state, check } = require('./helpers.cjs');
const path = require('path');
const fs = require('fs');

(async () => {
  const { browser, page, errors } = await launch();
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });

  // ── первая загрузка: план целиком вписан в окно 2D ──
  const fit = await page.evaluate(() => {
    const svg = document.querySelector('.editor2d svg');
    const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(' ').map(Number);
    const l = window.__hb.useProject.getState().project.levels[0];
    const pts = l.walls.flatMap((w) => [w.a, w.b]);
    return pts.every((p) => p.x > vx && p.x < vx + vw && p.y > vy && p.y < vy + vh);
  });
  check('первая загрузка: план целиком виден в окне 2D', fit);

  // ── 0.1 демо: нет объектов вне помещений (модель и DOM) ──
  const outside = await page.evaluate(() => {
    const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    const l = window.__hb.useProject.getState().project.levels[0];
    const rot = (x, y, deg) => { const r = (deg * Math.PI) / 180; return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) }; };
    const bad = [];
    for (const it of l.items) {
      const f = rot(0, 200, it.rot);
      const ok = l.rooms.some((r) => inPoly({ x: it.x, y: it.y }, r.polygon) || inPoly({ x: it.x + f.x, y: it.y + f.y }, r.polygon));
      if (!ok) bad.push(it.kind);
    }
    // DOM: каждый нарисованный объект стоит там же, где в модели
    const dom = [...document.querySelectorAll('.editor2d [data-t="item"]')].map((g) => g.getAttribute('transform'));
    const mismatch = l.items.filter((it) => !dom.includes(`translate(${it.x} ${it.y}) rotate(${it.rot})`)).length;
    return { bad, items: l.items.length, dom: dom.length, mismatch };
  });
  check('0.1 в демо нет объектов вне контура помещений', outside.bad.length === 0 && outside.items > 60 && outside.dom === outside.items && outside.mismatch === 0, JSON.stringify(outside));
  await page.screenshot({ path: path.join(out, '50-demo-first-load.png') });

  // ── 0.6 кнопка ⚠ открывает список нарушений, справочник — отдельно ──
  const hint = await page.$('.hint-card button');
  if (hint) await hint.click();
  await page.click('[data-menu="issues"]');
  const pop = await page.$('[data-issues-pop]');
  const n = await page.locator('[data-issues-pop] .issue').count();
  check('0.6 кнопка ⚠ открывает список нарушений (не справочник)', !!pop && n > 0 && !(await page.$('.dialog')), `${n} записей`);
  await page.click('[data-issues-pop] .issue >> nth=0');
  let s = await state(page);
  check('0.6 клик по нарушению переходит к объекту и закрывает список', !!s.sel && !(await page.$('[data-issues-pop]')), JSON.stringify(s.sel));
  await page.click('[data-menu="issues"]');
  await page.click('[data-action="open-rules"]');
  await page.waitForSelector('[data-table="rules"]');
  const cols = await page.evaluate(() => {
    const th = [...document.querySelectorAll('[data-table="rules"] thead th')].map((e) => e.getBoundingClientRect());
    const cells = [...document.querySelectorAll('[data-table="rules"] td[data-col="count"]')].map((e) => e.getBoundingClientRect());
    const last = th[th.length - 1];
    return { n: cells.length, aligned: cells.every((c) => Math.abs(c.left - last.left) < 1 && Math.abs(c.width - last.width) < 1), inside: last.right <= document.querySelector('.dialog-body').getBoundingClientRect().right + 1 };
  });
  check('0.6 справочник норм: колонка «Порушень» выровнена по заголовку', cols.n > 20 && cols.aligned && cols.inside, JSON.stringify(cols));
  await page.screenshot({ path: path.join(out, '51-rules-table.png') });
  await page.keyboard.press('Escape');

  // ── 0.5 прогулка: старт в свободной зоне, лицом к центру комнаты ──
  await page.click('[data-view="3d"]');
  await page.waitForSelector('.view3d canvas');
  await page.waitForTimeout(1200);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(900);
  const walk = await page.evaluate(() => {
    const cam = window.__hbCam();
    const l = window.__hb.useProject.getState().project.levels[0];
    const room = [...l.rooms].sort((a, b) => b.area - a.area)[0];
    const c = room.polygon.reduce((s, p) => ({ x: s.x + p.x / room.polygon.length, y: s.y + p.y / room.polygon.length }), { x: 0, y: 0 });
    const pos = { x: cam.x * 1000, y: cam.z * 1000 };
    const fwd = { x: -Math.sin(cam.yaw), y: -Math.cos(cam.yaw) };
    const to = { x: c.x - pos.x, y: c.y - pos.y };
    const len = Math.hypot(to.x, to.y);
    // расстояние до ближайшего предмета мебели (по центрам и габаритам — грубо)
    const near = Math.min(...l.items.filter((i) => i.params.w && i.params.h >= 250 && i.z < 1700).map((i) => Math.hypot(i.x - pos.x, i.y - pos.y) - Math.max(i.params.w, i.params.d) / 2));
    return { pos, room: room.name, cos: len > 400 ? (fwd.x * to.x + fwd.y * to.y) / len : 1, near: Math.round(near), eye: cam.y };
  });
  check('0.5 прогулка стартует в свободной зоне самой большой комнаты', walk.room === 'Вітальня' && walk.near > 0 && Math.abs(walk.eye - 1.6) < 0.01, JSON.stringify(walk));
  check('0.5 прогулка: взгляд к центру комнаты', walk.cos > 0.98, walk.cos.toFixed(3));
  await page.screenshot({ path: path.join(out, '52-walk-start.png') });
  await page.keyboard.press('KeyF');

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
