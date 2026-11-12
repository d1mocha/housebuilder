// Импорт пользовательских моделей glTF/GLB/OBJ: разбор, нормализация, кеш.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { CustomModel } from '../model/types';

const cache = new Map<string, Promise<THREE.Object3D>>();

function dataUrlToBuffer(dataUrl: string): ArrayBuffer {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function parse(format: CustomModel['format'], data: ArrayBuffer): Promise<THREE.Object3D> {
  if (format === 'obj') {
    const text = new TextDecoder().decode(data);
    const obj = new OBJLoader().parse(text);
    obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: '#b9b2a5', roughness: 0.8 });
    });
    return obj;
  }
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(data, '', (gltf) => resolve(gltf.scene), reject);
  });
}

/** Привести объект к единичному габариту: x,z ∈ [−0.5, 0.5], y ∈ [0, 1]. Возвращает исходные размеры. */
function normalize(obj: THREE.Object3D): { root: THREE.Object3D; size: THREE.Vector3 } {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const inner = new THREE.Group();
  obj.position.set(-center.x, -box.min.y, -center.z);
  inner.add(obj);
  inner.scale.set(1 / (size.x || 1), 1 / (size.y || 1), 1 / (size.z || 1));
  const root = new THREE.Group();
  root.add(inner);
  return { root, size };
}

/** Разобрать файл модели и вернуть её габариты (в единицах файла). */
export async function inspectModel(format: CustomModel['format'], dataUrl: string): Promise<{ w: number; d: number; h: number }> {
  const obj = await parse(format, dataUrlToBuffer(dataUrl));
  const { size } = normalize(obj);
  return { w: size.x, d: size.z, h: size.y };
}

export function loadCustomModel(model: CustomModel): Promise<THREE.Object3D> {
  let p = cache.get(model.id);
  if (!p) {
    p = parse(model.format, dataUrlToBuffer(model.dataUrl)).then((o) => normalize(o).root);
    cache.set(model.id, p);
  }
  return p;
}
