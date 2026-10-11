import { detectStatus } from './status';
import { detectItem, itemContinuation } from './items';
import { detectQuest } from './quests';
import { detectSkill } from './skills';
import { DEFAULT_RARITY_PROFILE, type RarityProfile } from '../core/rarity-config';
import { rarityField } from './item-rarity';

export type WindowKind = 'system' | 'status' | 'item' | 'quest' | 'skill';
const notification = /^(?:you (?:have )?(?:leveled up|gained \d|received |obtained |lost \d)|your (?:strength|agility|intelligence|dexterity|stamina|hp|mp|level|experience|attack|defense) (?:has |have )?(?:increased|decreased)|achievement unlocked|level up)\b[^\n]{0,180}$/i;

export function detectWindow(text: string, previous: WindowKind | null = null, profile: RarityProfile = DEFAULT_RARITY_PROFILE): WindowKind | null {
  const raw = text.trim();
  if (!raw || raw.length > 2000) return null;
  const bracketed = raw.startsWith('[') && raw.endsWith(']');
  const lines = raw.replace(/^\[|\]$/g, '').split(/\n+/)
    .map(line => line.trim().replace(/^\[|\]$/g, '').trim()).filter(Boolean);
  if (previous === 'item' && lines.every(line => itemContinuation.test(line))) return 'item';
  if (previous === 'skill' && lines.every(line => rarityField(line, profile))) return 'skill';
  if (detectStatus(lines)) return 'status';
  if (detectQuest(lines)) return 'quest';
  if (detectSkill(lines)) return 'skill';
  if (detectItem(lines, profile)) return 'item';
  if (bracketed && lines.every(line => notification.test(line))) return 'system';
  return null;
}
