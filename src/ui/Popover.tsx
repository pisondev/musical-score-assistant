import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from './classnames';
import { ChevronIcon } from './icons';

interface PopoverProps {
  /** Small caption above the value, such as "Left hand". */
  label: string;
  /** The current choice, shown on the button. */
  value: ReactNode;
  /** Panel content; receives a function that closes the panel. */
  children: (close: () => void) => ReactNode;
  /** Makes the panel as wide as its content needs, up to the page width. */
  wide?: boolean;
  align?: 'left' | 'right';
}

/** A button that opens a panel below it. Closes on Escape or a click elsewhere. */
export function Popover({ label, value, children, wide, align = 'left' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className={cx('popover', open && 'is-open')}>
      <button
        type="button"
        className="popover__button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="popover__label">{label}</span>
        <span className="popover__value">{value}</span>
        <ChevronIcon width={14} height={14} className="popover__chevron" />
      </button>
      {open && (
        <div
          id={panelId}
          className={cx(
            'popover__panel',
            wide && 'popover__panel--wide',
            align === 'right' && 'popover__panel--right',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
