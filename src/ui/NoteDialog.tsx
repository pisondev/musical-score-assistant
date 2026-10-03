import { useEffect, useRef, useState } from 'react';
import type { MeasureNote, NoteTarget } from '../core';
import { Dialog } from './Dialog';
import { noteByline } from './note-byline';
import type { NotesHome } from './useMeasureNotes';

interface NoteDialogProps {
  /** The measure the notes are about. */
  target: NoteTarget;
  /** The notes already written on it. */
  notes: MeasureNote[];
  /** Where notes are kept, so the dialog can say so. */
  home: NotesHome;
  /** Saves a new note, or new text for the note with the given id. */
  onSave: (text: string, id?: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/**
 * The notes on one measure: what is written already, and a field for a new
 * note or for changing an old one. Ctrl+Enter saves, Escape closes.
 */
export function NoteDialog({ target, notes, home, onSave, onDelete, onClose }: NoteDialogProps) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, [editing]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    onSave(body, editing ?? undefined);
    setText('');
    setEditing(null);
  };

  return (
    <Dialog
      title="Notes"
      detail={target.where}
      label={`Notes on ${target.where}`}
      onClose={onClose}
    >
      <>
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
            {home === 'file'
              ? 'Saved with the song, together with the left hand and the right-hand mode that are on the sheet now.'
              : 'Saved in this browser only. Sign in to keep your notes with your account, on every device.'}
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
      </>
    </Dialog>
  );
}
