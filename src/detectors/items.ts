import {
  DEFAULT_RARITY_PROFILE,
  type RarityProfile,
} from '../core/rarity-config';
import { isNonItemIdentity, rarityField, rarityHeader } from './item-rarity';

const itemField =
  /^(?:item(?: name| effects?| requirements?)?|weapon(?:s| type)?|armor(?: type)?|accessor(?:y|ies)|rarity|grade|durability|attack(?: speed| power)?|defense|weight|requirements?|effects?|type|rating|price|value)\s*:\s*\S.{0,180}$/i;
const itemAnchor =
  /^(?:(?:item(?: name| effects?| requirements?)?|weapon(?:s| type)?|armor(?: type)?|accessor(?:y|ies)|rarity|durability)\s*:|(?:type|rating)\s*:\s*(?:weapon|armor|accessory|sword|bow|staff|legendary|mythic|rare|epic|unique|normal)\b|(?:legendary|mythic) items?(?:\s*:|$))/i;
export function detectItem(
  lines: string[],
  profile: RarityProfile = DEFAULT_RARITY_PROFILE,
): boolean {
  if (isNonItemIdentity(lines.join('\n'))) return false;
  return (
    lines.some(
      (line) =>
        itemAnchor.test(line) ||
        rarityField(line, profile) ||
        rarityHeader(line, profile),
    ) &&
    lines.every(
      (line) =>
        itemField.test(line) ||
        rarityField(line, profile) ||
        rarityHeader(line, profile),
    )
  );
}
export const itemContinuation =
  /^(?:effects?|requirements?|weight|attack(?: power| speed)?|defense|durability|price|value)\s*:\s*\S.{0,180}$/i;
/**
 * Detects an unlabeled item name immediately preceding
 * an explicit rarity field.
 *
 * Example:
 * [Swordsmanship Textbook: 200,000 Army Swordsmanship]
 * [Rating: Legendary]
 */
export function isUnlabeledItemName(text: string): boolean {
  const raw = text.trim();

  if (!raw.startsWith('[') || !raw.endsWith(']')) {
    return false;
  }

  const content = raw.slice(1, -1).trim();

  if (!content || content.length > 160) {
    return false;
  }

  if (content.includes('\n')) {
    return false;
  }

  // Exclude ordinary system notifications.
  if (
    /^(?:you|your|the|a|an|in order|at present|cannot|can't|unable|congratulations)\b/i.test(
      content,
    )
  ) {
    return false;
  }

  // Exclude acquisition and progression messages.
  if (
    /\b(?:has been acquired|have acquired|obtained|received|learned|level(?:ed)? up|is sealed|was acquired)\b/i.test(
      content,
    )
  ) {
    return false;
  }

  // Item names commonly contain a category or descriptive title.
  return /\b(?:sword|textbook|armor|helmet|shield|ring|necklace|staff|bow|dagger|blade|boots|gloves|potion|scroll|book|weapon|accessory)\b/i.test(
    content,
  );
}
/**
 * Identifies explicit item requirements, including the
 * "Learning Conditions" field used by Overgeared.
 */
export function isItemRequirement(text: string): boolean {
  return /^(?:learning conditions?|usage conditions?|equip(?:ment)? requirements?|requirements?|conditions to (?:use|equip|learn))\s*:\s*\S/i.test(
    text.trim(),
  );
}

/**
 * Evaluates a possible free-text item description.
 *
 * This is intentionally conservative. A description is
 * accepted only when the caller has already established
 * an item context.
 */
export function isItemDescription(text: string): boolean {
  const raw = text.trim();

  if (!raw || raw.length > 600) return false;

  // System messages are not item descriptions.
  if (raw.startsWith('[') || raw.endsWith(']')) return false;

  // Dialogue, thoughts and scene separators end the item.
  if (/^(?:["'“‘]|[*]{3,}|[-]{3,})/.test(raw)) return false;

  // Explicit fields should be handled separately.
  if (/^[\w\s-]{2,40}\s*:/.test(raw)) return false;

  // Accept descriptive sentences in an established item block.
  return /[.!?]$/.test(raw);
}
