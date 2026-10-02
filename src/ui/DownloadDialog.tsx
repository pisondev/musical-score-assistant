import { useEffect, useRef, type ReactNode } from 'react';
import {
  formatNoteName,
  songReference,
  type EndingChoice,
  type IntroChoice,
  type Performance,
  type SongBundle,
} from '../core';
import { Dialog } from './Dialog';
import { formatBytes, formatDuration } from './file-size';
import { DownloadIcon } from './icons';
import { introName } from './intro-name';
import { RIGHT_HAND_NAME } from './right-hand-name';
import { EXPORT_NAME, exportFileNameFor, useExportFacts, type ExportKind } from './song-export';

const LEVEL_LABEL = { easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced' } as const;
const HANDS = { both: 'Both hands', right: 'Right hand only', left: 'Left hand only' } as const;
const LIFT_NAME: Record<number, string> = { 1: 'Up a half step', 2: 'Up a whole step' };

const WHAT: Record<ExportKind, string> = {
  midi: 'The notes themselves, one track per hand, for a keyboard or a music program.',
  mp3: 'A recording with the piano sound of this app, for a phone or any audio player.',
};

interface DownloadDialogProps {
  kind: ExportKind;
  bundle: SongBundle;
  performance: Performance;
  intro: IntroChoice;
  ending: EndingChoice;
  lift: number;
  semitones: number;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Asks before a file is made: lists everything that decides what the file
 * holds, as it is set right now, with its length and size. Nothing is
 * downloaded until the player confirms.
 */
export function DownloadDialog({
  kind,
  bundle,
  performance,
  intro,
  ending,
  lift,
  semitones,
  onConfirm,
  onClose,
}: DownloadDialogProps) {
  const facts = useExportFacts(performance);
  const confirm = useRef<HTMLButtonElement>(null);
  // Enter confirms right away; the dialog still opens at its top.
  useEffect(() => confirm.current?.focus({ preventScroll: true }), []);

  const { song, arrangement, rightHand, chords, sections } = performance;
  const { meta } = song;
  const reference = songReference(meta);
  const repeat = sections.find((section) => section.kind === 'song' && section.pass === 2);
  const endingName = bundle.endings.find((written) => written.id === ending)?.name;
  const measures = song.measures.length;
  const shift = `${semitones > 0 ? '+' : '−'}${Math.abs(semitones)}`;

  const rows: { label: string; value: ReactNode; detail?: string }[] = [
    { label: 'Song', value: reference ? `${reference} · ${meta.title}` : meta.title },
    {
      label: 'Left hand',
      value: arrangement.name,
      detail: [LEVEL_LABEL[arrangement.level], arrangement.style].filter(Boolean).join(' · '),
    },
    {
      label: 'Right hand',
      value: RIGHT_HAND_NAME[rightHand],
      detail: chords ? 'with chords under the melody' : undefined,
    },
    { label: 'Intro', value: introName(bundle, intro) },
    {
      label: 'Repeat',
      value: repeat ? (LIFT_NAME[lift] ?? 'On') : 'Off',
      detail: repeat ? `to 1 = ${formatNoteName(repeat.key)}` : undefined,
    },
    { label: 'Ending', value: endingName ?? 'Off' },
    {
      label: 'Key',
      value: `1 = ${formatNoteName(meta.key)}`,
      detail: semitones === 0 ? 'original key' : `${shift} from the original key`,
    },
    {
      label: 'Tempo',
      value: String(facts.tempo),
      detail:
        facts.tempo === bundle.song.meta.tempo
          ? 'as printed'
          : `printed: ${bundle.song.meta.tempo}`,
    },
    {
      label: 'Hands',
      value: HANDS[facts.handMode],
      detail: facts.hasVoice
        ? facts.voiceGuide
          ? 'with the voice guide'
          : 'without the voice guide'
        : undefined,
    },
    {
      label: 'Length',
      value: formatDuration(facts.seconds),
      detail: `${measures} measure${measures === 1 ? '' : 's'}`,
    },
    {
      label: 'File',
      value: <span className="summary__file">{exportFileNameFor(performance, kind)}</span>,
      detail: `${kind === 'mp3' ? 'about ' : ''}${formatBytes(facts.bytes[kind])}`,
    },
  ];

  return (
    <Dialog
      title={`Download ${EXPORT_NAME[kind]}`}
      label={`Download ${EXPORT_NAME[kind]}: check the settings`}
      onClose={onClose}
    >
      <p className="dialog__lead">{WHAT[kind]} The file will hold what is set now:</p>
      <dl className="summary">
        {rows.map(({ label, value, detail }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {value}
              {detail && <span>{detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="dialog__note">
        The dynamics of the sheet are included; the metronome and the loop are not. To change
        anything, close this and use <strong>Options</strong> or the playback bar.
      </p>
      <footer className="dialog__foot dialog__foot--stick">
        <div className="dialog__buttons">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            ref={confirm}
            type="button"
            className="button button--solid"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            <DownloadIcon width={16} height={16} />
            <span>Download {EXPORT_NAME[kind]}</span>
          </button>
        </div>
      </footer>
    </Dialog>
  );
}
