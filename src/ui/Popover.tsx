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
  /** Gives the panel room for a list of settings instead of a short menu. */
  wide?: boolean;
  align?: 'left' | 'right';
  /** Drawn in front of the label and the value. */
  icon?: ReactNode;
  /** Shows only the value on the button, like an ordinary button; the label names it. */
  compact?: boolean;
}

/**
 * A button that opens a panel: below the button on a wide window, and as a
 * sheet that rises from the bottom edge on a phone, where the style sheet
 * also shows the backdrop and the heading with its Done button. Closes on
 * Escape or a click elsewhere.
 */
export function Popover({
  label,
  value,
  children,
  wide,
  align = 'left',
  icon,
  compact,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = () => setOpen(false);

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
    <div ref={root} className={cx('popover', open && 'is-open', compact && 'popover--compact')}>
      <button
        type="button"
        className={cx('popover__button', icon !== undefined && 'popover__button--icon')}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {icon !== undefined && <span className="popover__icon">{icon}</span>}
        {!compact && <span className="popover__label">{label}</span>}
        <span className="popover__value">{value}</span>
        <ChevronIcon width={14} height={14} className="popover__chevron" />
      </button>
      {open && (
        <>
          <div className="popover__backdrop" onClick={close} aria-hidden="true" />
          <div
            id={panelId}
            className={cx(
              'popover__panel',
              wide && 'popover__panel--wide',
              align === 'right' && 'popover__panel--right',
            )}
          >
            <div className="popover__sheet-head">
              <span>{label}</span>
              <button type="button" onClick={close}>
                Done
              </button>
            </div>
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}
