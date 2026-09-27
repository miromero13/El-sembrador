import { expect, test } from '@playwright/test';
const routes = ['/', '/camino', '/pedregal', '/espinos', '/buena-tierra', '/podio'];
test('all six routes load directly and survive reload', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  }
});
test('connects to the live server after validating its welcome', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Conectado');
});
