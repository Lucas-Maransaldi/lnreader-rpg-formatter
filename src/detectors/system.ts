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

const notification =
  /^(?:you (?:have )?(?:leveled up|gained \d|received |obtained |lost \d)|your (?:strength|agility|intelligence|dexterity|stamina|hp|mp|level|experience|attack|defense) (?:has |have )?(?:increased|decreased)|achievement unlocked|level up)\b[^\n]{0,180}$/i;

/**
 * Recognizes standalone bracketed system notifications.
 *
 * Overgeared frequently uses complete paragraphs such as:
 * [You have left the event map!]
 * [The quest has failed!]
 *
 * A paragraph must consist entirely of the notification.
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

  if (
    previous === 'item' &&
    lines.every((line) => itemContinuation.test(line))
  ) {
    return 'item';
  }

  if (
    previous === 'skill' &&
    lines.every((line) => rarityField(line, profile))
  ) {
    return 'skill';
  }

  if (detectStatus(lines)) return 'status';
  if (detectQuest(lines)) return 'quest';
  if (detectSkill(lines)) return 'skill';
  if (detectItem(lines, profile)) return 'item';

  if (bracketed && lines.every((line) => notification.test(line))) {
    return 'system';
  }

  // Fallback for standalone bracketed Overgeared notifications.
  if (bracketed) return 'system';

  return null;
}
