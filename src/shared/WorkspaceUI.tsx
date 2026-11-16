import { Segmented, Tag, Typography } from 'antd';
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
        <Typography.Title level={1}>
          {title}
          {count !== undefined && <Tag className="heading-count">{count}</Tag>}
        </Typography.Title>
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
    <Segmented<T>
      className="segmented"
      aria-label={label}
      value={value}
      disabled={disabled}
      options={options.map((option) => ({ ...option }))}
      onChange={onChange}
      onKeyDown={(event) => {
        if (disabled || !['Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : options.length - 1;
        onChange(options[next].value);
        event.currentTarget.querySelectorAll<HTMLInputElement>('input')[next]?.focus();
      }}
    />
  );
}
