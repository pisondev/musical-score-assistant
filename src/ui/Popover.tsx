import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from './classnames';
import { ChevronIcon } from './icons';

/**
 * How long a panel takes to slide away, in milliseconds. The panel stays in the page for
 * that long after it is closed; the style sheet finishes its leaving animation within it.
 */
const LEAVE_MS = 200;

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
  /** Opens the panel above the button, for a button at the bottom of the window. */
  side?: 'below' | 'above';
  /** Drawn in front of the label and the value. */
  icon?: ReactNode;
  /** Shows only the value on the button, like an ordinary button; the label names it. */
  compact?: boolean;
  /** Shows the value alone in a field, like a select; the label names it. */
  select?: boolean;
  /** A further class of the panel. */
  panelClassName?: string;
}

/**
 * A button that opens a panel: beside the button on a wide window, and as a
 * sheet that rises from the bottom edge on a phone, where the style sheet
 * also shows the backdrop and the heading with its Done button. The panel
 * slides open and slides away again. Closes on Escape or a click elsewhere.
 */
export function Popover({
  label,
  value,
  children,
  wide,
  align = 'left',
  side = 'below',
  icon,
  compact,
  select,
  panelClassName,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  // A closed panel stays in the page while it slides away.
  const [leaving, setLeaving] = useState(false);
  const isOpen = useRef(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const show = useCallback(() => {
    isOpen.current = true;
    window.clearTimeout(leaveTimer.current);
    setLeaving(false);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    if (!isOpen.current) return;
    isOpen.current = false;
    // Whoever was working in the panel with the keyboard continues at the button.
    if (panel.current?.contains(document.activeElement)) button.current?.focus();
    setOpen(false);
    setLeaving(true);
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setLeaving(false), LEAVE_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // Like a select, the field opens with the arrow keys as well.
  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!select || open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    show();
  };

  const bare = compact || select;
  return (
    <div
      ref={root}
      className={cx(
        'popover',
        open && 'is-open',
        leaving && 'is-leaving',
        compact && 'popover--compact',
        select && 'popover--select',
      )}
    >
      <button
        ref={button}
        type="button"
        className={cx('popover__button', icon !== undefined && 'popover__button--icon')}
        aria-haspopup={select ? 'listbox' : undefined}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={bare ? label : undefined}
        title={bare ? label : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKeyDown}
      >
        {icon !== undefined && <span className="popover__icon">{icon}</span>}
        {!bare && <span className="popover__label">{label}</span>}
        <span className="popover__value">{value}</span>
        <ChevronIcon width={14} height={14} className="popover__chevron" />
      </button>
      {(open || leaving) && (
        <>
          <div className="popover__backdrop" onClick={close} aria-hidden="true" />
          <div
            ref={panel}
            id={panelId}
            className={cx(
              'popover__panel',
              wide && 'popover__panel--wide',
              align === 'right' && 'popover__panel--right',
              side === 'above' && 'popover__panel--above',
              panelClassName,
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
