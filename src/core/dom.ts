import { detectWindow, type WindowKind } from '../detectors/system';
import { DEFAULT_RARITY_PROFILE, type RarityProfile } from './rarity-config';
import { isNonItemIdentity, itemLines, itemNameLine, rarityField, rarityHeader } from '../detectors/item-rarity';
import { readText } from './text-ranges';
import { clearRarity } from '../formatters/rarity-formatter';
import { BLOCKS, EXCLUDED, neighbor } from './dom-structure';


/** BR has no textContent, but is a semantic boundary for detection. */
export function blockText(element: Element): string {
  return readText(element).text;
}

export function decorateWindows(root: HTMLElement, profile: RarityProfile = DEFAULT_RARITY_PROFILE): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(BLOCKS));
  const kinds = new Map<Element, WindowKind>();
  const texts = new Map<Element, string>();
  for (const element of elements) {
    if (element.closest(EXCLUDED) || element.querySelector(BLOCKS) || element.querySelector(EXCLUDED)) continue;
    const previous = neighbor(element, 'previousSibling');
    const text = blockText(element);
    texts.set(element, text);
    if (previous && isNonItemIdentity(blockText(previous)) && itemLines(text).every(line => rarityField(line.text, profile))) continue;
    const kind = detectWindow(text, previous ? kinds.get(previous) || null : null, profile);
    if (kind) kinds.set(element, kind);
  }
  const joins = (before: Element | null, after: Element | null): boolean => {
    if (!before || !after || !kinds.has(before) || kinds.get(before) !== kinds.get(after)) return false;
    if (kinds.get(before) !== 'item') return true;
    const previous = itemLines(texts.get(before)!);
    const next = itemLines(texts.get(after)!);
    // An explicit new item starts a new window. Header + named item remain together.
    if (next.some(line => rarityHeader(line.text, profile))) return false;
    if (next.some(line => itemNameLine(line.text))) {
      return previous.length === 1 && !!rarityHeader(previous[0].text, profile) && !rarityHeader(previous[0].text, profile)![2];
    }
    return true;
  };
  for (const element of elements) {
    const kind = kinds.get(element);
    if (!kind) {
      if (element.classList.contains('rpg-window')) {
        element.classList.remove('rpg-window');
        if (!element.className) element.removeAttribute('class');
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
    element.dataset.rpgGroup = joinedBefore ? (joinedAfter ? 'middle' : 'end') : (joinedAfter ? 'start' : 'single');
  }
}

export function clearFormatting(root: HTMLElement): void {
  clearRarity(root);
  root.querySelectorAll<HTMLElement>('.rpg-window').forEach(element => {
    element.classList.remove('rpg-window');
    if (!element.className) element.removeAttribute('class');
    element.removeAttribute('data-rpg-kind');
    element.removeAttribute('data-rpg-group');
  });
  root.querySelectorAll('.rpg-money').forEach(element => element.replaceWith(...Array.from(element.childNodes)));
  root.removeAttribute('data-rpg-theme');
  root.removeAttribute('data-rpg-tone');
}

/** Capture an existing visible paragraph, not a percentage of chapter height. */
export function readingAnchor(root: HTMLElement): () => void {
  const win = root.ownerDocument.defaultView!;
  if (root.ownerDocument.body.classList.contains('page-reader') || win.scrollY === 0) return () => {};
  const element = Array.from(root.querySelectorAll('p,li,blockquote')).find(el => {
    const box = el.getBoundingClientRect();
    return box.bottom > 0 && box.top < win.innerHeight;
  });
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
      if (old) style.setProperty('scroll-behavior', old, priority);
      else style.removeProperty('scroll-behavior');
    }
  };
}
