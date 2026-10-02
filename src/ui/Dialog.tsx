import { useEffect, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  /** What the title is about, shown beside it in a lighter weight. */
  detail?: string;
  /** The dialog named in full, for screen readers. */
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A dialog in the middle of the window, or a sheet from the bottom edge on a
 * phone. Escape, the Close button, and a click beside it close it.
 */
export function Dialog({ title, detail, label, onClose, children }: DialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="dialog__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label}>
        <header className="dialog__head">
          <h2>
            {title} {detail && <span>{detail}</span>}
          </h2>
          <button type="button" className="button button--quiet" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </>
  );
}
