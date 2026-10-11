import { DEFAULT_RARITY_PROFILE, type RarityProfile } from '../core/rarity-config';

export interface TextHighlight { start: number; end: number; part: 'rarity' | 'header' | 'name' }
export interface ItemRarityMatch {
  rarity: string;
  itemName?: string;
  /** Rule strength, not a statistical probability: exact field 1, header .95, context .8. */
  confidence: number;
  source: 'explicit-field' | 'header' | 'context';
  highlights: TextHighlight[];
}
export interface ItemLine { text: string; start: number }
export function itemLines(text: string): ItemLine[] {
  const lines: ItemLine[] = [];
  let offset = 0;
  for (const raw of text.split('\n')) {
    const content = raw.replace(/^[\s\[]+|[\s\]]+$/g, '');
    if (content) lines.push({ text: content, start: offset + raw.indexOf(content) });
    offset += raw.length + 1;
  }
  return lines;
}
function escape(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function alternatives(words: string[]): string { return words.length ? words.sort((a, b) => b.length - a.length).map(escape).join('|') : '(?!)'; }
interface Patterns { field: RegExp; fieldLabel: RegExp; header: RegExp; context: string }
const patternCache = new WeakMap<RarityProfile, Patterns>();
function patterns(profile: RarityProfile): Patterns {
  let result = patternCache.get(profile);
  if (!result) {
    const aliases = alternatives(Object.keys(profile.aliases));
    const fields = alternatives([...profile.fields]);
    const nouns = alternatives([...profile.itemNouns]);
    result = {
      field: new RegExp('^(?:' + fields + ')\\s*:\\s*(' + aliases + ')$', 'i'),
      fieldLabel: new RegExp('^(?:' + fields + ')\\s*:', 'i'),
      header: new RegExp('^(' + aliases + ')\\s+(?:' + nouns + ')(?:\\s*:\\s*(\\S.{0,140}))?$', 'i'),
      context: '\\b(' + aliases + ')\\s+(' + nouns + ')\\b',
    };
    patternCache.set(profile, result);
  }
  return result;
}
export function isNonItemIdentity(text: string): boolean {
  return itemLines(text).some(line => /^(?:(?:skill(?: name| type| level)?|passive skills?|active skills?|class(?: name)?|title|profession|job)\s*:|skill (?:acquired|learned|level(?:ed)? up)\b)/i.test(line.text));
}
export function itemNameLine(line: string): RegExpMatchArray | null {
  return line.match(/^(?:item(?: name)?|weapon(?: name)?|armor(?: name)?|accessory(?: name)?)\s*:\s*(\S.{0,140})$/i);
}
export function rarityField(line: string, profile = DEFAULT_RARITY_PROFILE): RegExpMatchArray | null {
  return line.match(patterns(profile).field);
}
export function rarityHeader(line: string, profile = DEFAULT_RARITY_PROFILE): RegExpMatchArray | null {
  return line.match(patterns(profile).header);
}

/** Only structured fields/headers can classify a whole equipment window. */
export function detectItemRarity(text: string, profile = DEFAULT_RARITY_PROFILE): ItemRarityMatch | null {
  if (!text.trim() || text.length > 6000 || isNonItemIdentity(text)) return null;
  const fields: { rarity: string; highlight: TextHighlight }[] = [];
  const headers: { rarity: string; highlight: TextHighlight; name?: string; nameRange?: TextHighlight }[] = [];
  const names: { name: string; highlight: TextHighlight }[] = [];
  for (const line of itemLines(text)) {
    const field = rarityField(line.text, profile);
    if (!field && patterns(profile).fieldLabel.test(line.text)) return null;
    const header = rarityHeader(line.text, profile);
    const name = itemNameLine(line.text);
    if (field) {
      const start = line.start + line.text.lastIndexOf(field[1]);
      fields.push({ rarity: profile.aliases[field[1].toLowerCase()], highlight: { start, end: start + field[1].length, part: 'rarity' } });
    }
    if (header) {
      const headerEnd = header[2] ? line.text.indexOf(':') : line.text.length;
      const nameStart = header[2] ? line.start + line.text.lastIndexOf(header[2]) : 0;
      headers.push({ rarity: profile.aliases[header[1].toLowerCase()],
        highlight: { start: line.start, end: line.start + headerEnd, part: 'header' }, name: header[2],
        nameRange: header[2] ? { start: nameStart, end: nameStart + header[2].length, part: 'name' } : undefined });
    }
    if (name) {
      const start = line.start + line.text.lastIndexOf(name[1]);
      names.push({ name: name[1], highlight: { start, end: start + name[1].length, part: 'name' } });
    }
  }
  const candidates = fields.length ? fields : headers;
  const rarities = new Set(candidates.map(match => match.rarity));
  // Conflicting fields never mean "pick the highest". Two names are two items.
  if (rarities.size !== 1 || names.length + headers.filter(header => header.name).length > 1) return null;
  const rarity = candidates[0].rarity;
  const matchingHeaders = headers.filter(header => header.rarity === rarity);
  const name = names[0]?.name || matchingHeaders.find(header => header.name)?.name;
  return {
    rarity, itemName: name, confidence: fields.length ? 1 : .95, source: fields.length ? 'explicit-field' : 'header',
    highlights: [...fields.map(field => field.highlight), ...matchingHeaders.reduce<TextHighlight[]>((all, header) => all.concat(header.nameRange ? [header.highlight, header.nameRange] : [header.highlight]), []), ...names.map(name => name.highlight)],
  };
}

/** Narrative evidence is limited to an adjacent, configured equipment noun. */
export function detectContextualRarity(text: string, profile = DEFAULT_RARITY_PROFILE): ItemRarityMatch[] {
  if (isNonItemIdentity(text)) return [];
  const regex = new RegExp(patterns(profile).context, 'gi');
  const results: ItemRarityMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 24), match.index);
    const after = text.slice(regex.lastIndex);
    // Reject negation, quoted labels, and noun compounds describing people/skills.
    if (/(?:\b(?:not|no|non|never)|["'“‘])\s*$/i.test(before) ||
        /^[\s-]+(?:skill|master|mastery|warrior|class|title|technique|style|art|saint|king|knight|smith|craftsman|fighter)\b/i.test(after) ||
        /^['’]s\b/i.test(after)) continue;
    results.push({ rarity: profile.aliases[match[1].toLowerCase()], confidence: .8, source: 'context',
      highlights: [{ start: match.index, end: match.index + match[1].length, part: 'rarity' }] });
  }
  return results;
}
