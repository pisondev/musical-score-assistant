import { useEffect, useRef, useState } from 'react';
import type { MeasureNote, NoteTarget } from '../core';
import { noteByline } from './note-byline';
import type { NotesHome } from './useMeasureNotes';

interface NoteDialogProps {
  /** The measure the notes are about. */
  target: NoteTarget;
  /** The notes already written on it. */
  notes: MeasureNote[];
  /** Where notes are kept, so the dialog can say so. */
  home: NotesHome;
  /** Folder of the song, shown as the place of the file. */
  songId: string;
  /** Saves a new note, or new text for the note with the given id. */
  onSave: (text: string, id?: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/**
 * The notes on one measure: what is written already, and a field for a new
 * note or for changing an old one. Ctrl+Enter saves, Escape closes.
 */
export function NoteDialog({
  target,
  notes,
  home,
  songId,
  onSave,
  onDelete,
  onClose,
}: NoteDialogProps) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, [editing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    onSave(body, editing ?? undefined);
    setText('');
    setEditing(null);
  };

  return (
    <>
      <div className="dialog__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Notes on ${target.where}`}
      >
        <header className="dialog__head">
          <h2>
            Notes <span>{target.where}</span>
          </h2>
          <button type="button" className="button button--quiet" onClick={onClose}>
            Close
          </button>
        </header>

        {notes.length > 0 && (
          <ul className="notes">
            {notes.map((note) => (
              <li key={note.id} className={editing === note.id ? 'is-editing' : undefined}>
                <p className="notes__text">{note.text}</p>
                <p className="notes__byline">{noteByline(note)}</p>
                <div className="notes__actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(note.id);
                      setText(note.text);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (editing === note.id) {
                        setEditing(null);
                        setText('');
                      }
                      onDelete(note.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <label className="dialog__field">
          <span>{editing ? 'Change the note' : 'New note'}</span>
          <textarea
            ref={field}
            rows={4}
            value={text}
            placeholder="A correction, something you like, something to change…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>

        <footer className="dialog__foot">
          <p>
            {home === 'file' ? (
              <>
                Saved in <code>songs/{songId}/notes.json</code>, with the left hand and the
                right-hand mode that are on the sheet now.
              </>
            ) : (
              'Saved in this browser only: the app is not running from the development server, which writes notes into the song folder.'
            )}
          </p>
          <div className="dialog__buttons">
            {editing && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setEditing(null);
                  setText('');
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              className="button button--solid"
              onClick={submit}
              disabled={text.trim() === ''}
              title="Ctrl+Enter"
            >
              {editing ? 'Save the change' : 'Save the note'}
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}
