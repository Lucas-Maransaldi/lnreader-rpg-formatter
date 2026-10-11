import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrap } from '../../src/core/bootstrap';

const tick = () => vi.advanceTimersByTimeAsync(100);
function chapter(html: string) {
  document.body.innerHTML = '<div id="LNReader-chapter">' + html + '</div><div id="reader-ui">Controls</div>';
  return document.getElementById('LNReader-chapter')!;
}
async function start(html: string) {
  const root = chapter(html);
  bootstrap(window);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await tick();
  return root;
}
beforeEach(() => { vi.useFakeTimers(); window.getSelection()?.removeAllRanges(); });
afterEach(() => {
  window.getSelection()?.removeAllRanges(); window.LNReaderRPG?.destroy(); delete window.LNReaderRPGConfig;
  document.body.innerHTML = ''; vi.useRealTimers();
});

describe('DOM integration', () => {
  it('groups only consecutive related paragraphs without moving their nodes', async () => {
    const root = await start('<p>[You have leveled up!]</p>\n<p>[Your strength has increased by 5.]</p><p>Then he sat.</p><p>[Quest Completed]</p>');
    const p = root.querySelectorAll('p');
    expect(p[0].dataset.rpgGroup).toBe('start'); expect(p[1].dataset.rpgGroup).toBe('end');
    expect(p[2].outerHTML).toBe('<p>Then he sat.</p>'); expect(p[3].dataset.rpgGroup).toBe('single');
    expect(Array.from(root.children)).toEqual(Array.from(p));
  });
  it('does not group across prose text, BR or other elements', async () => {
    const root = await start('<p>[You have leveled up!]</p>Story<p>[You have leveled up!]</p><br><p>[You have leveled up!]</p>');
    expect(Array.from(root.querySelectorAll('.rpg-window')).every(el => el.getAttribute('data-rpg-group') === 'single')).toBe(true);
  });
  it('preserves exact text, inline elements, and node listeners across monetary markup', async () => {
    const html = '<p id="plain">A quiet morning.</p><p>Saved <em>2 million</em> euros; 50 <strong>gold coins</strong>. Paid ₩1,500,000 and $10.</p>';
    const root = chapter(html);
    const original = root.textContent;
    const emphasis = root.querySelector('em'); const listener = vi.fn(); emphasis!.addEventListener('x', listener);
    bootstrap(window); document.dispatchEvent(new Event('DOMContentLoaded')); await tick();
    expect(root.textContent).toBe(original); expect(root.querySelector('em')).toBe(emphasis);
    emphasis!.dispatchEvent(new Event('x')); expect(listener).toHaveBeenCalledTimes(1);
    expect(root.querySelector('#plain')!.outerHTML).toBe('<p id="plain">A quiet morning.</p>');
    expect(root.querySelector('[data-rpg-currency="gold"]')!.hasAttribute('role')).toBe(false);
    expect(root.querySelector('[data-rpg-currency="USD"]')!.hasAttribute('role')).toBe(false);
    expect(root.querySelectorAll('[data-rpg-currency="EUR"]')).toHaveLength(2);
  });
  it('is idempotent, reuses one API/style/observer, and ignores its own DOM work', async () => {
    const root = await start('<p>[You have leveled up!]</p><p>10 gold and €20</p>');
    const html = root.innerHTML; const first = window.LNReaderRPG;
    for (let i = 0; i < 4; i++) { bootstrap(window); await tick(); }
    expect(window.LNReaderRPG).toBe(first); expect(root.innerHTML).toBe(html);
    expect(document.querySelectorAll('#lnreader-rpg-style')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('initializes AFTER the host Custom JS innerHTML assignment', async () => {
    const root = chapter('<p>[Quest Completed]</p><p>€20</p>');
    // Same execution order as LNReader fn(), including detached node replacement.
    const html = root.innerHTML;
    bootstrap(window);
    root.innerHTML = html;
    document.dispatchEvent(new Event('DOMContentLoaded')); await tick();
    expect(root.querySelector('.rpg-window')).not.toBeNull();
    expect(root.querySelector('[data-rpg-interactive]')).not.toBeNull();
  });
  it('handles late roots, additions, replacement chapters and changed money', async () => {
    document.body.innerHTML = ''; bootstrap(window); document.dispatchEvent(new Event('DOMContentLoaded')); await tick();
    const root = chapter('<p>€20</p>'); await tick();
    const span = root.querySelector('span')!; span.textContent = '€30'; await tick();
    (root.querySelector('span') as HTMLElement).click();
    expect(document.querySelector('.rpg-popup')!.textContent).toContain('€30');
    const next = document.createElement('div'); next.id = root.id; next.innerHTML = '<p>[Quest Failed]</p><p>500 won</p>';
    root.replaceWith(next); await tick();
    expect(document.querySelector('.rpg-popup')).toBeNull(); expect(next.querySelector('.rpg-window')).not.toBeNull();
    const added = document.createElement('p'); added.textContent = '100 copper'; next.appendChild(added); await tick();
    expect(added.querySelector('.rpg-money')).not.toBeNull();
  });
  it('processes every record in a mixed mutation batch before reusing currency metadata', async () => {
    const root = await start('<p>€20</p>');
    root.appendChild(document.createElement('p'));
    root.querySelector('.rpg-money')!.textContent = '€40';
    await tick();
    root.querySelector<HTMLElement>('[data-rpg-interactive]')!.click();
    expect(document.querySelector('.rpg-popup')!.textContent).toContain('€40');
  });
  it('defers mutations during selection and preserves selected text', async () => {
    const root = chapter('<p>€20 and 15 gold</p>');
    const range = document.createRange(); range.selectNodeContents(root.querySelector('p')!);
    window.getSelection()!.addRange(range);
    bootstrap(window); document.dispatchEvent(new Event('DOMContentLoaded')); await tick();
    expect(root.querySelector('.rpg-money')).toBeNull(); expect(window.getSelection()!.toString()).toBe('€20 and 15 gold');
    window.getSelection()!.removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); await tick();
    expect(root.querySelectorAll('.rpg-money')).toHaveLength(2);
  });
  it('leaves links, code, editables and UI alone', async () => {
    const html = '<p><a href="#">€20</a> <code>5 gold</code> <span contenteditable="">500 won</span></p>';
    const root = await start(html); expect(root.innerHTML).toBe(html);
    expect(document.getElementById('reader-ui')!.innerHTML).toBe('Controls');
  });
  it.each(['classic', 'medieval', 'minimal'] as const)('switches to %s and supports disable/re-enable/destroy', async theme => {
    const root = await start('<p>[Quest Completed]</p><p>10 gold and €20</p>');
    const text = root.textContent;
    window.LNReaderRPG!.configure({ theme }); await tick(); expect(root.dataset.rpgTheme).toBe(theme);
    window.LNReaderRPG!.configure({ enabled: false }); await tick(); expect(root.querySelector('.rpg-money,.rpg-window')).toBeNull();
    window.LNReaderRPG!.configure({ enabled: true }); await tick(); expect(root.querySelector('.rpg-window')).not.toBeNull();
    window.LNReaderRPG!.destroy(); expect(root.textContent).toBe(text); expect(document.querySelector('#lnreader-rpg-style')).toBeNull();
    expect(root.querySelector('.rpg-money,.rpg-window')).toBeNull();
  });
  it('supports an alternate root without falling back to the whole body', async () => {
    window.LNReaderRPGConfig = { rootSelector: '#other' };
    const root = await start('<p>€20</p>'); expect(root.querySelector('span')).toBeNull();
    root.id = 'other'; window.LNReaderRPG!.refresh(); await tick(); expect(root.querySelector('span')).not.toBeNull();
  });
});

describe('nonmodal currency popup', () => {
  it('opens exactly once, displays no fabricated rate, and closes three ways', async () => {
    const root = await start('<p>€20 and 50 gold and $20</p>');
    const euro = root.querySelector<HTMLElement>('[data-rpg-currency="EUR"]')!;
    euro.click(); euro.click(); expect(document.querySelectorAll('.rpg-popup')).toHaveLength(1);
    expect(document.querySelector('.rpg-popup')!.textContent).toContain('Exchange rate unavailable.');
    document.querySelector<HTMLButtonElement>('.rpg-popup-close')!.click(); expect(document.querySelector('.rpg-popup')).toBeNull();
    euro.click(); document.body.click(); expect(document.querySelector('.rpg-popup')).toBeNull();
    euro.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).toBe(document.querySelector('.rpg-popup-close'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); expect(document.querySelector('.rpg-popup')).toBeNull();
    for (const code of ['gold', 'USD']) root.querySelector<HTMLElement>('[data-rpg-currency="' + code + '"]')!.click();
    expect(document.querySelector('.rpg-popup')).toBeNull();
  });
  it('shows configured arithmetic and dates, and isolates taps from document.onclick', async () => {
    window.LNReaderRPGConfig = { exchangeRates: { KRW: { value: .001, date: '2025-01-02' } } };
    const root = await start('<p>1000 won</p>');
    const host = vi.fn(); document.onclick = host;
    root.querySelector<HTMLElement>('[data-rpg-interactive]')!.click();
    expect(host).not.toHaveBeenCalled();
    const text = document.querySelector('.rpg-popup')!.textContent;
    expect(text).toContain('$1.00 USD'); expect(text).toContain('2025-01-02'); expect(text).toContain('1 KRW = 0.001 USD');
    document.body.click(); expect(host).toHaveBeenCalledTimes(1); document.onclick = null;
  });
  it('honors highlighting and conversion flags independently', async () => {
    window.LNReaderRPGConfig = { currencyHighlight: false, currencyConversion: false };
    const root = await start('<p>50 gold, €20, $30</p>'); expect(root.querySelector('span')).toBeNull();
    window.LNReaderRPG!.configure({ currencyHighlight: true }); await tick();
    expect(root.querySelectorAll('.rpg-money')).toHaveLength(3); expect(root.querySelector('[role="button"]')).toBeNull();
    window.LNReaderRPG!.configure({ currencyHighlight: false, currencyConversion: true }); await tick();
    expect(root.querySelectorAll('.rpg-money')).toHaveLength(1); expect(root.querySelector('[role="button"]')).not.toBeNull();
  });
});
