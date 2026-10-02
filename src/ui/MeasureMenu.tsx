import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface MeasureMenuItem {
  id: string;
  label: string;
  /** A second line that says what the item does. */
  hint?: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface MeasureMenuProps {
  /** The measure the menu belongs to, as its heading: "Measure 12". */
  title: string;
  /** Where the menu was asked for, in window coordinates. */
  x: number;
  y: number;
  items: MeasureMenuItem[];
  onClose: () => void;
}

/** Distance kept between the menu and the edges of the window. */
const MARGIN = 8;

/**
 * The menu of one measure: at the pointer on a wide window, and as a sheet at
 * the bottom edge on a phone (the style sheet moves it there). Closes on
 * Escape, on a click elsewhere, and after an item is chosen.
 */
export function MeasureMenu({ title, x, y, items, onClose }: MeasureMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the whole menu inside the window, whichever corner the pointer was in.
  useLayoutEffect(() => {
    const box = menu.current?.getBoundingClientRect();
    if (!box) return;
    setPosition({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - box.width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - box.height - MARGIN)),
    });
  }, [x, y, items.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    menu.current?.querySelector('button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        className="context-menu__backdrop"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={menu}
        className="context-menu"
        role="menu"
        aria-label={title}
        style={position}
        onContextMenu={(event) => event.preventDefault()}
      >
        <p className="context-menu__title">{title}</p>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="context-menu__item"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span className="context-menu__icon">{item.icon}</span>
            <span>
              {item.label}
              {item.hint && <span className="context-menu__hint">{item.hint}</span>}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
