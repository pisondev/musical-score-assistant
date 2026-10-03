import { useMemo, useState } from 'react';
import { formatNoteName, hymnalName, songReference } from '../core';
import { PRIVACY_URL, signInUrl, useAccount } from '../account';
import { PRIVATE_HINT, useLibrary, type SongEntry } from '../library';
import { useHistory } from '../store/history';
import { cx } from './classnames';
import { AlertIcon, ArrowRightIcon, LockIcon, PlusIcon, SearchIcon, StarIcon } from './icons';
import { InstallCard } from './InstallCard';
import {
  groupByCategory,
  lastOpened,
  selectSongs,
  type SongFilter,
  type SongSort,
} from './library-view';
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
  const { meta, summary } = entry;
  const toReview = summary.errors + summary.warnings;
  const reference = songReference(meta);
  const credit = [meta.composer, meta.source].filter(Boolean).join(' · ');

  return (
    <li className={cx('card', 'song-card', summary.errors > 0 && 'song-card--error')}>
      <div className="song-card__top">
        {reference && (
          <span className="number-badge" title={hymnalName(meta.book) ?? undefined}>
            {reference}
          </span>
        )}
        {entry.isPrivate && (
          <span className="badge badge--private" title={PRIVATE_HINT}>
            <LockIcon width={12} height={12} />
            Private
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

      <h3 className="song-card__title">
        <a href={songHref(entry.id)} className="song-card__link">
          {meta.title}
        </a>
      </h3>
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
        {summary.endings > 0 && <span>{plural(summary.endings, 'ending')}</span>}
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

/**
 * The home page: what was practised last, and every song in the library by category and
 * subcategory (Christian: the hymnals; Classical: the composers).
 */
export function Home() {
  const opened = useHistory((state) => state.opened);
  const favourites = useHistory((state) => state.favourites);
  const toggleFavourite = useHistory((state) => state.toggleFavourite);
  const library = useLibrary((state) => state.entries);
  const account = useAccount((state) => state.account);
  const signIn = useAccount((state) => state.signIn);
  const privateSongs = useLibrary((state) => state.privateSongs);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SongFilter>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SongSort>('recent');
  // One reading of the clock per visit keeps "opened 3 hours ago" stable while typing.
  const [now] = useState(() => Date.now());

  // The owner of the licensed hymnals sees every hymnal, empty or not; nobody else sees them.
  const owner = privateSongs === 'loaded';
  // The chips count every song of a category; the sections show what the search leaves of it.
  const categories = useMemo(() => groupByCategory(library, { hymnals: owner }), [library, owner]);
  const songs = useMemo(
    () => selectSongs(library, { query, filter, category, subcategory, sort, favourites, opened }),
    [library, query, filter, category, subcategory, sort, favourites, opened],
  );
  const sections = useMemo(
    () =>
      groupByCategory(songs).flatMap((group) =>
        group.subcategories.map((sub) => ({ category: group, ...sub })),
      ),
    [songs],
  );
  const resume = useMemo(() => lastOpened(library, opened), [library, opened]);
  const resumeArrangement = resume?.arrangements.find(
    (arrangement) => arrangement.id === opened[resume.id].arrangementId,
  );
  const chooseCategory = (id: string | null) => {
    setCategory(id);
    setSubcategory(null);
  };

  const totals = useMemo(() => {
    const sum = (pick: (entry: SongEntry) => number) =>
      library.reduce((total, entry) => total + pick(entry), 0);
    return [
      { label: 'Songs', value: library.length },
      { label: 'Left hands', value: sum((entry) => entry.summary.arrangements) },
      { label: 'Right-hand parts', value: sum((entry) => entry.summary.rightHandParts) },
      { label: 'Introductions', value: sum((entry) => entry.summary.intros) },
    ];
  }, [library]);

  const empty = library.length === 0;
  const selected = categories.find((group) => group.id === category);
  const selectedSub = selected?.subcategories.find((sub) => sub.id === subcategory);

  let nothing: string | null = null;
  if (!empty && songs.length === 0) {
    if (query.trim() !== '') nothing = 'No song matches the search.';
    else if (filter === 'favourites') {
      nothing = 'No favourites here yet. Mark a song with the star to keep it in this list.';
    } else if (selectedSub) nothing = `No songs from ${selectedSub.name} yet.`;
    else if (selected) nothing = `No ${selected.name} songs yet.`;
  }

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
          {signIn === 'google' && !account && (
            <p className="home__signin">
              <a href={signInUrl()}>Sign in with Google</a> to keep your favourites, recent songs,
              and settings on every device.
            </p>
          )}
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

      <InstallCard />

      {resume && (
        <section className="card resume" aria-label="Continue practising">
          <div className="resume__text">
            <p className="resume__label">Continue practising</p>
            <h2>{resume.meta.title}</h2>
            <p className="resume__detail">
              {songReference(resume.meta) && <span>{songReference(resume.meta)}</span>}
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

      {!empty && (
        <div className="chips chips--categories" role="radiogroup" aria-label="Category">
          <button
            type="button"
            role="radio"
            aria-checked={category === null}
            className={cx('chip', category === null && 'is-selected')}
            onClick={() => chooseCategory(null)}
          >
            All songs <span>{library.length}</span>
          </button>
          {categories.map((group) => (
            <button
              key={group.id}
              type="button"
              role="radio"
              aria-checked={category === group.id}
              className={cx(
                'chip',
                category === group.id && 'is-selected',
                group.songs.length === 0 && 'chip--empty',
              )}
              onClick={() => chooseCategory(group.id)}
            >
              {group.name} <span>{group.songs.length}</span>
            </button>
          ))}
        </div>
      )}

      {selected && selected.subcategories.length > 1 && (
        <div className="chips" role="radiogroup" aria-label={`${selected.name} by subcategory`}>
          <button
            type="button"
            role="radio"
            aria-checked={subcategory === null}
            className={cx('chip', subcategory === null && 'is-selected')}
            onClick={() => setSubcategory(null)}
          >
            All {selected.name} <span>{selected.songs.length}</span>
          </button>
          {selected.subcategories.map((sub) => (
            <button
              key={sub.id}
              type="button"
              role="radio"
              aria-checked={subcategory === sub.id}
              className={cx(
                'chip',
                subcategory === sub.id && 'is-selected',
                sub.songs.length === 0 && 'chip--empty',
              )}
              onClick={() => setSubcategory(sub.id)}
              title={sub.name}
            >
              {sub.id} <span>{sub.songs.length}</span>
            </button>
          ))}
        </div>
      )}

      {nothing && <p className="library-empty">{nothing}</p>}

      {sections.map((group) => (
        <section
          key={`${group.category.id}/${group.id}`}
          className="hymnal"
          aria-label={`${group.category.name}: ${group.name}`}
        >
          <h2 className="hymnal__title">
            {category === null && <em>{group.category.name}</em>}
            {group.name}
            {group.name !== group.id && <span>{group.id}</span>}
            <small>{plural(group.songs.length, 'song')}</small>
          </h2>
          <ul className="song-grid">
            {group.songs.map((entry) => (
              <SongCard
                key={entry.id}
                entry={entry}
                favourite={favourites.includes(entry.id)}
                openedAt={opened[entry.id]?.openedAt}
                now={now}
                onToggleFavourite={toggleFavourite}
              />
            ))}
          </ul>
        </section>
      ))}

      {owner && (
        <ul className="song-grid">
          <li className="song-card song-card--add">
            <span className="song-card__plus">
              <PlusIcon width={18} height={18} />
            </span>
            <h2 className="song-card__title">Add a song</h2>
            <p>
              Give a photo of the score to the assistant in your editor. It writes the melody, the
              left hands, and the right-hand parts into <code>songs/</code>, and the song appears
              here under its category. The format is described in <code>docs/song-format.md</code>.
            </p>
          </li>
        </ul>
      )}

      {signIn === 'google' && (
        <footer className="home__foot">
          <a href={PRIVACY_URL}>Privacy</a>
        </footer>
      )}
    </main>
  );
}
