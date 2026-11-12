// Особые виды объектов: изделие из конструктора и импортированная 3D-модель.
import { L, P_D, P_H, P_W, num, registerItems } from './registry';

registerItems([
  {
    kind: 'cabinet',
    layer: 'furniture',
    group: 'custom',
    name: L('Виріб з конструктора', 'Изделие из конструктора'),
    params: [],
    defaults: { w: 600, d: 600, h: 720 },
    size: (p) => ({ w: num(p, 'w', 600), d: num(p, 'd', 600), h: num(p, 'h', 720) }),
    mount: 'wall',
    hidden: true,
  },
  {
    kind: 'model',
    layer: 'furniture',
    group: 'custom',
    name: L('Імпортована модель', 'Импортированная модель'),
    params: [P_W, P_D, P_H],
    defaults: { w: 1000, d: 1000, h: 1000 },
    size: (p) => ({ w: num(p, 'w', 1000), d: num(p, 'd', 1000), h: num(p, 'h', 1000) }),
    hidden: true,
  },
]);
