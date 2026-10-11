import type { Config } from '../core/config';
import { BLOCKS, EXCLUDED, neighbor } from '../core/dom-structure';
import { readText, wrapTextRange } from '../core/text-ranges';
import { detectContextualRarity, detectItemRarity, type ItemRarityMatch, type TextHighlight } from '../detectors/item-rarity';

interface Highlight extends TextHighlight { rarity: string }
interface Plan { text: string; highlights: Highlight[]; match?: ItemRarityMatch }
interface Snapshot { signature: string; marks: HTMLElement[] }
const managedStyles = new WeakMap<HTMLElement, Map<string, { value: string; priority: string }>>();

function setStyle(element: HTMLElement, name: string, value: string): void {
  let original = managedStyles.get(element);
  if (!original) { original = new Map(); managedStyles.set(element, original); }
  if (!original.has(name)) original.set(name, { value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) });
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
}
function restoreStyles(element: HTMLElement): void {
  managedStyles.get(element)?.forEach((saved, name) => {
    if (saved.value) element.style.setProperty(name, saved.value, saved.priority);
    else element.style.removeProperty(name);
  });
  managedStyles.delete(element);
  if (element.hasAttribute('style') && !element.style.length) element.removeAttribute('style');
}
function clearWindow(element: HTMLElement): void {
  if (!element.hasAttribute('data-rpg-item-rarity')) return;
  element.removeAttribute('data-rpg-item-rarity');
  element.removeAttribute('data-rpg-rarity-source');
  element.removeAttribute('data-rpg-rarity-confidence');
  restoreStyles(element);
}
function unwrap(element: Element): void {
  element.querySelectorAll('.rpg-rarity').forEach(mark => mark.replaceWith(...Array.from(mark.childNodes)));
}
export function clearRarity(root: HTMLElement): void {
  unwrap(root);
  root.querySelectorAll<HTMLElement>('[data-rpg-item-rarity]').forEach(clearWindow);
  restoreStyles(root);
}

/** Adds only text spans and window metadata, preserving the existing grouping/markup. */
export class RarityFormatter {
  private snapshots = new WeakMap<HTMLElement, Snapshot>();

  apply(root: HTMLElement, config: Config): void {
    if (!config.rarity.enabled) { clearRarity(root); return; }
    const profile = config.rarity.profiles[config.rarity.profile];
    const palette = { ...profile.colors, ...profile.themeColors[config.theme] };
    for (const [rarity, color] of Object.entries(palette)) setStyle(root, '--rpg-rarity-' + rarity, color);
    const plans = new Map<HTMLElement, Plan>();
    for (const element of Array.from(root.querySelectorAll<HTMLElement>(BLOCKS))) {
      if (element.querySelector(BLOCKS)) { clearWindow(element); continue; }
      if (element.closest(EXCLUDED) || element.querySelector(EXCLUDED)) {
        unwrap(element); clearWindow(element); continue;
      }
      plans.set(element, { text: readText(element).text, highlights: [] });
    }

    const groups: HTMLElement[][] = [];
    for (const element of plans.keys()) {
      if (element.dataset.rpgKind !== 'item') continue;
      const group = groups[groups.length - 1];
      if (group && ['middle', 'end'].includes(element.dataset.rpgGroup || '') && neighbor(element, 'previousSibling') === group[group.length - 1]) group.push(element);
      else groups.push([element]);
    }
    for (const group of groups) {
      const match = detectItemRarity(group.map(element => plans.get(element)!.text).join('\n'), profile);
      if (!match) continue;
      let offset = 0;
      for (const element of group) {
        const plan = plans.get(element)!;
        plan.match = match;
        for (const highlight of match.highlights) {
          const start = Math.max(0, highlight.start - offset);
          const end = Math.min(plan.text.length, highlight.end - offset);
          if (end > start) plan.highlights.push({ start, end, part: highlight.part, rarity: match.rarity });
        }
        offset += plan.text.length + 1;
      }
    }

    for (const [element, plan] of plans) {
      if (element.dataset.rpgKind !== 'item' && element.dataset.rpgKind !== 'skill') {
        for (const match of detectContextualRarity(plan.text, profile)) {
          plan.highlights.push(...match.highlights.map(highlight => ({ ...highlight, rarity: match.rarity })));
        }
      }
      if (plan.match) {
        const attrs = { 'data-rpg-item-rarity': plan.match.rarity, 'data-rpg-rarity-source': plan.match.source,
          'data-rpg-rarity-confidence': String(plan.match.confidence) };
        for (const [name, value] of Object.entries(attrs)) if (element.getAttribute(name) !== value) element.setAttribute(name, value);
        setStyle(element, '--rpg-item-rarity-color', `var(--rpg-rarity-${plan.match.rarity}, var(--rpg-accent))`);
      } else clearWindow(element);
      const signature = JSON.stringify([plan.text, plan.highlights]);
      const snapshot = this.snapshots.get(element);
      if (snapshot?.signature === signature && snapshot.marks.every(mark => element.contains(mark) && mark.classList.contains('rpg-rarity'))) continue;
      unwrap(element);
      const run = readText(element);
      // A changed rarity may revisit an already highlighted price within an item name.
      // Monetary spans keep their own color, semantics and event target.
      run.segments = run.segments.filter(segment => !segment.node.parentElement?.closest('.rpg-money'));
      const marks: HTMLElement[] = [];
      for (const highlight of [...plan.highlights].sort((a, b) => b.start - a.start)) {
        marks.push(...wrapTextRange(run, highlight.start, highlight.end, () => {
          const span = root.ownerDocument.createElement('span');
          span.className = 'rpg-rarity';
          span.dataset.rpgRarity = highlight.rarity;
          span.dataset.rpgRarityPart = highlight.part;
          span.style.setProperty('--rpg-rarity-color', `var(--rpg-rarity-${highlight.rarity}, var(--rpg-accent))`);
          return span;
        }));
      }
      this.snapshots.set(element, { signature, marks });
    }
  }
}
