import { useEffect } from 'react';

export interface MenuEntry {
  label: string;
  hint?: string;
  danger?: boolean;
  run: () => void;
}

export function ContextMenu({ x, y, entries, onClose }: { x: number; y: number; entries: MenuEntry[]; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [onClose]);
  if (!entries.length) return null;
  return (
    <div className="ctx-menu" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      {entries.map((en, i) => (
        <button
          key={i}
          className={en.danger ? 'danger' : ''}
          onClick={() => {
            en.run();
            onClose();
          }}
        >
          <span>{en.label}</span>
          {en.hint && <kbd>{en.hint}</kbd>}
        </button>
      ))}
    </div>
  );
}
