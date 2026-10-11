import { detectWindow, type WindowKind } from '../detectors/system';

import { DEFAULT_RARITY_PROFILE, type RarityProfile } from './rarity-config';

import {
  isNonItemIdentity,
  itemLines,
  itemNameLine,
  rarityField,
  rarityHeader,
} from '../detectors/item-rarity';

import {
  isItemDescription,
  isItemRequirement,
  isUnlabeledItemName,
} from '../detectors/items';
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
/**
 * Extends an identified item through its descriptive
 * paragraphs and explicit requirement fields.
 *
 * Does not modify the DOM.
 */
function extendItemDescriptions(
  elements: HTMLElement[],
  kinds: Map<Element, WindowKind>,
  texts: Map<Element, string>,
  profile: RarityProfile,
): void {
  for (let index = 0; index < elements.length - 1; index++) {
    const element = elements[index];

    if (kinds.get(element) !== 'item') continue;

    const name = texts.get(element);

    if (!name || !isUnlabeledItemName(name)) continue;

    const ratingElement = elements[index + 1];

    // The rating must be the actual next DOM sibling.
    if (neighbor(element, 'nextSibling') !== ratingElement) {
      continue;
    }

    const ratingText = texts.get(ratingElement);

    if (!ratingText) continue;

    const ratingLines = itemLines(ratingText);

    if (
      ratingLines.length !== 1 ||
      !rarityField(ratingLines[0].text, profile)
    ) {
      continue;
    }

    // We have an item name followed by an explicit rating.
    let previous: Element = ratingElement;
    let descriptions = 0;

    for (let nextIndex = index + 2; nextIndex < elements.length; nextIndex++) {
      const next = elements[nextIndex];

      if (neighbor(previous, 'nextSibling') !== next) break;

      // Never overwrite another recognized window.
      if (kinds.has(next)) break;

      const text = texts.get(next);

      if (!text) break;

      if (isItemRequirement(text)) {
        kinds.set(next, 'item');
        break;
      }

      if (!isItemDescription(text)) break;

      // Limit unmarked descriptive paragraphs.
      if (descriptions >= 3) break;

      kinds.set(next, 'item');

      descriptions++;
      previous = next;
    }
  }
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

    let kind = detectWindow(
      text,
      previous ? kinds.get(previous) || null : null,
      profile,
    );

    // An unlabeled item name followed by a rarity field
    // belongs to the item, not to the system notification group.
    const next = neighbor(element, 'nextSibling');

    if (next && isUnlabeledItemName(text)) {
      const nextText =
        next.getAttribute('data-rpg-original-text') ?? blockText(next);

      const nextLines = itemLines(nextText);

      if (nextLines.length === 1 && rarityField(nextLines[0].text, profile)) {
        kind = 'item';
      }
    }

    if (kind) kinds.set(element, kind);
  }

  extendItemDescriptions(elements, kinds, texts, profile);

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

    // Free-text descriptions and requirement fields that were
    // explicitly classified as item continuations stay grouped.
    if (
      isItemDescription(texts.get(after)!) ||
      isItemRequirement(texts.get(after)!)
    ) {
      return true;
    }

    if (next.some((line) => rarityHeader(line.text, profile))) {
      return false;
    }

    // Unlabeled item name followed by its explicit rarity.
    if (
      isUnlabeledItemName(texts.get(before)!) &&
      next.length === 1 &&
      rarityField(next[0].text, profile)
    ) {
      return true;
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
