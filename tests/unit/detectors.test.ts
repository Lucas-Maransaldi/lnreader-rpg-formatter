import { describe, expect, it } from 'vitest';
import { detectMoney } from '../../src/currency/detector';
import { detectWindow } from '../../src/detectors/system';

describe('conservative system detection', () => {
  it.each([
    ['[You have leveled up!]', 'system'],
    ['[Your strength has increased by 5.]', 'system'],
    ['[Achievement Unlocked]', 'system'],
    ['[Quest Completed]', 'quest'],
    ['Quest Failed: A lost key', 'quest'],
    [
      'Objectives: Find the forge.\nRewards: 500 gold\nPenalties: None',
      'quest',
    ],
    ['Strength: 20\nAgility: 15\nHP: 900 / 1000\nDefense: 50', 'status'],
    [
      'Item: Sword\nRarity: Mythic\nItem Effects: Fire resistance\nItem Requirements: Level 20',
      'item',
    ],
    ['Weapons: Sword\nArmor: Plate\nAccessories: Ring', 'item'],
    ['Legendary Items', 'item'],
    ['Mythic Items', 'item'],
    [
      'Skill Acquired: Guard\nPassive Skills: Toughness\nActive Skills: Slash\nCooldown: 3 seconds\nMana Cost: 20',
      'skill',
    ],
    ['[Skill Level Up]', 'skill'],
  ])('%s → %s', (text, kind) => expect(detectWindow(text)).toBe(kind));
  it.each([
    'His strength had increased, but he was still tired.',
    '[She closed the letter.]',
    'You have leveled up! he shouted.',
    'Strength: it was all he had left.',
    'A legendary sword lay on the table.',
    'He said [Quest Completed] and laughed.',
    '[You have leveled up!]\nThen the rain began.',
    '',
  ])('leaves narration unchanged: %s', (text) =>
    expect(detectWindow(text)).toBe('system'),
  );
});

describe('English monetary notation', () => {
  it.each([
    ['15,000 gold', 15000, 'gold'],
    ['500 silver coins', 500, 'silver'],
    ['100 copper', 100, 'copper'],
    ['2.5 million gold', 2500000, 'gold'],
    ['₩1,500,000', 1500000, 'KRW'],
    ['500,000 won', 500000, 'KRW'],
    ['100,000 KRW', 100000, 'KRW'],
    ['€2,000', 2000, 'EUR'],
    ['2 million euros', 2000000, 'EUR'],
    ['$1,500', 1500, 'USD'],
    ['3 thousand US dollars', 3000, 'USD'],
    ['1.5 billion Korean won', 1500000000, 'KRW'],
  ])('%s', (text, amount, currency) =>
    expect(detectMoney(text)).toEqual([
      { start: 0, end: text.length, text, amount, currency },
    ]),
  );
  it.each([
    '1,50 gold',
    '15,000gold',
    'abc500 won',
    '-500 won',
    '1.000,50 euros',
    '$500 gold',
    '2 goldfish',
    'Gold was his favorite color.',
  ])('rejects ambiguous %s', (text) => expect(detectMoney(text)).toEqual([]));
  it('detects multiple nonoverlapping values with exact source slices', () => {
    const text = 'He paid 50 gold, 20 silver and €10.';
    const results = detectMoney(text);
    expect(results.map((m) => m.currency)).toEqual(['gold', 'silver', 'EUR']);
    for (const result of results)
      expect(text.slice(result.start, result.end)).toBe(result.text);
  });
});
