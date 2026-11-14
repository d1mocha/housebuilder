// Миниатюры каталога: рендер параметрических моделей в картинку одним общим скрытым WebGL-рендерером.
import * as THREE from 'three';
import { itemDef } from '../catalog/registry';
import type { Prim3 } from '../catalog/registry';
import type { Params } from '../model/types';
import { primsToGroup } from './build';

const SIZE = 160;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let failed = false;

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
let chain: Promise<unknown> = Promise.resolve();

function ensure(): boolean {
  if (renderer) return true;
  if (failed || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b8bcc6', 1.5));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#ffffff', 0.5);
    fill.position.set(-3, 2, -1);
    scene.add(fill);
    camera = new THREE.PerspectiveCamera(28, 1, 0.01, 200);
    return true;
  } catch {
    failed = true;
    renderer = null;
    return false;
  }
}

/** Отрисовать набор примитивов в PNG (data URL). Вид — спереди-сверху-справа. */
export function renderPrims(prims: Prim3[], s: { w: number; d: number }): string | null {
  if (!prims.length || !ensure() || !renderer || !scene || !camera) return null;
  const group = primsToGroup(prims, s);
  scene.add(group);
  try {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
    const dir = new THREE.Vector3(0.8, 0.62, 1).normalize();
    const dist = (r / Math.sin((camera.fov / 2) * (Math.PI / 180))) * 1.02;
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.near = Math.max(0.01, dist - r * 1.5);
    camera.far = dist + r * 1.5;
    camera.lookAt(c);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    scene.remove(group);
    group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

/** Миниатюра объекта каталога (параметры по умолчанию или заданные). null — у объекта нет 3D-модели. */
export function itemThumb(kind: string, params?: Params): Promise<string | null> {
  const key = params ? `${kind}|${JSON.stringify(params)}` : kind;
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  let p = pending.get(key);
  if (!p) {
    // по одной миниатюре за тик, чтобы не блокировать интерфейс
    p = (chain = chain.then(
      () =>
        new Promise<string | null>((res) =>
          setTimeout(() => {
            const def = itemDef(kind);
            let url: string | null = null;
            if (def?.parts) {
              const prm = { ...def.defaults, ...(params ?? {}) };
              const size = def.size(prm);
              url = renderPrims(def.parts(prm, size), size);
            }
            cache.set(key, url);
            pending.delete(key);
            res(url);
          }, 0),
        ),
    )) as Promise<string | null>;
    pending.set(key, p);
  }
  return p;
}

export const thumbCached = (kind: string): string | null | undefined => cache.get(kind);
