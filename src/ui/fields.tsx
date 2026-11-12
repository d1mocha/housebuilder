// Поля ввода панели свойств. Числа применяются по Enter / потере фокуса.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export function Row({ label, children, title }: { label: ReactNode; children: ReactNode; title?: string }) {
  return (
    <label className="field" title={title}>
      <span className="field-label">{label}</span>
      <span className="field-input">{children}</span>
    </label>
  );
}

export function NumInput({ value, onChange, min, max, step = 1, unit, digits = 1, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; digits?: number; disabled?: boolean }) {
  const fmt = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 10 ** digits) / 10 ** digits) : '');
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (raw: string) => {
    let v = Number(raw.replace(',', '.').replace(/\s/g, ''));
    if (!Number.isFinite(v) || raw.trim() === '') {
      setText(fmt(value));
      return;
    }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    setText(fmt(v));
    if (v !== value) onChange(v);
  };
  return (
    <span className="num">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const cur = Number(text.replace(',', '.'));
            if (Number.isFinite(cur)) commit(String(cur + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)));
          } else if (e.key === 'Escape') {
            setText(fmt(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unit && <em>{unit}</em>}
    </span>
  );
}

export function Num(props: { label: ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; digits?: number; disabled?: boolean; title?: string }) {
  const { label, title, ...rest } = props;
  return (
    <Row label={label} title={title}>
      <NumInput {...rest} />
    </Row>
  );
}

export function Text({ label, value, onChange, placeholder }: { label: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Row label={label}>
      <input type="text" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => text !== value && onChange(text)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </Row>
  );
}

export function Select({ label, value, options, onChange }: { label: ReactNode; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function Check({ label, value, onChange }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Color({ label, value, onChange }: { label: ReactNode; value: string; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#cccccc'} onChange={(e) => onChange(e.target.value)} />
    </Row>
  );
}

export function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="panel-section">
      <header>
        <h4>{title}</h4>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Info({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="field info">
      <span className="field-label">{label}</span>
      <span className="field-value">{value}</span>
    </div>
  );
}
