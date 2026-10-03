import { test, expect } from '@playwright/test';

const imageId = 'RzhYsBYSSSTM';

test.describe('file interactions', () => {
  test('renders image thumbnail and opens detail popup', async ({ page }) => {
    await page.route('**/api/files', async route => route.fulfill({ json: [{ id: imageId, name: 'image.png', size: 149541, path: `/tmp/${imageId}/image.png`, expiresAt: new Date(Date.now() + 86400000).toISOString() }] }));
    await page.route(`**/api/files/${imageId}/preview`, route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) }));
    await page.goto('/');
    await expect(page.locator('.file-icon img')).toBeVisible();
    await page.locator('.file-row').click();
    await expect(page.getByRole('dialog')).toContainText('Detail file');
    await expect(page.getByRole('dialog')).toContainText('image.png');
  });

  test('preview failure shows fallback and controls do not open detail', async ({ page }) => {
    await page.route('**/api/files', async route => route.fulfill({ json: [{ id: imageId, name: 'image.png', size: 10, path: '/tmp/image.png', expiresAt: new Date(Date.now() + 86400000).toISOString() }] }));
    await page.route(`**/api/files/${imageId}/preview`, route => route.fulfill({ status: 404, body: 'not found' }));
    await page.goto('/');
    await expect(page.locator('.file-icon')).toContainText('IMG');
    await page.getByRole('checkbox', { name: 'Pilih image.png' }).check();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /Salin 1 path/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('shows inline feedback for row and detail copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const path = `/tmp/${imageId}/image.png`;
    await page.route('**/api/files', route => route.fulfill({ json: [{ id: imageId, name: 'image.png', size: 10, path, expiresAt: new Date(Date.now() + 86400000).toISOString() }] }));
    await page.route(`**/api/files/${imageId}/preview`, route => route.fulfill({ status: 404 }));
    await page.goto('/');
    await page.locator('.file-row .copy').click();
    await expect(page.locator('.file-row .copy')).toHaveText(/Tersalin/);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(path);
    await page.locator('.file-row').click();
    const dialog = page.getByRole('dialog', { name: 'Detail file' });
    await dialog.locator('.detail-copy').click();
    await expect(dialog.locator('.detail-copy')).toHaveText(/Tersalin/);
    await expect(page.locator('.file-row .copy')).toHaveText(/Salin path/);
  });

  test('falls back to legacy copy before showing the manual dialog', async ({ page }) => {
    await page.addInitScript({ content: `
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('blocked')) } });
      Document.prototype.execCommand = function (command) {
        window.legacyCopy = command === 'copy' ? document.activeElement?.value : '';
        return command === 'copy';
      };
    ` });
    await page.route('**/api/files', route => route.fulfill({ json: [{ id: imageId, name: 'image.png', size: 10, path: '/tmp/image.png', expiresAt: new Date(Date.now() + 86400000).toISOString() }] }));
    await page.route(`**/api/files/${imageId}/preview`, route => route.fulfill({ status: 404 }));
    await page.goto('/');
    await page.locator('.file-row .copy').click();
    await expect(page.locator('.file-row .copy')).toHaveText(/Tersalin/);
    expect(await page.evaluate('window.legacyCopy')).toBe('/tmp/image.png');
    await expect(page.getByRole('dialog', { name: 'Salin path secara manual' })).toHaveCount(0);
  });

  test('opens manual copy only when automatic methods fail', async ({ page }) => {
    await page.addInitScript({ content: `
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('blocked')) } });
      Document.prototype.execCommand = () => false;
    ` });
    await page.route('**/api/files', route => route.fulfill({ json: [{ id: imageId, name: 'image.png', size: 10, path: '/tmp/image.png', expiresAt: new Date(Date.now() + 86400000).toISOString() }] }));
    await page.route(`**/api/files/${imageId}/preview`, route => route.fulfill({ status: 404 }));
    await page.goto('/');
    await page.locator('.file-row .copy').click();
    const dialog = page.getByRole('dialog', { name: 'Salin path secara manual' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Path untuk disalin manual')).toHaveValue('/tmp/image.png');
    await expect(page.locator('.file-row .copy')).toHaveText(/Salin path/);
  });

  test('delete requires confirmation and cancel closes it', async ({ page }) => {
    await page.route('**/api/files', async route => route.fulfill({ json: [{ id: imageId, name: 'image.png', size: 10, path: '/tmp/image.png', expiresAt: new Date(Date.now() + 86400000).toISOString() }] }));
    await page.goto('/');
    await page.locator('.file-row').click();
    await page.getByRole('button', { name: 'Hapus' }).click();
    await expect(page.getByRole('dialog')).toContainText('Hapus file?');
    await page.getByRole('button', { name: 'Batal' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
