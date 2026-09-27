import { expect, test, type Page } from '@playwright/test';

test('organizer starts two independent Camino runs with tap, theft, reload, late-join rejection and individual finish', async ({ browser }) => {
  test.setTimeout(160_000);
  const ownerContext = await browser.newContext(); const owner = await ownerContext.newPage();
  await owner.goto('/'); await owner.getByRole('button', { name: 'Crear sala' }).click();
  const invite = await owner.getByLabel('Enlace para compartir').inputValue();
  const contexts = [
    await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
    await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }),
  ];
  const players = await Promise.all(contexts.map(context => context.newPage()));
  const assetResponses: Record<string, number[]> = {};
  for (const player of players) player.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (['/semilla.png', '/pajaro-derecha.png', '/pajaro-izquierda.png'].includes(path)) (assetResponses[path] ??= []).push(response.status());
  });
  for (const [i, player] of players.entries()) {
    await player.goto(invite); await player.getByLabel('Tu nombre').fill(`Camino ${i + 1}`); await player.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(player.locator('.player-card')).toContainText(`Camino ${i + 1}`);
  }
  await owner.reload();
  await expect(owner.getByRole('button', { name: 'Iniciar partida' })).toBeEnabled();
  await owner.getByRole('button', { name: 'Iniciar partida' }).click();
  for (const player of players) await expect(player).toHaveURL(/\/camino\?room=/);
  await expect(owner.getByText('La partida comenzó: El Camino.')).toBeVisible();
  const quickPlayer = players[0]; const patientPlayer = players[1];
  const lateContext = await browser.newContext(); const late = await lateContext.newPage();

  for (const player of players) {
    await expect(player.locator('.field-seed')).toHaveCount(10);
    await expect(player.locator('.field-soil')).toBeVisible();
    const field = player.locator('.playfield');
    const geometry = await player.evaluate(() => {
      const field = document.querySelector('.playfield')!.getBoundingClientRect();
      const soil = document.querySelector('.field-soil')!.getBoundingClientRect();
      const seeds = [...document.querySelectorAll('.field-seed')].map(seed => (seed as HTMLElement).getBoundingClientRect());
      return {
        field: { top: field.top, bottom: field.bottom, left: field.left, right: field.right },
        soil: { top: soil.top, bottom: soil.bottom, left: soil.left, right: soil.right },
        seeds: seeds.map(seed => ({ top: seed.top, bottom: seed.bottom, left: seed.left, right: seed.right, centerY: seed.top + seed.height / 2 })),
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
      };
    });
    expect(geometry.scrollY).toBe(0);
    expect(geometry.seeds).toHaveLength(10);
    for (const seed of geometry.seeds) {
      expect(seed.centerY).toBeGreaterThanOrEqual(geometry.soil.top);
      expect(seed.centerY).toBeLessThanOrEqual(geometry.soil.bottom);
      expect(seed.top).toBeGreaterThanOrEqual(geometry.field.top);
      expect(seed.bottom).toBeLessThanOrEqual(geometry.field.bottom);
    }
    expect(geometry.seeds[0].left).toBeGreaterThanOrEqual(geometry.field.left);
    expect(geometry.seeds[9].right).toBeLessThanOrEqual(geometry.field.right);
    expect(geometry.seeds.every(seed => seed.top >= 0 && seed.bottom <= geometry.viewportHeight)).toBe(true);
    await expect(player.locator('.field-seed').first()).toHaveAttribute('src', '/semilla.png');
    await expect(field).toBeInViewport();
  }
  const tapOneBird = async (page: Page) => {
    await expect.poll(() => page.locator('.field-bird').count(), { timeout: 15_000 }).toBeGreaterThan(0);
    const bird = page.locator('.field-bird').first();
    await expect(bird.locator('img')).toHaveAttribute('src', /pajaro-(derecha|izquierda)\.png/);
    await expect.poll(() => bird.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
    }), { timeout: 2_500 }).toBe(true);
    const appearance = await bird.evaluate(element => {
      const buttonStyle = getComputedStyle(element);
      const image = element.querySelector('img') as HTMLImageElement;
      const rect = element.getBoundingClientRect();
      return { background: buttonStyle.backgroundColor, boxShadow: buttonStyle.boxShadow, width: rect.width, height: rect.height, imageLoaded: image.complete && image.naturalWidth > 0, imageFilter: getComputedStyle(image).filter, scrollY };
    });
    expect(appearance.background).toBe('rgba(0, 0, 0, 0)');
    expect(appearance.boxShadow).toBe('none');
    expect(appearance.width).toBe(52);
    expect(appearance.height).toBe(52);
    expect(appearance.imageLoaded).toBe(true);
    expect(appearance.imageFilter).toBe('none');
    expect(appearance.scrollY).toBe(0);
    // The bird moves every frame; a real pointer press need not wait for Playwright's stability check.
    await bird.click({ force: true });
  };
  const quickProgress = quickPlayer.locator('.camino-progress');
  const initialResolved = Number((await quickProgress.innerText()).match(/Aves resueltas: (\d+) de 8/)?.[1] ?? 0);
  await tapOneBird(quickPlayer);
  // Confirm an authoritative resolved increment with all ten seeds still present.
  let successfulScares = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await expect(quickProgress).toContainText(new RegExp(`Aves resueltas: (?!${initialResolved}\\b)[1-8] de 8`), { timeout: 1_200 });
      successfulScares = Number((await quickProgress.innerText()).match(/Aves resueltas: (\d+) de 8/)?.[1] ?? 0) - initialResolved;
      break;
    } catch {
      if (await quickPlayer.locator('.field-bird').count() === 0) break;
      await tapOneBird(quickPlayer);
    }
  }
  expect(successfulScares).toBeGreaterThanOrEqual(1);
  await expect(quickPlayer.locator('.camino-counts')).toContainText('10');
  await late.goto(invite);
  await late.getByLabel('Tu nombre').fill('Llegó tarde'); await late.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(late.getByRole('alert')).toContainText('No pudimos completar');
  await quickPlayer.reload();
  await expect(quickPlayer.locator('.camino-counts')).toBeVisible({ timeout: 15_000 });
  await expect(quickPlayer.getByText(/Aves resueltas: [1-8] de 8/)).toBeVisible({ timeout: 15_000 });
  await expect(quickPlayer.locator('.camino-counts')).not.toContainText('11 semillas');
  await expect(patientPlayer.locator('.camino-counts')).toContainText('9 semillas', { timeout: 15_000 });

  const quickProgressAfterReload = await quickPlayer.locator('.camino-progress').innerText();
  expect(Number(quickProgressAfterReload.match(/Aves resueltas: (\d+) de 8/)?.[1] ?? 0) - initialResolved).toBeGreaterThanOrEqual(successfulScares);
  const expectedQuickSurvivors = 2 + successfulScares;
  await expect(quickPlayer).toHaveURL(new RegExp(`/pedregal\\?room=.*survivors=${expectedQuickSurvivors}$`), { timeout: 100_000 });
  await expect(quickPlayer.getByText(`Semillas que llegaron con vos: ${expectedQuickSurvivors}.`)).toBeVisible();
  await expect(patientPlayer).toHaveURL(/\/pedregal\?room=.*survivors=2/, { timeout: 100_000 });
  await expect(patientPlayer.getByText('Semillas que llegaron con vos: 2.')).toBeVisible();
  expect(assetResponses['/semilla.png']).toContain(200);
  expect(assetResponses['/pajaro-derecha.png']).toContain(200);
  expect(assetResponses['/pajaro-izquierda.png']).toContain(200);
  await expect(quickPlayer.locator('.completion')).toHaveCount(0);
  await expect(patientPlayer.locator('.completion')).toHaveCount(0);
  await Promise.all([ownerContext.close(), ...contexts.map(context => context.close()), lateContext.close()]);
});
