import { detectWindow, type WindowKind } from '../detectors/system';

import { DEFAULT_RARITY_PROFILE, type RarityProfile } from './rarity-config';

import {
  isNonItemIdentity,
  itemLines,
  itemNameLine,
  rarityField,
  rarityHeader,
} from '../detectors/item-rarity';

import { isItemDescription, isItemRequirement } from '../detectors/items';

import {
  isQuestAnchor,
  isQuestDescription,
  isQuestField,
  isQuestNote,
} from '../detectors/quests';

import { clearRarity } from '../formatters/rarity-formatter';

import { BLOCKS, EXCLUDED, neighbor } from './dom-structure';

import { readText } from './text-ranges';

export function blockText(element: Element): string {
  return readText(element).text;
}

/**
 * Hide the outer brackets of plain-text SYSTEM notifications.
 *
 * Brackets remain in textContent so the original content
 * can be restored without losing information.
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
 * Checks whether a bracketed paragraph is a plausible
 * standalone item title.
 *
 * This function does not classify the paragraph alone.
 * A valid rarity field must immediately follow it.
 */
function isItemTitleCandidate(text: string): boolean {
  const raw = text.trim();

  if (
    raw.length < 3 ||
    raw.length > 180 ||
    !raw.startsWith('[') ||
    !raw.endsWith(']')
  ) {
    return false;
  }

  const title = raw.slice(1, -1).trim();

  if (
    !title ||
    title.includes('\n') ||
    title.includes('[') ||
    title.includes(']')
  ) {
    return false;
  }

  // Reject common SYSTEM notification openings.
  if (
    /^(?:you|your|the|a|an|in order|at present|cannot|can't|unable|congratulations)\b/i.test(
      title,
    )
  ) {
    return false;
  }

  // Reject acquisition, progression and status messages.
  if (
    /\b(?:has been acquired|have acquired|was acquired|obtained|received|learned|level(?:ed)? up|is sealed|has increased|have increased)\b/i.test(
      title,
    )
  ) {
    return false;
  }

  // A standalone item title should not be a full sentence.
  if (/[.!?]$/.test(title)) {
    return false;
  }

  return true;
}

/**
 * Returns true only when the paragraph contains one
 * explicit rarity field, such as "Rating: Legendary".
 */
function isExplicitRating(text: string, profile: RarityProfile): boolean {
  const lines = itemLines(text);

  return lines.length === 1 && !!rarityField(lines[0].text, profile);
}

/**
 * Identifies complete item blocks from adjacent paragraphs.
 *
 * Example:
 *
 * [Swordsmanship Textbook: 200,000 Army Swordsmanship]
 * Rating: Legendary
 * A textbook recording the basics...
 * Only one swordsmanship technique...
 * Learning Conditions: ...
 *
 * This phase only classifies elements.
 * It does not change the DOM.
 */
function associateItemBlocks(
  elements: HTMLElement[],
  kinds: Map<Element, WindowKind>,
  texts: Map<Element, string>,
  profile: RarityProfile,
  itemContinuations: Set<Element>,
): void {
  for (let index = 0; index < elements.length - 1; index++) {
    const titleElement = elements[index];
    const ratingElement = elements[index + 1];

    // Both paragraphs must be actual DOM siblings.
    if (neighbor(titleElement, 'nextSibling') !== ratingElement) {
      continue;
    }

    const titleText = texts.get(titleElement);
    const ratingText = texts.get(ratingElement);

    if (!titleText || !ratingText) {
      continue;
    }

    if (!isItemTitleCandidate(titleText)) {
      continue;
    }

    if (!isExplicitRating(ratingText, profile)) {
      continue;
    }

    // Confirmed item title followed by an explicit rating.
    kinds.set(titleElement, 'item');
    kinds.set(ratingElement, 'item');

    itemContinuations.add(ratingElement);

    let previous: Element = ratingElement;
    let descriptions = 0;

    for (let nextIndex = index + 2; nextIndex < elements.length; nextIndex++) {
      const current = elements[nextIndex];

      // Stop at any structural interruption.
      if (neighbor(previous, 'nextSibling') !== current) {
        break;
      }

      // Never overwrite an independently detected window.
      if (kinds.has(current)) {
        break;
      }

      const text = texts.get(current);

      if (!text) {
        break;
      }

      // Explicit requirements end this item block.
      if (isItemRequirement(text)) {
        kinds.set(current, 'item');
        itemContinuations.add(current);
        break;
      }

      // Stop at dialogue, SYSTEM notifications or narrative.
      if (!isItemDescription(text)) {
        break;
      }

      // Limit unmarked description paragraphs.
      if (descriptions >= 3) {
        break;
      }

      kinds.set(current, 'item');
      itemContinuations.add(current);

      descriptions++;
      previous = current;
    }
  }
}

/**
 * Associates a bracketed quest title with its structured fields and
 * intervening description paragraphs. A nearby quest-specific field
 * is required before any classification is changed.
 */
function associateQuestBlocks(
  elements: HTMLElement[],
  kinds: Map<Element, WindowKind>,
  texts: Map<Element, string>,
  questContinuations: Set<Element>,
  questStarts: Set<Element>,
): void {
  for (let index = 0; index < elements.length - 1; index++) {
    const titleElement = elements[index];
    const titleText = texts.get(titleElement)?.trim();

    if (!titleText || !isItemTitleCandidate(titleText)) continue;
    // Item blocks have priority when a title is followed by a rating.
    if (kinds.get(titleElement) === 'item') continue;

    let previous: Element = titleElement;
    let anchorFound = false;

    // Look ahead at most four paragraphs for quest-specific evidence.
    for (
      let offset = 1;
      offset <= 4 && index + offset < elements.length;
      offset++
    ) {
      const candidate = elements[index + offset];
      const text = texts.get(candidate)?.trim();
      if (neighbor(previous, 'nextSibling') !== candidate || !text) break;
      if (text.startsWith('[') || kinds.get(candidate) === 'item') break;
      if (isQuestAnchor(text)) {
        anchorFound = true;
        break;
      }
      if (kinds.has(candidate) || !isQuestDescription(text)) break;
      previous = candidate;
    }

    if (!anchorFound) continue;

    kinds.set(titleElement, 'quest');
    questStarts.add(titleElement);
    previous = titleElement;
    let freeTextCount = 0;
    let rewardSeen = false;

    for (let nextIndex = index + 1; nextIndex < elements.length; nextIndex++) {
      const current = elements[nextIndex];
      const text = texts.get(current)?.trim();
      if (neighbor(previous, 'nextSibling') !== current || !text) break;
      if (text.startsWith('[') || kinds.get(current) === 'item') break;

      if (isQuestField(text)) {
        kinds.set(current, 'quest');
        questContinuations.add(current);
        previous = current;
        rewardSeen = /^(?:quest (?:clear )?rewards?|rewards?)\s*:/i.test(text);
        continue;
      }

      if (isQuestNote(text) && rewardSeen) {
        kinds.set(current, 'quest');
        questContinuations.add(current);
        break;
      }

      // After the reward, prose is treated as narrative, not quest text.
      if (rewardSeen || kinds.has(current) || !isQuestDescription(text)) break;
      if (freeTextCount >= 3) break;

      kinds.set(current, 'quest');
      questContinuations.add(current);
      freeTextCount++;
      previous = current;
    }
  }
}

/**
 * Classifies RPG windows and associates related paragraphs.
 *
 * Processing phases:
 *
 * 1. Independent classification
 * 2. Contextual item association
 * 3. Group boundary calculation
 * 4. DOM decoration
 */
export function decorateWindows(
  root: HTMLElement,
  profile: RarityProfile = DEFAULT_RARITY_PROFILE,
): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS));

  const kinds = new Map<Element, WindowKind>();
  const texts = new Map<Element, string>();

  const itemContinuations = new Set<Element>();
  const questContinuations = new Set<Element>();
  const questStarts = new Set<Element>();

  // =========================================
  // PHASE 1 — CLASSIFICATION
  // =========================================

  for (const element of elements) {
    if (
      element.closest(EXCLUDED) ||
      element.querySelector(BLOCKS) ||
      element.querySelector(EXCLUDED)
    ) {
      continue;
    }

    const previous = neighbor(element, 'previousSibling');

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

    if (kind) {
      kinds.set(element, kind);
    }
  }

  // =========================================
  // PHASE 2 — ITEM ASSOCIATION
  // =========================================

  associateItemBlocks(elements, kinds, texts, profile, itemContinuations);
  associateQuestBlocks(elements, kinds, texts, questContinuations, questStarts);

  // =========================================
  // PHASE 3 — GROUP BOUNDARIES
  // =========================================

  const joins = (before: Element | null, after: Element | null): boolean => {
    if (
      !before ||
      !after ||
      !kinds.has(before) ||
      kinds.get(before) !== kinds.get(after)
    ) {
      return false;
    }

    const kind = kinds.get(before);

    // Only paragraphs associated with the same quest form one window.
    if (kind === 'quest') {
      return !questStarts.has(after) && questContinuations.has(after);
    }

    // Consecutive SYSTEM notifications share a window.
    if (kind !== 'item') {
      return true;
    }

    // Continuations explicitly associated in phase 2
    // always belong to the same item.
    if (itemContinuations.has(after)) {
      return true;
    }

    const previous = itemLines(texts.get(before)!);
    const next = itemLines(texts.get(after)!);

    // A new rarity header starts a separate item.
    if (next.some((line) => rarityHeader(line.text, profile))) {
      return false;
    }

    // Preserve existing labeled item-name grouping.
    if (next.some((line) => itemNameLine(line.text))) {
      return (
        previous.length === 1 &&
        !!rarityHeader(previous[0].text, profile) &&
        !rarityHeader(previous[0].text, profile)![2]
      );
    }

    return true;
  };

  // =========================================
  // PHASE 4 — DOM DECORATION
  // =========================================

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

    if (kind === 'system') {
      hideBrackets(element);
    } else {
      restoreBrackets(element);
    }
  }
}

/**
 * Restores original text and removes RPG decorations.
 */
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

/**
 * Preserves the reader's scroll position when formatting
 * changes paragraph dimensions.
 */
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

  if (!element) {
    return () => {};
  }

  const top = element.getBoundingClientRect().top;

  return () => {
    if (!element.isConnected) {
      return;
    }

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
