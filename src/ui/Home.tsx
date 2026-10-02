import { useMemo, useState } from 'react';
import { formatNoteName } from '../core';
import { library, type SongEntry } from '../library';
import { useHistory } from '../store/history';
import { cx } from './classnames';
import { AlertIcon, ArrowRightIcon, LockIcon, PlusIcon, SearchIcon, StarIcon } from './icons';
import { lastOpened, selectSongs, type SongFilter, type SongSort } from './library-view';
import { songHref } from './navigation';
import { timeAgo } from './time-ago';

const FILTERS: { filter: SongFilter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'favourites', label: 'Favourites' },
];

const SORTS: { sort: SongSort; label: string }[] = [
  { sort: 'recent', label: 'Recently opened' },
  { sort: 'title', label: 'Title' },
  { sort: 'number', label: 'Number' },
];

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

interface SongCardProps {
  entry: SongEntry;
  favourite: boolean;
  openedAt: number | undefined;
  now: number;
  onToggleFavourite: (songId: string) => void;
}

function SongCard({ entry, favourite, openedAt, now, onToggleFavourite }: SongCardProps) {
  const { meta } = entry.bundle.song;
  const { summary } = entry;
  const toReview = summary.errors + summary.warnings;
  const credit = [meta.composer, meta.source].filter(Boolean).join(' · ');

  return (
    <li className={cx('card', 'song-card', summary.errors > 0 && 'song-card--error')}>
      <div className="song-card__top">
        {meta.number && <span className="number-badge">{meta.number}</span>}
        {entry.isPrivate && (
          <span className="badge badge--private" title="Stored in songs/private; never committed">
            <LockIcon width={12} height={12} />
            Local only
          </span>
        )}
        <button
          type="button"
          className={cx('song-card__star', favourite && 'is-on')}
          onClick={() => onToggleFavourite(entry.id)}
          aria-pressed={favourite}
          aria-label={favourite ? 'Remove from favourites' : 'Add to favourites'}
          title={favourite ? 'Remove from favourites' : 'Add to favourites'}
        >
          <StarIcon width={18} height={18} filled={favourite} />
        </button>
      </div>

      <h2 className="song-card__title">
        <a href={songHref(entry.id)} className="song-card__link">
          {meta.title}
        </a>
      </h2>
      <p className="song-card__facts">
        <span>
          1 = {formatNoteName(meta.key)}
          {meta.mode === 'minor' && ' (minor)'}
        </span>
        <span>
          {meta.time.beats}/{meta.time.unit}
        </span>
        <span>Tempo {meta.tempo}</span>
        <span>{plural(summary.measures, 'measure')}</span>
      </p>
      {credit && <p className="song-card__credit">{credit}</p>}

      {summary.styles.length > 0 && (
        <ul className="song-card__styles" aria-label="Styles">
          {summary.styles.map((style) => (
            <li key={style} className="tag">
              {style}
            </li>
          ))}
        </ul>
      )}

      <p className="song-card__counts">
        <span>{plural(summary.arrangements, 'left hand')}</span>
        <span>{plural(summary.rightHandParts, 'right-hand part')}</span>
        <span>{plural(summary.intros, 'intro')}</span>
      </p>

      <p className="song-card__foot">
        <span>
          {openedAt === undefined ? 'Not opened yet' : `Opened ${timeAgo(openedAt, now)}`}
        </span>
        {toReview > 0 && (
          <span className="song-card__review">
            <AlertIcon width={13} height={13} />
            {toReview} to review
          </span>
        )}
      </p>
    </li>
  );
}

/** The home page: what was practised last, and every song in the library. */
export function Home() {
  const opened = useHistory((state) => state.opened);
  const favourites = useHistory((state) => state.favourites);
  const toggleFavourite = useHistory((state) => state.toggleFavourite);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SongFilter>('all');
  const [sort, setSort] = useState<SongSort>('recent');
  // One reading of the clock per visit keeps "opened 3 hours ago" stable while typing.
  const [now] = useState(() => Date.now());

  const songs = useMemo(
    () => selectSongs(library, { query, filter, sort, favourites, opened }),
    [query, filter, sort, favourites, opened],
  );
  const resume = useMemo(() => lastOpened(library, opened), [opened]);
  const resumeArrangement = resume?.bundle.arrangements.find(
    (arrangement) => arrangement.id === opened[resume.id].arrangementId,
  );

  const totals = useMemo(() => {
    const sum = (pick: (entry: SongEntry) => number) =>
      library.reduce((total, entry) => total + pick(entry), 0);
    return [
      { label: 'Songs', value: library.length },
      { label: 'Left hands', value: sum((entry) => entry.summary.arrangements) },
      { label: 'Right-hand parts', value: sum((entry) => entry.summary.rightHandParts) },
      { label: 'Introductions', value: sum((entry) => entry.summary.intros) },
    ];
  }, []);

  const empty = library.length === 0;

  return (
    <main className="page home">
      <section className="home__hero">
        <div className="home__intro">
          <h1>{empty ? 'No songs yet' : 'Your songs'}</h1>
          <p>
            {empty
              ? 'The library is empty. Add the first song to start practising.'
              : 'Open a song to see its score, compare left hands, and play along.'}
          </p>
        </div>
        {!empty && (
          <dl className="stats">
            {totals.map(({ label, value }) => (
              <div key={label} className="stats__item">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {resume && (
        <section className="card resume" aria-label="Continue practising">
          <div className="resume__text">
            <p className="resume__label">Continue practising</p>
            <h2>{resume.bundle.song.meta.title}</h2>
            <p className="resume__detail">
              {resumeArrangement && <span>Left hand: {resumeArrangement.name}</span>}
              <span>Opened {timeAgo(opened[resume.id].openedAt, now)}</span>
            </p>
          </div>
          <a className="button button--solid" href={songHref(resume.id)}>
            Continue
            <ArrowRightIcon width={16} height={16} />
          </a>
        </section>
      )}

      {!empty && (
        <div className="library-controls">
          <label className="search">
            <SearchIcon width={16} height={16} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, number, or style"
              aria-label="Search songs"
            />
          </label>
          <div className="switch" role="radiogroup" aria-label="Songs to show">
            {FILTERS.map((option) => (
              <button
                key={option.filter}
                type="button"
                role="radio"
                aria-checked={filter === option.filter}
                className={cx(filter === option.filter && 'is-selected')}
                onClick={() => setFilter(option.filter)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="song-select library-controls__sort">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SongSort)}>
              {SORTS.map((option) => (
                <option key={option.sort} value={option.sort}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {!empty && songs.length === 0 && (
        <p className="library-empty">
          {filter === 'favourites' && query.trim() === ''
            ? 'No favourites yet. Mark a song with the star to keep it here.'
            : 'No song matches the search.'}
        </p>
      )}

      <ul className="song-grid">
        {songs.map((entry) => (
          <SongCard
            key={entry.id}
            entry={entry}
            favourite={favourites.includes(entry.id)}
            openedAt={opened[entry.id]?.openedAt}
            now={now}
            onToggleFavourite={toggleFavourite}
          />
        ))}
        <li className="song-card song-card--add">
          <span className="song-card__plus">
            <PlusIcon width={18} height={18} />
          </span>
          <h2 className="song-card__title">Add a song</h2>
          <p>
            Give a photo of the score to the assistant in your editor. It writes the melody, the
            left hands, and the right-hand parts into <code>songs/</code>, and the song appears
            here. The format is described in <code>docs/song-format.md</code>.
          </p>
        </li>
      </ul>
    </main>
  );
}
