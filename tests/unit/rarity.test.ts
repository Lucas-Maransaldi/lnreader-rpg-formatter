import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectContextualRarity, detectItemRarity } from '../../src/detectors/item-rarity';
import { DEFAULT_RARITY_PROFILE, resolveRarityConfig } from '../../src/core/rarity-config';
import { resolveConfig } from '../../src/core/config';
import { bootstrap } from '../../src/core/bootstrap';

const rarities = ['common', 'uncommon', 'rare', 'epic', 'unique', 'legendary', 'mythic'];
describe('equipment rarity evidence', () => {
  it.each(rarities)('recognizes %s in explicit fields and equipment headers', rarity => {
    for (const field of ['Rating', 'Rarity', 'Grade', 'Item Rating']) {
      expect(detectItemRarity(`[${field}: ${rarity.toUpperCase()}]`)).toMatchObject({ rarity, source: 'explicit-field', confidence: 1 });
    }
    expect(detectItemRarity(`[${rarity} Item]`)).toMatchObject({ rarity, source: 'header', confidence: .95 });
    expect(detectItemRarity(`[${rarity} Equipment]`)?.rarity).toBe(rarity);
  });
  it('returns exact original ranges, a safe name, and explicit-field precedence', () => {
    const text = ' [Epic Item]\n Item Name: Failure\n[Item Rating: Legendary]\nAttack Power: 1,000\nDurability: 500/500';
    const result = detectItemRarity(text)!;
    expect(result).toMatchObject({ rarity: 'legendary', itemName: 'Failure', source: 'explicit-field' });
    expect(result.highlights.map(range => text.slice(range.start, range.end))).toEqual(['Legendary', 'Failure']);
  });
  it('recognizes a named header without rewriting it', () => {
    const text = '[Mythic Equipment: Dawn Guard]';
    const result = detectItemRarity(text)!;
    expect(result.itemName).toBe('Dawn Guard');
    expect(result.highlights.map(range => text.slice(range.start, range.end))).toEqual(['Mythic Equipment', 'Dawn Guard']);
  });
  it.each([
    'He was a legendary warrior.', 'Skill Name: Legendary Sword\nRating: Legendary',
    'Class: Blacksmith\nGrade: Unique', 'Title: Legendary Warrior\nRarity: Rare',
    'Rating: Legendary or Mythic', 'Rating: Legendary\nGrade: Epic',
    '[Legendary Item]\n[Mythic Equipment]', 'Item Name: One\nRating: Rare\nItem Name: Two',
    'Rating: Unknown', 'Rarity: Epic was his guess.', '[Legendary Item]\nRating: Unknown',
  ])('abstains on ambiguous or non-equipment text: %s', text => expect(detectItemRarity(text)).toBeNull());
  it('highlights only rarity terms explicitly attached to item nouns', () => {
    const text = 'Grid obtained a legendary sword and an epic dagger. He wore rare armor.';
    const results = detectContextualRarity(text);
    expect(results.map(r => r.rarity)).toEqual(['legendary', 'epic', 'rare']);
    expect(results.map(r => text.slice(r.highlights[0].start, r.highlights[0].end))).toEqual(['legendary', 'epic', 'rare']);
    expect(results.every(r => r.source === 'context' && r.confidence === .8)).toBe(true);
  });
  it.each([
    'He was a legendary warrior.', 'The epic battle ended.', 'It was a rare opportunity.', 'She had unique strength.',
    'The common people gathered.', 'A mythic class was unlocked.', 'Skill Acquired: Legendary Sword',
    'He was a legendary sword master.', 'The legendary sword technique was forbidden.',
    "A legendary sword's owner arrived.", 'This was not legendary equipment.', 'He read "Legendary Sword" aloud.',
  ])('rejects generic, named-skill or ambiguous narrative: %s', text => expect(detectContextualRarity(text)).toEqual([]));
  it('supports profile-specific aliases, fields, nouns, palettes and new identifiers', () => {
    const config = resolveRarityConfig({ profile: 'custom', profiles: { custom: {
      aliases: { Relic: 'relic', Ordinary: 'common' }, fields: ['Quality'], itemNouns: ['wand'],
      colors: { relic: '#12ABCD' }, themeColors: { minimal: { relic: '#135789' } },
    } } });
    const profile = config.profiles.custom;
    expect(detectItemRarity('Quality: Relic', profile)?.rarity).toBe('relic');
    expect(detectItemRarity('Rating: Relic', profile)).toBeNull();
    expect(detectItemRarity('Quality: Legendary', profile)).toBeNull();
    expect(detectContextualRarity('A relic wand.', profile)[0]?.rarity).toBe('relic');
    expect(detectContextualRarity('A relic sword.', profile)).toEqual([]);
    expect(profile.colors.relic).toBe('#12ABCD'); expect(profile.themeColors.minimal?.relic).toBe('#135789');
    expect(DEFAULT_RARITY_PROFILE.aliases).not.toHaveProperty('relic');
  });
  it('isolates resolved configuration and rejects invalid CSS values', () => {
    const config = resolveConfig({ rarity: { profiles: { default: { colors: { legendary: 'url(https://invalid)' } } } } });
    expect(config.rarity.profiles.default.colors).toEqual({});
    const copy = resolveConfig({}, config);
    copy.rarity.profiles.default.aliases.legendary = 'other';
    copy.rarity.profiles.default.fields.push('Quality');
    expect(config.rarity.profiles.default.aliases.legendary).toBe('legendary');
    expect(config.rarity.profiles.default.fields).not.toContain('Quality');
    expect(resolveRarityConfig({ profile: 'missing' }).profile).toBe('default');
  });
});

const tick = () => vi.advanceTimersByTimeAsync(100);
async function start(html: string) {
  document.body.innerHTML = '<div id="LNReader-chapter">' + html + '</div>';
  bootstrap(window); document.dispatchEvent(new Event('DOMContentLoaded')); await tick();
  return document.getElementById('LNReader-chapter')!;
}
beforeEach(() => { vi.useFakeTimers(); window.getSelection()?.removeAllRanges(); });
afterEach(() => {
  window.getSelection()?.removeAllRanges(); window.LNReaderRPG?.destroy(); delete window.LNReaderRPGConfig;
  document.body.innerHTML = ''; vi.useRealTimers();
});

describe('rarity formatting alongside existing systems', () => {
  it.each(rarities)('formats the %s window, explicit value and item name', async rarity => {
    const root = await start(`<p>Item Name: Failure<br>Rating: ${rarity}<br>Attack Power: 1,000<br>Durability: 500/500</p>`);
    expect(root.querySelector('p')!.dataset.rpgItemRarity).toBe(rarity);
    expect(root.querySelector('[data-rpg-rarity-part="name"]')!.textContent).toBe('Failure');
    expect(root.querySelectorAll('.rpg-rarity')).toHaveLength(2);
  });
  it('shares a rarity across one grouped item, stops at the next item, and leaves status intact', async () => {
    const root = await start('<p>[Legendary Item]</p><p>Item Name: Failure</p><p>Rating: Legendary</p><p>Attack Power: 1,000</p><p>Durability: 500/500</p><p>Item Name: Shadow Dagger</p><p>Grade: Epic</p><p>Attack: 450</p><p>A quiet moment.</p><p>Strength: 20</p>');
    expect(root.querySelectorAll('[data-rpg-item-rarity="legendary"]')).toHaveLength(5);
    expect(root.querySelectorAll('[data-rpg-item-rarity="epic"]')).toHaveLength(3);
    const p = root.querySelectorAll('p');
    expect(p[4].dataset.rpgGroup).toBe('end'); expect(p[5].dataset.rpgGroup).toBe('start');
    expect(p[9].dataset.rpgKind).toBe('status'); expect(p[9].dataset.rpgItemRarity).toBeUndefined();
  });
  it('does not merge two standalone item headers or propagate past narrative', async () => {
    const root = await start('<p>[Legendary Item]</p><p>[Epic Item]</p><p>A break.</p><p>Item Name: Unknown</p>');
    expect(root.querySelectorAll('[data-rpg-group="single"]')).toHaveLength(3);
    expect(root.querySelector('p:last-child')!.hasAttribute('data-rpg-item-rarity')).toBe(false);
  });
  it('never promotes narrative, skill, title or class evidence to an item window', async () => {
    const root = await start('<p>Grid obtained a legendary sword.</p><p>He was a legendary warrior.</p><p>Skill Name: Legendary Sword</p><p>Rating: Legendary</p><p>Title: Mythic Sword</p><p>Grade: Mythic</p><p>Class: Rare Knight<br>Rating: Rare</p>');
    expect(root.querySelectorAll('[data-rpg-item-rarity]')).toHaveLength(0);
    expect(root.querySelectorAll('.rpg-rarity')).toHaveLength(1);
    expect(root.querySelector('.rpg-rarity')!.textContent).toBe('legendary');
    expect(root.querySelector('p')!.className).toBe('');
  });
  it('preserves original markup identity, listeners, text and selection across inline tags', async () => {
    const root = await start('<section><p>Item Name: F<em>ail</em>ure<br>Rating: <strong>Legen</strong>dary</p><p>A <em>rare</em> sword cost €20.</p></section>');
    const original = root.textContent;
    const emphasis = root.querySelector('em')!; const listener = vi.fn(); emphasis.addEventListener('test', listener);
    const marks = Array.from(root.querySelectorAll('.rpg-rarity'));
    bootstrap(window); await tick();
    expect(Array.from(root.querySelectorAll('.rpg-rarity'))).toEqual(marks);
    expect(root.querySelector('em')).toBe(emphasis); emphasis.dispatchEvent(new Event('test')); expect(listener).toHaveBeenCalledOnce();
    expect(root.textContent).toBe(original);
    const range = document.createRange(); range.selectNodeContents(root); window.getSelection()!.addRange(range);
    window.LNReaderRPG!.configure({ theme: 'medieval' }); await tick();
    expect(window.getSelection()!.toString()).toBe(original); expect(Array.from(root.querySelectorAll('.rpg-rarity'))).toEqual(marks);
    window.getSelection()!.removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); await tick();
    expect(root.dataset.rpgTheme).toBe('medieval');
  });
  it('remains idempotent with no nested rarity spans, extra styles or observer loops', async () => {
    const root = await start('<div><p>[Legendary Item]</p><p>Item Name: Failure<br>Rating: Legendary</p><p>A rare sword cost 10 gold.</p></div>');
    const html = root.innerHTML;
    for (let i = 0; i < 4; i++) { bootstrap(window); await tick(); }
    expect(root.innerHTML).toBe(html); expect(root.querySelector('.rpg-rarity .rpg-rarity')).toBeNull();
    expect(document.querySelectorAll('#lnreader-rpg-style')).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps monetary amounts and interactivity independent, including amounts inside item names', async () => {
    const root = await start('<p>Item Name: The 10 Gold Sword<br>Rarity: Legendary<br>Price: €20</p><p>A rare sword cost 500 silver and $50.</p>');
    expect(root.querySelectorAll('.rpg-money')).toHaveLength(4);
    expect(root.querySelector('[data-rpg-currency="gold"]')!.hasAttribute('role')).toBe(false);
    root.querySelector<HTMLElement>('[data-rpg-currency="EUR"]')!.click();
    expect(document.querySelector('.rpg-popup')!.textContent).toContain('Exchange rate unavailable.');
    expect(root.textContent).toBe('Item Name: The 10 Gold SwordRarity: LegendaryPrice: €20A rare sword cost 500 silver and $50.');
  });
  it('does not recolor or nest rarity marks inside existing monetary spans after an evidence edit', async () => {
    const root = await start('<p>Item Name: The 10 Gold Sword</p><p>Rating: Legendary</p><p>Price: €20</p>');
    const gold = root.querySelector('[data-rpg-currency="gold"]');
    root.querySelectorAll('p')[1].textContent = 'Rating: Epic'; await tick();
    expect(root.querySelector('[data-rpg-currency="gold"]')).toBe(gold);
    expect(root.querySelector('.rpg-money .rpg-rarity')).toBeNull();
    expect(root.querySelectorAll('[data-rpg-item-rarity="epic"]')).toHaveLength(3);
  });
  it('updates changed/removed evidence and does not retain stale colors', async () => {
    const root = await start('<p>Item Name: Failure</p><p>Rating: Legendary</p><p>Attack: 100</p>');
    root.querySelectorAll('p')[1].textContent = 'Rating: Epic'; await tick();
    expect(root.querySelectorAll('[data-rpg-item-rarity="epic"]')).toHaveLength(3);
    expect(root.querySelector('[data-rpg-rarity="legendary"]')).toBeNull();
    root.querySelectorAll('p')[1].remove(); await tick();
    expect(root.querySelector('[data-rpg-item-rarity]')).toBeNull(); expect(root.querySelector('.rpg-rarity')).toBeNull();
  });
  it.each(['classic', 'medieval', 'minimal'] as const)('supports %s profile colors and reversible disable/destroy', async theme => {
    window.LNReaderRPGConfig = { theme, rarity: { profiles: { default: {
      colors: { legendary: '#123456' }, themeColors: { [theme]: { legendary: '#ABCDEF' } },
    } } } };
    const root = await start('<p>Item: Failure<br>Rating: Legendary</p><p>10 gold</p>');
    expect(root.style.getPropertyValue('--rpg-rarity-legendary')).toBe('#ABCDEF');
    window.LNReaderRPG!.configure({ rarity: { enabled: false } }); await tick();
    expect(root.querySelector('.rpg-rarity,[data-rpg-item-rarity]')).toBeNull();
    expect(root.style.getPropertyValue('--rpg-rarity-legendary')).toBe('');
    expect(root.querySelector('.rpg-money')).not.toBeNull();
    window.LNReaderRPG!.configure({ rarity: { enabled: true } }); await tick();
    expect(root.querySelector('.rpg-rarity')).not.toBeNull();
    window.LNReaderRPG!.destroy(); expect(root.querySelector('.rpg-rarity,[data-rpg-item-rarity]')).toBeNull();
    expect(root.style.getPropertyValue('--rpg-rarity-legendary')).toBe('');
  });
  it('switches novel profiles without assuming shared vocabulary or colors', async () => {
    const root = await start('<p>Item Name: Wisp<br>Quality: Relic</p><p>A relic wand. A legendary sword.</p>');
    window.LNReaderRPG!.configure({ rarity: { profile: 'novel', profiles: { novel: {
      aliases: { Relic: 'relic' }, fields: ['Quality'], itemNouns: ['wand'], colors: { relic: '#123456' },
    } } } }); await tick();
    expect(root.querySelector('[data-rpg-item-rarity="relic"]')).not.toBeNull();
    expect(root.querySelector('[data-rpg-rarity="legendary"]')).toBeNull();
    window.LNReaderRPG!.configure({ rarity: { profile: 'default' } }); await tick();
    expect(root.querySelector('[data-rpg-rarity="relic"]')).toBeNull();
    expect(root.style.getPropertyValue('--rpg-rarity-relic')).toBe('');
  });
  it('ignores links, code, buttons and editable content', async () => {
    const html = '<p><a href="#">legendary sword</a> <code>Rating: Rare</code> <button>epic dagger</button> <span contenteditable="">mythic armor</span></p>';
    const root = await start(html); expect(root.innerHTML).toBe(html);
  });
});
