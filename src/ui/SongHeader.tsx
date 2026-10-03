import { formatNoteName, hymnalName, midiToText, songReference, type Song } from '../core';
import { PRIVATE_HINT } from '../library';
import { LockIcon } from './icons';

interface SongHeaderProps {
  /** The song as performed: its key reflects any transposition. */
  song: Song;
  isPrivate: boolean;
}

/** Title and the facts a player needs before starting; credits are tucked away. */
export function SongHeader({ song, isPrivate }: SongHeaderProps) {
  const { meta } = song;
  const reference = songReference(meta);
  const hymnal = hymnalName(meta.book);
  const credits = [
    hymnal && `${hymnal}${meta.number ? ` ${meta.number}` : ''}`,
    meta.composer && `Music: ${meta.composer}`,
    meta.lyricist && `Words: ${meta.lyricist}`,
    meta.source,
  ].filter(Boolean);
  // A repeat shows the same measures twice; they are counted once.
  const numbered = new Set(
    song.measures.flatMap((measure) => (measure.number === null ? [] : [measure.number])),
  ).size;
  const octaves = Math.round((song.rightDo - song.leftDo) / 12);
  const hasVoice = song.measures.some((measure) => measure.voice !== undefined);
  const hasFills = song.measures.some((measure) => measure.fills !== undefined);

  return (
    <section className="song-header">
      <div className="song-header__title">
        {reference && (
          <span className="song-header__number" title={hymnal ?? undefined}>
            {reference}
          </span>
        )}
        <h1>{meta.title}</h1>
        {isPrivate && (
          <span className="badge badge--private" title={PRIVATE_HINT}>
            <LockIcon width={12} height={12} />
            Private
          </span>
        )}
      </div>
      <p className="song-header__facts">
        <span>
          1 = {formatNoteName(meta.key)}
          {meta.mode === 'minor' && ' (minor)'}
        </span>
        <span>
          {meta.time.beats}/{meta.time.unit}
        </span>
        <span>Tempo {meta.tempo}</span>
        <span>{numbered} measures</span>
      </p>
      <details className="song-header__details">
        <summary>Details</summary>
        {credits.length > 0 && <p>{credits.join(' · ')}</p>}
        <p>
          On the right-hand row 1 is {midiToText(song.rightDo)}; on the left-hand row 1 is{' '}
          {midiToText(song.leftDo)}, {octaves === 1 ? 'one octave' : `${octaves} octaves`} lower.
          Notes written one above the other are played together. A stroke through a digit raises (/)
          or lowers (\) the note by a half step.
          {hasVoice &&
            ' The small row marked V is the melody the singers carry while the right hand accompanies.'}
          {hasFills &&
            ' The row marked + holds the notes the right hand adds to the melody; a long melody note above it keeps sounding while they are played.'}
        </p>
      </details>
    </section>
  );
}
