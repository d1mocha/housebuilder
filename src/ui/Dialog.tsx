import type { ReactNode } from 'react';

export function Dialog({ title, children, onClose, wide, footer }: { title: ReactNode; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode }) {
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog">
        <header>
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}
