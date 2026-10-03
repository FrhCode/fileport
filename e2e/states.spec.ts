import { test, expect } from '@playwright/test';

const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
const files = [
  { id: 'screen', name: 'screenshot.png', size: 4_800_000, path: '/home/farhan/uploads/screenshot.png', expiresAt: future },
  { id: 'notes', name: 'catatan.pdf', size: 2_400_000, path: '/home/farhan/uploads/catatan.pdf', expiresAt: future },
  { id: 'data', name: 'dataset-training.zip', size: 180_000_000, path: '/home/farhan/uploads/dataset-training.zip', expiresAt: future },
];

test.describe('four-state workspace', () => {
  test('renders the ready-to-upload empty state', async ({ page }) => {
    await page.route('**/api/files', route => route.fulfill({ json: [] }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Unggah file' })).toBeVisible();
    await expect(page.getByText('Belum ada file')).toBeVisible();
    await expect(page.getByText('File tersimpan (0)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pilih file' })).toBeVisible();
  });

  test('uploads immediately and leaves the next file waiting', async ({ page }) => {
    await page.route('**/api/files', route => route.fulfill({ json: [] }));
    await page.route('**/api/files', async route => {
      if (route.request().method() === 'POST') await new Promise(() => {});
      else await route.fulfill({ json: [] });
    });
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'dataset-training.zip', mimeType: 'application/zip', buffer: Buffer.alloc(128_000) },
      { name: 'screenshot.png', mimeType: 'image/png', buffer: Buffer.alloc(12_000) },
    ]);
    await expect(page.getByText('Mengunggah (2)')).toBeVisible();
    await expect(page.getByText('Menunggu...')).toBeVisible();
  });

  test('supports saved-file selection and multi-copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.route('**/api/files', route => route.fulfill({ json: files }));
    await page.route('**/api/files/screen/preview', route => route.fulfill({ status: 404 }));
    await page.goto('/');
    await page.getByRole('checkbox', { name: 'Pilih screenshot.png' }).check();
    await page.getByRole('checkbox', { name: 'Pilih catatan.pdf' }).check();
    await expect(page.getByText('2 file dipilih')).toBeVisible();
    await page.getByRole('button', { name: 'Salin 2 path' }).click();
    await expect(page.getByRole('button', { name: '2 path tersalin' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${files[0].path}\n${files[1].path}`);
    await expect(page.getByText('2 path berhasil disalin.')).toHaveCount(0);
  });

  test('uses accurate copy counts and readable desktop typography', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    await page.route('**/api/files', route => route.fulfill({ json: [files[0], { ...files[1], expiresAt: expiredAt }] }));
    await page.route('**/api/files/screen/preview', route => route.fulfill({ status: 404 }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('checkbox', { name: 'Pilih screenshot.png' }).check();
    await page.getByRole('checkbox', { name: 'Pilih catatan.pdf' }).check();
    await expect(page.getByRole('button', { name: 'Salin 1 path' })).toBeVisible();
    const selectors = ['.dropzone small', '.search input', '.table-head', '.file-meta b', '.file-size', '.file-row code', '.file-row > small', '.copy', '.bottom-note'];
    for (const selector of selectors) {
      const fontSize = await page.locator(selector).first().evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
      expect(fontSize, selector).toBeGreaterThanOrEqual(12);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('shows a dedicated oversized-file error', async ({ page }) => {
    await page.route('**/api/files', route => route.fulfill({ json: [files[1]] }));
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles('/tmp/fileport-video-demo.mp4');
    await expect(page.getByText('File terlalu besar. Maksimal 200 MB per file.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hapus dari antrean' })).toBeVisible();
  });
});
