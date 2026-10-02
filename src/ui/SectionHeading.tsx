import type { PerformanceSection } from '../core';

/** The line above a block of the score: "Intro Last phrase", "Song, repeated 1 = B♭". */
export function SectionHeading({ section }: { section: PerformanceSection }) {
  return (
    <h3 className="sheet__heading">
      {section.title}
      {section.detail && <span>{section.detail}</span>}
    </h3>
  );
}
