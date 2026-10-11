import type { Config } from '../core/config';
import { RateService } from './converter';
import type { MoneyRegistry } from './highlighter';

export class CurrencyPopup {
  private panel: HTMLElement | null = null;
  private trigger: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  constructor(private doc: Document, private config: Config, private rates: RateService, private registry: MoneyRegistry) {
    // Capture click before LNReader's document.onclick; never cancel touch/scroll/selection.
    doc.addEventListener('click', this.click, true);
    doc.addEventListener('keydown', this.keydown, true);
  }
  setRoot(root: HTMLElement | null): void { this.root = root; }

  private moneyTarget(target: EventTarget | null): HTMLElement | null {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-rpg-interactive="true"]') : null;
    return el && this.root?.contains(el) ? el : null;
  }

  private click = (event: MouseEvent): void => {
    const target = event.target as Node;
    if (this.panel?.contains(target)) {
      event.stopPropagation();
      if ((target as Element).closest('.rpg-popup-close')) this.close(true);
      return;
    }
    const money = this.moneyTarget(event.target);
    if (money) {
      if (!this.doc.getSelection()?.isCollapsed) return;
      event.stopPropagation();
      this.open(money, event.detail === 0);
    } else this.close();
  };

  private keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.panel) { event.stopPropagation(); this.close(true); }
    const target = this.moneyTarget(event.target);
    if (target && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); event.stopPropagation(); this.open(target, true);
    }
  };

  private open(trigger: HTMLElement, keyboard: boolean): void {
    const money = this.registry.get(trigger.dataset.rpgMoney!);
    if (!money || !['KRW', 'EUR'].includes(money.currency)) return;
    this.close();
    this.trigger = trigger;
    const panel = this.doc.createElement('aside');
    panel.className = 'rpg-popup';
    panel.dataset.rpgTheme = this.config.theme;
    panel.dataset.rpgTone = this.root?.dataset.rpgTone || 'dark';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Currency Conversion');
    const title = this.doc.createElement('strong');
    title.textContent = 'Currency Conversion';
    const close = this.doc.createElement('button');
    close.type = 'button';
    close.className = 'rpg-popup-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close currency conversion');
    panel.append(title, close);
    const row = (label: string, value: string) => {
      const p = this.doc.createElement('p');
      const heading = this.doc.createElement('small');
      heading.textContent = label;
      p.append(heading, this.doc.createTextNode(value));
      panel.appendChild(p);
    };
    row('Original', money.text);
    const conversion = this.rates.get(money);
    if (conversion) {
      row('Converted', '≈ ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(conversion.usd) + ' USD');
      row('Exchange Rate', '1 ' + money.currency + ' = ' + Number(conversion.rate.value.toPrecision(8)).toString() + ' USD');
      row('Rate Date', conversion.rate.date || 'Not provided (manual rate)');
      row('Source', conversion.source);
    } else row('Converted', 'Exchange rate unavailable.');
    this.panel = panel;
    this.doc.body.appendChild(panel);
    if (keyboard) close.focus({ preventScroll: true });
  }

  close(restoreFocus = false): void {
    this.panel?.remove();
    this.panel = null;
    if (restoreFocus && this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
    this.trigger = null;
  }

  destroy(): void {
    this.close();
    this.doc.removeEventListener('click', this.click, true);
    this.doc.removeEventListener('keydown', this.keydown, true);
  }
}
