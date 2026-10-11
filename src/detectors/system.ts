import {
  DEFAULT_RARITY_PROFILE,
  type RarityProfile,
} from '../core/rarity-config';

import { rarityField } from './item-rarity';
import { detectItem, itemContinuation } from './items';
import { detectQuest } from './quests';
import { detectSkill } from './skills';
import { detectStatus } from './status';

export type WindowKind = 'system' | 'status' | 'item' | 'quest' | 'skill';

/**
 * Identifies a standalone bracketed notification.
 *
 * Examples:
 * [You have leveled up!]
 * [The quest has failed!]
 * [The appreciation of the old sheath has greatly reduced.]
 *
 * Detection is structural, not dependent on specific words.
 */
export function isSystemNotification(text: string): boolean {
  const raw = text.trim();

  if (
    raw.length < 3 ||
    raw.length > 2000 ||
    !raw.startsWith('[') ||
    !raw.endsWith(']')
  ) {
    return false;
  }

  const content = raw.slice(1, -1).trim();

  if (!content) return false;

  // Avoid treating nested bracket structures as notifications.
  if (content.includes('[') || content.includes(']')) {
    return false;
  }

  return true;
}

export function detectWindow(
  text: string,
  previous: WindowKind | null = null,
  profile: RarityProfile = DEFAULT_RARITY_PROFILE,
): WindowKind | null {
  const raw = text.trim();

  if (!raw || raw.length > 2000) return null;

  const bracketed = isSystemNotification(raw);

  const lines = raw
    .replace(/^\[|\]$/g, '')
    .split(/\n+/)
    .map((line) =>
      line
        .trim()
        .replace(/^\[|\]$/g, '')
        .trim(),
    )
    .filter(Boolean);

  // Preserve item continuation behavior.
  if (
    previous === 'item' &&
    lines.every((line) => itemContinuation.test(line))
  ) {
    return 'item';
  }

  // Preserve skill continuation behavior.
  if (
    previous === 'skill' &&
    lines.every((line) => rarityField(line, profile))
  ) {
    return 'skill';
  }

  // Specialized detectors take priority.
  if (detectStatus(lines)) return 'status';

  if (detectQuest(lines)) return 'quest';

  if (detectSkill(lines)) return 'skill';

  if (detectItem(lines, profile)) return 'item';

  // Structural fallback:
  // any standalone bracketed paragraph is a system notification.
  if (bracketed) return 'system';

  return null;
}
