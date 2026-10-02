import { formatNoteName, midiToText, type Song } from '../core';
import { LockIcon } from './icons';

interface SongHeaderProps {
  song: Song;
  isPrivate: boolean;
}

/** Title, credits, and the facts a player needs before starting: key, time, tempo. */
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
      {credits.length > 0 && <p className="song-header__credits">{credits.join(' · ')}</p>}
      <ul className="facts" aria-label="Song details">
        <li>
          <span>Key</span>1 = {formatNoteName(meta.key)}
          {meta.mode === 'minor' && ' (minor, from 6)'}
        </li>
        <li>
          <span>Time</span>
          {meta.time.beats}/{meta.time.unit}
        </li>
        <li>
          <span>Tempo</span>
          {meta.tempo}
        </li>
        <li>
          <span>Length</span>
          {numbered} measures
        </li>
      </ul>
      <p className="song-header__legend">
        Right-hand row: 1 = {midiToText(song.rightDo)}. Left-hand row: 1 = {midiToText(song.leftDo)}
        , {octaves === 1 ? 'one octave' : `${octaves} octaves`} lower. Notes written one above the
        other are played together.
      </p>
    </section>
  );
}
