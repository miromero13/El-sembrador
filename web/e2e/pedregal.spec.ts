import { expect, test } from '@playwright/test';

test('two real players receive independent Camino-authorized Pedregal boards and recover lives', async ({ browser }) => {
  test.setTimeout(100_000);
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await owner.goto('/');
  await owner.getByRole('button', { name: 'Crear sala' }).click();
  const invite = await owner.getByLabel('Enlace para compartir').inputValue();
  const contexts = [await browser.newContext(), await browser.newContext()];
  const players = await Promise.all(contexts.map(context => context.newPage()));
  for (const [index, player] of players.entries()) {
    await player.goto(invite);
    await player.getByLabel('Tu nombre').fill(`Memoria ${index + 1}`);
    await player.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(player.locator('.player-card')).toContainText(`Memoria ${index + 1}`);
  }
  await owner.getByRole('button', { name: 'Iniciar partida' }).click();
  await expect(players[0]).toHaveURL(/\/camino\?room=/);
  await expect(players[0]).toHaveURL(/\/pedregal\?room=.*survivors=2/, { timeout: 75_000 });
  const first = players[0];
  const board = first.getByRole('grid', { name: 'Tablero de memoria 5 por 5' });
  const previewSeed = await first.locator('.pedregal-cell').evaluateAll(cells => cells.find(cell => cell.getAttribute('aria-label')?.endsWith('semilla'))?.getAttribute('aria-label'));
  expect(previewSeed).toBeTruthy();
  await expect(players[1]).toHaveURL(/\/pedregal\?room=.*survivors=2/, { timeout: 75_000 });
  await expect(board).toBeVisible();
  await expect(first.locator('.pedregal-cell')).toHaveCount(25);
  await expect(first.locator('.pedregal-cell img[src="/semilla.png"]')).toHaveCount(2);
  await expect(first.locator('.pedregal-counts')).toContainText('2');
  await expect(first.locator('.pedregal-cell.covered')).toHaveCount(25, { timeout: 5_000 });
  const seedNumber = previewSeed!.match(/^Casilla (\d+), semilla$/)![1];
  await first.getByRole('gridcell', { name: `Casilla ${seedNumber}, cubierta` }).click();
  await expect(first.locator('.pedregal-counts')).toContainText('1 vidas');
  await expect(first.getByText('Recuperadas: 1 de 2')).toBeVisible();
  await expect(players[1].locator('.pedregal-counts')).toContainText('2');
  await Promise.all([ownerContext.close(), ...contexts.map(context => context.close())]);
});
