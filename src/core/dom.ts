import { detectWindow, type WindowKind } from '../detectors/system';

import { DEFAULT_RARITY_PROFILE, type RarityProfile } from './rarity-config';

import {
  isNonItemIdentity,
  itemLines,
  itemNameLine,
  rarityField,
  rarityHeader,
} from '../detectors/item-rarity';

import { clearRarity } from '../formatters/rarity-formatter';
import { BLOCKS, EXCLUDED, neighbor } from './dom-structure';
import { readText } from './text-ranges';

export function blockText(element: Element): string {
  return readText(element).text;
}

/**
 * Remove only the outer brackets from plain-text notifications.
 * Keep the original content so clearFormatting() can restore it.
 */
function hideBrackets(element: HTMLElement): void {
  if (element.hasAttribute('data-rpg-brackets-hidden')) {
    return;
  }

  if (element.children.length > 0) {
    return;
  }

  const original = element.textContent || '';
  const trimmed = original.trim();

  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return;
  }

  const start = original.indexOf('[');
  const end = original.lastIndexOf(']');

  if (start < 0 || end <= start) {
    return;
  }

  const before = original.slice(0, start);
  const content = original.slice(start + 1, end);
  const after = original.slice(end + 1);

  const opening = document.createElement('span');
  opening.className = 'rpg-bracket';
  opening.textContent = '[';

  const closing = document.createElement('span');
  closing.className = 'rpg-bracket';
  closing.textContent = ']';

  element.replaceChildren(
    document.createTextNode(before),
    opening,
    document.createTextNode(content),
    closing,
    document.createTextNode(after),
  );

  element.dataset.rpgBracketsHidden = 'true';
}

function restoreBrackets(element: HTMLElement): void {
  if (!element.hasAttribute('data-rpg-brackets-hidden')) {
    return;
  }

  const text = element.textContent || '';

  element.replaceChildren(document.createTextNode(text));

  element.removeAttribute('data-rpg-brackets-hidden');
}

export function decorateWindows(
  root: HTMLElement,
  profile: RarityProfile = DEFAULT_RARITY_PROFILE,
): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS));

  const kinds = new Map<Element, WindowKind>();
  const texts = new Map<Element, string>();

  for (const element of elements) {
    if (
      element.closest(EXCLUDED) ||
      element.querySelector(BLOCKS) ||
      element.querySelector(EXCLUDED)
    ) {
      continue;
    }

    const previous = neighbor(element, 'previousSibling');

    // Use the original text when a window was already decorated.
    const text =
      element.getAttribute('data-rpg-original-text') ?? blockText(element);

    texts.set(element, text);

    if (
      previous &&
      isNonItemIdentity(blockText(previous)) &&
      itemLines(text).every((line) => rarityField(line.text, profile))
    ) {
      continue;
    }

    const kind = detectWindow(
      text,
      previous ? kinds.get(previous) || null : null,
      profile,
    );

    if (kind) kinds.set(element, kind);
  }

  const joins = (before: Element | null, after: Element | null): boolean => {
    if (
      !before ||
      !after ||
      !kinds.has(before) ||
      kinds.get(before) !== kinds.get(after)
    ) {
      return false;
    }

    if (kinds.get(before) !== 'item') return true;

    const previous = itemLines(texts.get(before)!);
    const next = itemLines(texts.get(after)!);

    if (next.some((line) => rarityHeader(line.text, profile))) {
      return false;
    }

    if (next.some((line) => itemNameLine(line.text))) {
      return (
        previous.length === 1 &&
        !!rarityHeader(previous[0].text, profile) &&
        !rarityHeader(previous[0].text, profile)![2]
      );
    }

    return true;
  };

  for (const element of elements) {
    const kind = kinds.get(element);

    if (!kind) {
      restoreBrackets(element);

      if (element.classList.contains('rpg-window')) {
        element.classList.remove('rpg-window');

        if (!element.className) {
          element.removeAttribute('class');
        }

        element.removeAttribute('data-rpg-kind');
        element.removeAttribute('data-rpg-group');
      }

      continue;
    }

    element.classList.add('rpg-window');
    element.dataset.rpgKind = kind;

    const before = neighbor(element, 'previousSibling');
    const after = neighbor(element, 'nextSibling');

    const joinedBefore = joins(before, element);
    const joinedAfter = joins(element, after);

    element.dataset.rpgGroup = joinedBefore
      ? joinedAfter
        ? 'middle'
        : 'end'
      : joinedAfter
        ? 'start'
        : 'single';

    // Only strip brackets for recognized system notifications.
    if (kind === 'system') {
      hideBrackets(element);
    } else {
      restoreBrackets(element);
    }
  }
}

export function clearFormatting(root: HTMLElement): void {
  clearRarity(root);

  root.querySelectorAll<HTMLElement>('.rpg-window').forEach((element) => {
    restoreBrackets(element);

    element.classList.remove('rpg-window');

    if (!element.className) {
      element.removeAttribute('class');
    }

    element.removeAttribute('data-rpg-kind');
    element.removeAttribute('data-rpg-group');
  });

  root
    .querySelectorAll('.rpg-money')
    .forEach((element) =>
      element.replaceWith(...Array.from(element.childNodes)),
    );

  root.removeAttribute('data-rpg-theme');
  root.removeAttribute('data-rpg-tone');
}

export function readingAnchor(root: HTMLElement): () => void {
  const win = root.ownerDocument.defaultView!;

  if (
    root.ownerDocument.body.classList.contains('page-reader') ||
    win.scrollY === 0
  ) {
    return () => {};
  }

  const element = Array.from(root.querySelectorAll('p,li,blockquote')).find(
    (el) => {
      const box = el.getBoundingClientRect();

      return box.bottom > 0 && box.top < win.innerHeight;
    },
  );

  if (!element) return () => {};

  const top = element.getBoundingClientRect().top;

  return () => {
    if (!element.isConnected) return;

    const delta = element.getBoundingClientRect().top - top;

    if (Math.abs(delta) > 0.5) {
      const style = root.ownerDocument.documentElement.style;

      const old = style.getPropertyValue('scroll-behavior');

      const priority = style.getPropertyPriority('scroll-behavior');

      style.setProperty('scroll-behavior', 'auto', 'important');

      win.scrollBy(0, delta);

      if (old) {
        style.setProperty('scroll-behavior', old, priority);
      } else {
        style.removeProperty('scroll-behavior');
      }
    }
  };
}
