// Общие помощники e2e-сценариев (Playwright, предустановленный Chromium).
const { chromium } = require('playwright');

async function launch(url = 'http://localhost:5173/') {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.editor2d svg');
  await page.waitForTimeout(800);
  return { browser, page, errors };
}

/** Координаты модели (мм) → координаты страницы. */
async function toScreen(page, x, y) {
  return page.evaluate(([wx, wy]) => {
    const svg = document.querySelector('.editor2d svg');
    const r = svg.getBoundingClientRect();
    const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(' ').map(Number);
    return { x: r.left + ((wx - vx) / vw) * r.width, y: r.top + ((wy - vy) / vh) * r.height };
  }, [x, y]);
}

async function clickWorld(page, x, y, opts = {}) {
  const p = await toScreen(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, opts);
}

async function moveWorld(page, x, y) {
  const p = await toScreen(page, x, y);
  await page.mouse.move(p.x, p.y, { steps: 4 });
}

async function dragWorld(page, x1, y1, x2, y2) {
  const a = await toScreen(page, x1, y1);
  const b = await toScreen(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

const state = (page) => page.evaluate(() => {
  const p = window.__hb.useProject.getState().project;
  const l = p.levels.find((x) => x.id === window.__hb.useUi.getState().activeLevelId) || p.levels[0];
  return {
    name: p.name, kind: p.kind, walls: l.walls.length, openings: l.openings.length, items: l.items.length, routes: l.routes.length, zones: l.zones.length, dims: l.dims.length,
    rooms: l.rooms.map((r) => ({ name: r.name, area: r.area })), underlay: l.underlay ? { scale: l.underlay.scale } : null,
    cabinets: p.cabinets.length, site: p.site ? { items: p.site.items.length, routes: p.site.routes.length, zones: p.site.zones.length } : null,
    past: window.__hb.useProject.getState().past.length, sel: window.__hb.useUi.getState().selection, tool: window.__hb.useUi.getState().tool,
  };
});

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

module.exports = { launch, toScreen, clickWorld, moveWorld, dragWorld, state, check };
