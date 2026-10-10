import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from './classnames';
import { CheckIcon } from './icons';
import { Popover } from './Popover';

type Key = string | number;

export interface SelectOption<Value extends Key> {
  value: Value;
  /** The text of the option in the list. */
  label: string;
  /** Short text in front of the label, such as the number of a song. */
  lead?: string;
  /** What the field shows when this option is chosen, where the label alone says too little. */
  shown?: string;
}

export interface SelectGroup<Value extends Key> {
  /** Heading of the group; leave it out for a list that needs none. */
  label?: string;
  options: SelectOption<Value>[];
}

interface SelectProps<Value extends Key> {
  /** Names the field for screen readers, in the tooltip, and on the sheet of a phone. */
  label: string;
  value: Value;
  groups: SelectGroup<Value>[];
  onChange: (value: Value) => void;
  /** A list of lines, or a grid of short cells such as measure numbers. */
  layout?: 'list' | 'grid';
  align?: 'left' | 'right';
  /** Opens the list above the field, for a field at the bottom of the window. */
  side?: 'below' | 'above';
}

/** How long typed characters are taken together as the start of one option, in milliseconds. */
const TYPING_PAUSE = 700;

/** A label longer than this takes two cells of a grid. */
const CELL_CHARACTERS = 3;

/** Scrolls the list an option is in so that the option is in its middle, and nothing else. */
function centre(option: HTMLElement): void {
  for (let box = option.parentElement; box; box = box.parentElement) {
    if (box.scrollHeight <= box.clientHeight) continue;
    if (getComputedStyle(box).overflowY === 'visible') continue;
    const offset = option.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop += offset - (box.clientHeight - option.offsetHeight) / 2;
    return;
  }
}

interface SelectListProps<Value extends Key> extends Pick<
  SelectProps<Value>,
  'label' | 'value' | 'groups' | 'layout'
> {
  onPick: (value: Value) => void;
  close: () => void;
}

/** The open list: it takes the keyboard, and one of its options is the active one. */
function SelectList<Value extends Key>({
  label,
  value,
  groups,
  layout,
  onPick,
  close,
}: SelectListProps<Value>) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  // Every option has a place in the list as a whole; a group knows where its options begin.
  const sections = useMemo(() => {
    let start = 0;
    return groups.map((group) => {
      const section = { ...group, start };
      start += group.options.length;
      return section;
    });
  }, [groups]);
  const options = useMemo(() => groups.flatMap((group) => group.options), [groups]);
  const chosen = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [active, setActive] = useState(chosen);
  const opening = useRef(chosen);

  const element = (index: number) =>
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`) ?? null;

  // The list takes the keyboard as soon as it opens, with the chosen option in the middle.
  useEffect(() => {
    list.current?.focus({ preventScroll: true });
    const option = list.current?.querySelector<HTMLElement>(`[data-index="${opening.current}"]`);
    if (option) centre(option);
  }, []);

  const move = (index: number) => {
    setActive(index);
    element(index)?.scrollIntoView({ block: 'nearest' });
  };

  /** The option above or below another one: the nearest in the neighbouring row. */
  const inNextRow = (from: number, direction: 1 | -1): number => {
    const start = element(from)?.getBoundingClientRect();
    if (!start) return from;
    let best = from;
    let bestRow = Infinity;
    let bestAside = Infinity;
    options.forEach((_, index) => {
      const box = element(index)?.getBoundingClientRect();
      if (!box) return;
      const row = (box.top - start.top) * direction;
      if (row < 1) return;
      const aside = Math.abs(box.left - start.left);
      if (row < bestRow - 1 || (row <= bestRow + 1 && aside < bestAside)) {
        best = index;
        bestRow = row;
        bestAside = aside;
      }
    });
    return best;
  };

  /** The first option that begins with what has been typed in quick succession. */
  const typedOption = (character: string): number | null => {
    const now = Date.now();
    const before = now - typed.current.at < TYPING_PAUSE ? typed.current.text : '';
    const text = before + character.toLowerCase();
    typed.current = { text, at: now };
    const found = options.findIndex((option) =>
      [option.lead, option.label].some((part) => part?.toLowerCase().startsWith(text)),
    );
    return found === -1 ? null : found;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = inNextRow(active, 1);
        break;
      case 'ArrowUp':
        next = inNextRow(active, -1);
        break;
      case 'ArrowRight':
        next = Math.min(last, active + 1);
        break;
      case 'ArrowLeft':
        next = Math.max(0, active - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (options[active]) onPick(options[active].value);
        return;
      case 'Tab':
        close();
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          next = typedOption(event.key);
        }
    }
    if (next === null) return;
    event.preventDefault();
    move(next);
  };

  return (
    <div
      ref={list}
      className="select__list"
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={options.length > 0 ? `${id}-${active}` : undefined}
      onKeyDown={onKeyDown}
    >
      {sections.map((section) => (
        <div
          key={section.label ?? section.start}
          className="select__group"
          role="group"
          aria-label={section.label}
        >
          {section.label && (
            <div className="select__heading" aria-hidden="true">
              {section.label}
            </div>
          )}
          <div className={cx('select__options', layout === 'grid' && 'select__options--grid')}>
            {section.options.map((option, position) => {
              const index = section.start + position;
              const selected = option.value === value;
              return (
                <div
                  key={option.value}
                  id={`${id}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  className={cx(
                    'select__option',
                    selected && 'is-selected',
                    index === active && 'is-active',
                    layout === 'grid' &&
                      option.label.length > CELL_CHARACTERS &&
                      'select__option--wide',
                  )}
                  onClick={() => onPick(option.value)}
                >
                  {option.lead && <span className="select__lead">{option.lead}</span>}
                  <span className="select__text">{option.label}</span>
                  {selected && layout !== 'grid' && (
                    <CheckIcon width={14} height={14} className="select__check" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A field that picks one value from a list, in place of the select of the browser: the same
 * panel, sheet, and motion as every other menu of the app. The list can be grouped under
 * headings, follows the arrow keys, and jumps to what is typed.
 */
export function Select<Value extends Key>({
  label,
  value,
  groups,
  onChange,
  layout = 'list',
  align,
  side,
}: SelectProps<Value>) {
  const current = groups.flatMap((group) => group.options).find((option) => option.value === value);
  const shown =
    current?.shown ?? (current?.lead ? `${current.lead} · ${current.label}` : current?.label);

  return (
    <Popover
      label={label}
      value={shown ?? ''}
      select
      align={align}
      side={side}
      panelClassName={cx('popover__panel--select', layout === 'grid' && 'popover__panel--grid')}
    >
      {(close) => (
        <SelectList
          label={label}
          value={value}
          groups={groups}
          layout={layout}
          close={close}
          onPick={(picked) => {
            close();
            if (picked !== value) onChange(picked);
          }}
        />
      )}
    </Popover>
  );
}
