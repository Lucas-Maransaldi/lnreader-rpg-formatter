import { DEFAULT_RARITY_PROFILE, type RarityProfile } from '../core/rarity-config';
import { isNonItemIdentity, rarityField, rarityHeader } from './item-rarity';

const itemField = /^(?:item(?: name| effects?| requirements?)?|weapon(?:s| type)?|armor(?: type)?|accessor(?:y|ies)|rarity|grade|durability|attack(?: speed| power)?|defense|weight|requirements?|effects?|type|rating|price|value)\s*:\s*\S.{0,180}$/i;
const itemAnchor = /^(?:(?:item(?: name| effects?| requirements?)?|weapon(?:s| type)?|armor(?: type)?|accessor(?:y|ies)|rarity|durability)\s*:|(?:type|rating)\s*:\s*(?:weapon|armor|accessory|sword|bow|staff|legendary|mythic|rare|epic|unique|normal)\b|(?:legendary|mythic) items?(?:\s*:|$))/i;
export function detectItem(lines: string[], profile: RarityProfile = DEFAULT_RARITY_PROFILE): boolean {
  if (isNonItemIdentity(lines.join('\n'))) return false;
  return lines.some(line => itemAnchor.test(line) || rarityField(line, profile) || rarityHeader(line, profile)) && lines.every(line =>
    itemField.test(line) || rarityField(line, profile) || rarityHeader(line, profile));
}
export const itemContinuation = /^(?:effects?|requirements?|weight|attack(?: power| speed)?|defense|durability|price|value)\s*:\s*\S.{0,180}$/i;
