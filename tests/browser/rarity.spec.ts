import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const palette: Record<string, string> = {
  common: 'rgb(156, 163, 175)', uncommon: 'rgb(34, 197, 94)', rare: 'rgb(59, 130, 246)',
  epic: 'rgb(168, 85, 247)', unique: 'rgb(249, 115, 22)', legendary: 'rgb(250, 204, 21)', mythic: 'rgb(239, 68, 68)',
};
const lightPalette: Record<string, string> = {
  common: 'rgb(75, 85, 99)', uncommon: 'rgb(21, 128, 61)', rare: 'rgb(29, 78, 216)',
  epic: 'rgb(126, 34, 206)', unique: 'rgb(194, 65, 12)', legendary: 'rgb(133, 96, 0)', mythic: 'rgb(185, 28, 28)',
};
const fixture = Object.keys(palette).map(rarity => `<p>[${rarity} Item: ${rarity} blade]<br>Rating: ${rarity}<br>Attack Power: 100<br>Price: €20</p>`).join('') +
  '<p id="narrative">Grid obtained a <em>legendary</em> sword for 10 gold.</p><p id="ordinary">He was a legendary warrior.</p>';

for (const bundle of ['lnreader-rpg.js', 'lnreader-rpg.min.js']) {
  test(`${bundle}: offline Custom JS preserves rarity, monetary taps, selection and idempotence`, async ({ page, context }) => {
    await context.setOffline(true);
    const requests: string[] = []; page.on('request', request => requests.push(request.url()));
    const script = readFileSync('dist/' + bundle, 'utf8');
    await page.setContent(`<div id="LNReader-chapter">${fixture}</div><script>
      document.addEventListener('DOMContentLoaded', function () {
        let html = document.getElementById('LNReader-chapter').innerHTML;
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('LNReader-chapter'));
        const selection = getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        window.originalSelection = selection.toString();
        window.originalText = document.getElementById('LNReader-chapter').textContent;
        selection.removeAllRanges();
        ${script}
        document.getElementById('LNReader-chapter').innerHTML = html;
      });
    </script>`);
    await expect(page.locator('[data-rpg-item-rarity]')).toHaveCount(7);
    await expect(page.locator('#narrative .rpg-rarity')).toHaveText('legendary');
    await expect(page.locator('#narrative')).not.toHaveClass('rpg-window');
    await expect(page.locator('#ordinary .rpg-rarity')).toHaveCount(0);
    const before = await page.locator('#LNReader-chapter').innerHTML();
    const name = await page.locator('[data-rpg-rarity-part="name"]').first().elementHandle();
    await page.addScriptTag({ content: script }); await page.waitForTimeout(180);
    expect(await page.locator('#LNReader-chapter').innerHTML()).toBe(before);
    expect(await name!.evaluate(el => el.isConnected)).toBe(true);
    await expect(page.locator('.rpg-rarity .rpg-rarity')).toHaveCount(0);
    await expect(page.locator('#lnreader-rpg-style')).toHaveCount(1);
    await page.locator('[data-rpg-currency="EUR"]').first().tap();
    await expect(page.getByRole('dialog')).toContainText('Exchange rate unavailable.');
    await page.getByRole('button', { name: 'Close currency conversion' }).click();
    const selected = await page.evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.getElementById('LNReader-chapter')!);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); return selection.toString();
    });
    const original = await page.evaluate(() => ({ selection: (window as any).originalSelection, text: (window as any).originalText }));
    expect(selected).toBe(original.selection);
    expect(await page.locator('#LNReader-chapter').textContent()).toBe(original.text);
    expect(requests).toEqual([]);
  });
}

for (const theme of ['classic', 'medieval', 'minimal']) {
  test(`${theme}: seven distinct hues, matching window edges, readable tokens and CSS/profile overrides`, async ({ page }) => {
    await page.setContent('<style>:root {--readerSettings-theme:#fafafa;--readerSettings-textColor:#202020}body{background:#fafafa}</style><div id="LNReader-chapter">' + fixture + '</div>');
    await page.evaluate(theme => { (window as any).LNReaderRPGConfig = { theme }; }, theme);
    await page.addScriptTag({ content: readFileSync('dist/lnreader-rpg.min.js', 'utf8') });
    await expect(page.locator('[data-rpg-item-rarity]')).toHaveCount(7);
    for (const [rarity, color] of Object.entries(theme === 'minimal' ? lightPalette : palette)) {
      const window = page.locator(`[data-rpg-item-rarity="${rarity}"]`);
      const name = window.locator('[data-rpg-rarity-part="name"]');
      await expect(name).toHaveCSS('color', color);
      expect(await window.evaluate(el => getComputedStyle(el).boxShadow)).toContain(color);
      const contrast = await name.evaluate(el => {
        const style = getComputedStyle(el);
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
            const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
          });
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        let background = style.backgroundColor;
        let ancestor = el.parentElement;
        while ((background === 'transparent' || background === 'rgba(0, 0, 0, 0)') && ancestor) {
          background = getComputedStyle(ancestor).backgroundColor; ancestor = ancestor.parentElement;
        }
        const a = luminance(style.color); const b = luminance(background);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
    // CSS overrides work without changing a detector or re-running it.
    await page.addStyleTag({ content: '[data-rpg-theme][data-rpg-tone] { --rpg-rarity-legendary: #ABCDEF; }' });
    await expect(page.locator('[data-rpg-item-rarity="legendary"] [data-rpg-rarity-part="name"]')).toHaveCSS('color', 'rgb(171, 205, 239)');
    await page.evaluate(theme => (window as any).LNReaderRPG.configure({ rarity: { profiles: { default: {
      colors: { legendary: '#123456' }, themeColors: { [theme]: { legendary: '#FEDCBA' } },
    } } } }), theme);
    await expect(page.locator('[data-rpg-item-rarity="legendary"] [data-rpg-rarity-part="name"]')).toHaveCSS('color', 'rgb(254, 220, 186)');
  });
}
