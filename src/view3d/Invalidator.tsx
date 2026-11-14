// Перерисовка сцены с frameloop="demand", когда асинхронно догрузилась текстура.
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export function Invalidator() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const h = () => invalidate();
    window.addEventListener('hb-invalidate', h);
    return () => window.removeEventListener('hb-invalidate', h);
  }, [invalidate]);
  return null;
}
