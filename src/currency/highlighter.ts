import { BLOCKS, EXCLUDED } from '../core/dom-structure';
import type { Config } from '../core/config';
import { convertible } from './converter';
import { detectMoney, type MoneyMatch } from './detector';
import { inlineRuns, wrapTextRange } from '../core/text-ranges';

export type MoneyRegistry = Map<string, MoneyMatch>;
let sequence = 0;

/** Collect inline runs without crossing paragraphs, BRs, links or existing marks. */
export function highlightMoney(root: HTMLElement, config: Config, registry: MoneyRegistry): void {
  if (!config.currencyHighlight && !config.currencyConversion) return;
  for (const run of inlineRuns(root, BLOCKS, EXCLUDED + ',.rpg-money,br,img,hr')) {
    for (const money of detectMoney(run.text).reverse()) {
      const interactive = config.currencyConversion && convertible(money.currency);
      if (!config.currencyHighlight && !interactive) continue;
      const id = String(++sequence);
      registry.set(id, money);
      wrapTextRange(run, money.start, money.end, i => {
        const span = root.ownerDocument.createElement('span');
        span.className = 'rpg-money';
        span.dataset.rpgMoney = id;
        span.dataset.rpgCurrency = money.currency;
        if (interactive) {
          span.dataset.rpgInteractive = 'true';
          span.setAttribute('role', 'button');
          span.tabIndex = i === 0 ? 0 : -1;
          span.setAttribute('aria-label', 'Convert ' + money.text + ' to USD');
          span.setAttribute('aria-haspopup', 'dialog');
        }
        return span;
      });
    }
  }
  const live = new Set(Array.from(root.querySelectorAll<HTMLElement>('[data-rpg-money]')).map(el => el.dataset.rpgMoney));
  for (const id of registry.keys()) if (!live.has(id)) registry.delete(id);
}
