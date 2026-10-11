import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture =
  '<p>[You have leveled up!]</p><p>[Your strength has increased by 5.]</p><p>Paid 15,000 gold, 500 silver, 100 copper, ₩1,500,000, €2,000 and $1,500.</p><p>Saved <em>2 million</em> euros.</p><p>[A letter was on the desk.]</p>';

for (const file of ['lnreader-rpg.js', 'lnreader-rpg.min.js']) {
  test(`${file}: host wrapper, offline, duplicate execution, exact text and popup`, async ({
    page,
    context,
  }) => {
    const script = readFileSync('dist/' + file, 'utf8');
    expect(script).not.toMatch(/\beval\s*\(|new Function\s*\(|<\/script/i);
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('request', (req) => requests.push(req.url()));
    page.on('pageerror', (err) => errors.push(err.message));
    await context.setOffline(true);
    // Reproduce both the host wrapper and its synchronous writeback at DOMContentLoaded.
    await page.setContent(`<!doctype html><html><body><div id="LNReader-chapter">${fixture}</div><div id="reader-ui">Reader UI</div><script>
      window.hostClicks = 0;
      document.onclick = function () { window.hostClicks++; };
      document.addEventListener('DOMContentLoaded', function fn() {
        let html = document.querySelector('#LNReader-chapter').innerHTML;
        try { ${script} } catch (error) { throw error; }
        document.querySelector('#LNReader-chapter').innerHTML = html;
      });
    </script></body></html>`);
    await expect(page.locator('.rpg-window')).toHaveCount(3);
    const originalText = await page.evaluate((html) => {
      const d = document.createElement('div');
      d.innerHTML = html;
      return d.textContent;
    }, fixture);
    await expect(page.locator('#LNReader-chapter')).toHaveText(originalText!);
    await expect(page.locator('[data-rpg-group="start"]')).toHaveCount(1);
    await page.locator('[data-rpg-currency="KRW"]').tap();
    await expect(page.getByRole('dialog')).toContainText(
      'Exchange rate unavailable.',
    );
    expect(await page.evaluate(() => (window as any).hostClicks)).toBe(0);
    await page.getByRole('button', { name: 'Close currency conversion' }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const code of ['gold', 'silver', 'copper', 'USD']) {
      await page.locator(`[data-rpg-currency="${code}"]`).tap();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(
        page.locator(`[data-rpg-currency="${code}"]`),
      ).not.toHaveAttribute('role');
    }
    const decorated = await page.locator('#LNReader-chapter').innerHTML();
    await page.addScriptTag({ content: script });
    await page.waitForTimeout(180);
    expect(await page.locator('#LNReader-chapter').innerHTML()).toBe(decorated);
    await expect(page.locator('#lnreader-rpg-style')).toHaveCount(1);
    // Copy/selection sees precisely the original text.
    const selected = await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('LNReader-chapter')!);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      const text = range.toString();
      selection.removeAllRanges();
      return text;
    });
    expect(selected).toBe(originalText);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('themes, small-screen dialog, nested currency and deterministic screenshots', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.rpg-window')).toHaveCount(11);
  for (const theme of ['classic', 'medieval', 'minimal']) {
    await page.locator(`[data-theme="${theme}"]`).click();
    await expect(page.locator('#LNReader-chapter')).toHaveAttribute(
      'data-rpg-theme',
      theme,
    );
    await page.screenshot({ path: `docs/images/${theme}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Light background' }).click();
  await expect(page.locator('#LNReader-chapter')).toHaveAttribute(
    'data-rpg-tone',
    'light',
  );
  await page.screenshot({
    path: 'docs/images/minimal-light.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('[data-rpg-currency="EUR"]').last().tap();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  await expect(page.getByRole('dialog')).toContainText('2 million euros');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('preserves the visible paragraph when enabled halfway through a chapter', async ({
  page,
}) => {
  await page.setContent(
    '<style>body {font:18px/1.7 sans-serif;margin:20px}p{margin:1em 0}</style><div id="LNReader-chapter">' +
      Array.from(
        { length: 100 },
        (_, i) =>
          `<p id="p${i}">${i % 3 === 0 ? '[You have leveled up!]' : `Paragraph ${i}. The adventurer returned to the quiet workshop and waited for dawn.`}</p>`,
      ).join('') +
      '</div>',
  );
  await page
    .locator('#p50')
    .evaluate((el) => window.scrollTo(0, (el as HTMLElement).offsetTop + 5));
  const before = await page
    .locator('#p50')
    .evaluate((el) => el.getBoundingClientRect().top);
  await page.addScriptTag({
    content: readFileSync('dist/lnreader-rpg.js', 'utf8'),
  });
  await expect(page.locator('.rpg-window')).toHaveCount(34);
  const after = await page
    .locator('#p50')
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(before - after)).toBeLessThanOrEqual(2);
});

test('root replacement closes the dialog and formats the new chapter', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('[data-rpg-currency="KRW"]').tap();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.evaluate(() => {
    const next = document.createElement('main');
    next.id = 'LNReader-chapter';
    next.innerHTML = '<p>[Quest Completed]</p><p>100 silver and €50</p>';
    document.getElementById('LNReader-chapter')!.replaceWith(next);
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-rpg-kind="quest"]')).toHaveCount(1);
  await expect(page.locator('.rpg-money')).toHaveCount(2);
});

test('host column mode keeps paragraph geometry and document controls outside currency taps', async ({
  page,
}) => {
  await page.setContent(
    '<style>body{height:800px}#LNReader-chapter{height:700px;column-width:350px;column-gap:20px}p{margin:16px 0}</style><body class="page-reader"><div id="LNReader-chapter">' +
      fixture.repeat(8) +
      '</div></body>',
  );
  const before = await page
    .locator('#LNReader-chapter > p')
    .first()
    .boundingBox();
  await page.addScriptTag({
    content: readFileSync('dist/lnreader-rpg.js', 'utf8'),
  });
  await expect(page.locator('.rpg-window')).toHaveCount(24);
  const after = await page
    .locator('#LNReader-chapter > p')
    .first()
    .boundingBox();
  expect(after!.height).toBe(before!.height);
  expect(after!.y).toBe(before!.y);
});
