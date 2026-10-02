import type { Issue, Song } from '../core';
import { AlertIcon } from './icons';

interface IssueListProps {
  song: Song;
  issues: Issue[];
}

function describeLocation(issue: Issue, song: Song): string {
  const parts: string[] = [];
  if (issue.measure !== undefined) {
    const number = song.measures[issue.measure]?.number;
    parts.push(number === null ? 'Pickup' : `Measure ${number}`);
  }
  if (issue.hand) parts.push(issue.hand === 'right' ? 'melody' : 'left hand');
  if (issue.line) parts.push(`line ${issue.line}`);
  return parts.join(', ');
}

/** Lists errors and warnings so a transcription can be corrected against the printed score. */
export function IssueList({ song, issues }: IssueListProps) {
  const visible = issues.filter((issue) => issue.severity !== 'info');
  if (visible.length === 0) return null;
  const errors = visible.filter((issue) => issue.severity === 'error').length;
  const warnings = visible.length - errors;
  const summary = [
    errors > 0 && `${errors} error${errors === 1 ? '' : 's'}`,
    warnings > 0 && `${warnings} warning${warnings === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <details className={errors > 0 ? 'issues issues--error' : 'issues'} open={errors > 0}>
      <summary>
        <AlertIcon width={16} height={16} />
        {summary} to review
      </summary>
      <ul>
        {visible.map((issue, index) => {
          const location = describeLocation(issue, song);
          return (
            <li key={index}>
              {location && <strong>{location}: </strong>}
              {issue.message}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
