import { formatNoteName, midiToText, type Song } from '../core';
import { LockIcon } from './icons';

interface SongHeaderProps {
  /** The song as performed: its key reflects any transposition. */
  song: Song;
  isPrivate: boolean;
}

/** Title and the facts a player needs before starting; credits are tucked away. */
export function SongHeader({ song, isPrivate }: SongHeaderProps) {
  const { meta } = song;
  const credits = [
    meta.composer && `Music: ${meta.composer}`,
    meta.lyricist && `Words: ${meta.lyricist}`,
    meta.source,
  ].filter(Boolean);
  const numbered = song.measures.filter((measure) => measure.number !== null).length;
  const octaves = Math.round((song.rightDo - song.leftDo) / 12);

  return (
    <section className="song-header">
      <div className="song-header__title">
        {meta.number && <span className="song-header__number">{meta.number}</span>}
        <h1>{meta.title}</h1>
        {isPrivate && (
          <span className="badge badge--private" title="Stored in songs/private; never committed">
            <LockIcon width={12} height={12} />
            Local only
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
        </p>
      </details>
    </section>
  );
}
