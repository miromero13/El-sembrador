import { expect, test } from '@playwright/test';
test('two players enter independent server-authoritative Espinos runs and one reaches La Buena Tierra', async ({ browser }) => {
  test.setTimeout(100_000);
  const ownerContext = await browser.newContext(); const owner = await ownerContext.newPage();
  await owner.goto('/'); await owner.getByRole('button', { name: 'Crear sala' }).click();
  const invite = await owner.getByLabel('Enlace para compartir').inputValue();
  const contexts = [await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }), await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true })];
  const players = await Promise.all(contexts.map(context => context.newPage()));
  for (const [index, player] of players.entries()) { await player.goto(invite); await player.getByLabel('Tu nombre').fill(`Espinos ${index + 1}`); await player.getByRole('button', { name: 'Entrar a la sala' }).click(); }
  await owner.getByRole('button', { name: 'Iniciar partida' }).click();
  await Promise.all(players.map(async player => {
    await expect(player).toHaveURL(/\/pedregal\?room=.*survivors=2/, { timeout: 35_000 });
    const board = player.getByRole('grid', { name: 'Tablero de memoria 5 por 5' });
    await expect(board).toBeVisible();
    const seedLabels = await player.locator('.pedregal-cell.seed').evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-label') ?? ''));
    const seedNumbers = seedLabels.map(label => Number(label.match(/^Casilla (\d+), semilla$/)?.[1])).filter(Number.isFinite);
    expect(seedNumbers).toHaveLength(2);
    await expect(player.locator('.pedregal-cell.covered')).toHaveCount(25, { timeout: 5_000 });
    // Recover both previewed seeds so this participant enters with lives.
    for (const number of seedNumbers) {
      await player.getByRole('gridcell', { name: `Casilla ${number}, cubierta` }).click();
      await expect.poll(async () => player.url().includes('/espinos') || await player.getByRole('gridcell', { name: `Casilla ${number}, semilla` }).count() === 1, { timeout: 5_000 }).toBe(true);
    }
  }));
  await expect(players[0]).toHaveURL(/\/espinos\?room=/, { timeout: 10_000 });
  await expect(players[1]).toHaveURL(/\/espinos\?room=/, { timeout: 10_000 });
  const maze = players[0].getByLabel('Laberinto de espinas');
  await expect(players[0].getByText('Cantidad de semillas')).toBeVisible();
  const bounds = await maze.boundingBox(); if (!bounds) throw new Error('Maze has no bounds');
  const path = [[.1,.84],[.1,.64],[.34,.64],[.34,.40],[.66,.40],[.66,.64],[.90,.64],[.90,.42],[.90,.20]];
  await players[0].mouse.move(bounds.x + path[0][0] * bounds.width, bounds.y + path[0][1] * bounds.height);
  await players[0].mouse.down();
  for (const [x,y] of path.slice(1)) await players[0].mouse.move(bounds.x + x * bounds.width, bounds.y + y * bounds.height, { steps: 5 });
  await players[0].mouse.up();
  await expect(players[0]).toHaveURL(/\/buena-tierra\?room=/, { timeout: 5_000 });
  await expect(players[1]).toHaveURL(/\/espinos\?room=/);
  await Promise.all([ownerContext.close(), ...contexts.map(context => context.close())]);
});
