import { useEffect, useRef, useState } from 'react';
import type { NoteTarget } from '../core';
import { Dialog } from './Dialog';
import { noteByline } from './note-byline';
import type { MeasureComment } from './useMeasureComments';

/** The longest comment the server takes. */
const MAX_LENGTH = 1000;

interface CommentDialogProps {
  /** The measure the comments are about. */
  target: NoteTarget;
  /** The member's comments on it. */
  comments: MeasureComment[];
  /** Sends a comment; resolves to null when it went, or to what went wrong. */
  onSend: (text: string) => Promise<string | null>;
  onDelete: (id: string) => void;
  /** Notes that the replies shown have been seen. */
  onSeen: (ids: string[]) => void;
  onClose: () => void;
}

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

/** Where a comment stands, in a word. */
function status(comment: MeasureComment): { label: string; tone: string } {
  if (comment.reply) return { label: 'Answered', tone: 'answered' };
  if (comment.readAt) return { label: 'Read', tone: 'read' };
  return { label: 'Sent', tone: 'sent' };
}

/**
 * A member's comments on one measure: what they sent, whether the author has read it, the
 * author's answer, and a field for a new comment. A comment is a message; it changes nothing on
 * the sheet. Ctrl+Enter sends, Escape closes.
 */
export function CommentDialog({
  target,
  comments,
  onSend,
  onDelete,
  onSeen,
  onClose,
}: CommentDialogProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  // Answers shown here count as seen.
  const unseen = comments
    .filter((comment) => comment.reply && !comment.replySeen)
    .map((comment) => comment.id)
    .join(',');
  useEffect(() => {
    if (unseen) onSeen(unseen.split(','));
  }, [unseen, onSeen]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const failure = await onSend(body);
    setSending(false);
    setProblem(failure);
    if (!failure) setText('');
  };

  return (
    <Dialog
      title="Comments"
      detail={target.where}
      label={`Comments on ${target.where}`}
      onClose={onClose}
    >
      <>
        <p className="dialog__lead">
          A comment goes to the author of the arrangements, who reads it later and may answer here.
          It changes nothing on the sheet.
        </p>
        {comments.length > 0 && (
          <ul className="notes">
            {comments.map((comment) => {
              const { label, tone } = status(comment);
              return (
                <li key={comment.id}>
                  <p className="notes__text">{comment.text}</p>
                  <p className="notes__byline">
                    <span className={`comment-status comment-status--${tone}`}>{label}</span>{' '}
                    {noteByline(comment)}
                  </p>
                  {comment.reply && (
                    <div className="comment-reply">
                      <p className="comment-reply__label">
                        Answer from the author{comment.repliedAt && ` · ${day(comment.repliedAt)}`}
                      </p>
                      <p>{comment.reply}</p>
                    </div>
                  )}
                  <div className="notes__actions">
                    <button type="button" onClick={() => onDelete(comment.id)}>
                      Take back
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <label className="dialog__field">
          <span>New comment</span>
          <textarea
            ref={field}
            rows={4}
            maxLength={MAX_LENGTH}
            value={text}
            placeholder="A wrong note, a question, a left hand you liked…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
        </label>

        <footer className="dialog__foot">
          <p className={problem ? 'dialog__note--error' : undefined}>
            {problem ??
              'Sent with the left hand and the right-hand mode that are on the sheet now, so the author sees what you heard.'}
          </p>
          <div className="dialog__buttons">
            <button
              type="button"
              className="button button--solid"
              onClick={() => void submit()}
              disabled={text.trim() === '' || sending}
              title="Ctrl+Enter"
            >
              {sending ? 'Sending…' : 'Send the comment'}
            </button>
          </div>
        </footer>
      </>
    </Dialog>
  );
}
