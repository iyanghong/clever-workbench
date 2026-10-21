import type { ReactNode } from 'react';

export function PageHeading({
  title,
  eyebrow,
  description,
  actions,
  count,
}: {
  title: string;
  eyebrow?: ReactNode;
  description?: string;
  actions?: ReactNode;
  count?: number;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>
          {title}
          {count !== undefined && <span className="heading-count">{count}</span>}
        </h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="segmented"
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (disabled || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
        const current = buttons.indexOf(event.target as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : (current + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
        onChange(options[next].value);
        buttons[next]?.focus();
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          aria-pressed={option.value === value}
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
