import type { RPGTheme } from './config';

export interface RarityProfile {
  /** Exact, case-insensitive aliases. No ordering or rarity hierarchy is implied. */
  aliases: Record<string, string>;
  fields: string[];
  itemNouns: string[];
  colors: Record<string, string>;
  themeColors: Partial<Record<RPGTheme, Record<string, string>>>;
}
export interface RarityConfig {
  enabled: boolean;
  profile: string;
  profiles: Record<string, RarityProfile>;
}
export interface RarityConfigInput {
  enabled?: boolean;
  profile?: string;
  profiles?: Record<string, Partial<RarityProfile>>;
}

export const DEFAULT_RARITY_PROFILE: RarityProfile = {
  aliases: { common: 'common', uncommon: 'uncommon', rare: 'rare', epic: 'epic', unique: 'unique', legendary: 'legendary', mythic: 'mythic' },
  fields: ['Item Rating', 'Rating', 'Rarity', 'Grade'],
  itemNouns: ['item', 'items', 'equipment', 'weapon', 'weapons', 'armor', 'armour', 'accessory', 'accessories',
    'sword', 'swords', 'dagger', 'daggers', 'blade', 'blades', 'shield', 'shields', 'bow', 'bows',
    'staff', 'staves', 'spear', 'spears', 'helmet', 'helmets', 'ring', 'rings', 'necklace', 'necklaces', 'boots', 'gloves'],
  // Empty overrides let the CSS variables supply the default palette.
  colors: {},
  themeColors: {},
};
export const DEFAULT_RARITY_CONFIG: RarityConfig = {
  enabled: true, profile: 'default', profiles: { default: DEFAULT_RARITY_PROFILE },
};

function strings(input: unknown, fallback: string[]): string[] {
  return Array.isArray(input) ? input.filter((v): v is string => typeof v === 'string' && /^[a-z][a-z -]{0,59}$/i.test(v)).slice(0, 100) : [...fallback];
}
function colors(input: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (input && typeof input === 'object') for (const [key, value] of Object.entries(input)) {
    if (/^[a-z][a-z0-9-]{0,31}$/.test(key) && typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) result[key] = value;
  }
  return result;
}
function profile(input: Partial<RarityProfile>, base: RarityProfile): RarityProfile {
  const aliases: Record<string, string> = {};
  for (const [term, rarity] of Object.entries(input.aliases ?? base.aliases)) {
    if (/^[a-z][a-z -]{0,59}$/i.test(term) && typeof rarity === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(rarity)) aliases[term.toLowerCase()] = rarity;
  }
  const themeColors: RarityProfile['themeColors'] = {};
  for (const theme of ['classic', 'medieval', 'minimal'] as const) {
    themeColors[theme] = { ...colors(base.themeColors[theme]), ...colors(input.themeColors?.[theme]) };
  }
  return { aliases, fields: strings(input.fields, base.fields), itemNouns: strings(input.itemNouns, base.itemNouns),
    colors: { ...colors(base.colors), ...colors(input.colors) }, themeColors };
}
export function resolveRarityConfig(input: RarityConfigInput = {}, base = DEFAULT_RARITY_CONFIG): RarityConfig {
  const profiles: Record<string, RarityProfile> = Object.create(null);
  for (const [name, value] of Object.entries(base.profiles)) profiles[name] = profile({}, value);
  for (const [name, value] of Object.entries(input.profiles || {})) {
    if (/^[a-z][a-z0-9-]{0,39}$/i.test(name) && value && typeof value === 'object') profiles[name] = profile(value, profiles[name] || DEFAULT_RARITY_PROFILE);
  }
  const selected = typeof input.profile === 'string' && Object.prototype.hasOwnProperty.call(profiles, input.profile) ? input.profile : base.profile;
  return { enabled: typeof input.enabled === 'boolean' ? input.enabled : base.enabled, profile: selected, profiles };
}
