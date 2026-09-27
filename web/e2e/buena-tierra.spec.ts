import { expect, test } from '@playwright/test';
test('two players progress independently into server-authoritative La Buena Tierra trivia', async ({ browser }) => {
  test.setTimeout(120_000);
  const ownerContext = await browser.newContext(); const owner = await ownerContext.newPage();
  await owner.goto('/'); await owner.getByRole('button', { name: 'Crear sala' }).click();
  const invite = await owner.getByLabel('Enlace para compartir').inputValue();
  const contexts = [await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }), await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true })];
  const players = await Promise.all(contexts.map(context => context.newPage()));
  try {
    for (const [index, player] of players.entries()) { await player.goto(invite); await player.getByLabel('Tu nombre').fill(`Buena Tierra ${index + 1}`); await player.getByRole('button', { name: 'Entrar a la sala' }).click(); }
    await owner.getByRole('button', { name: 'Iniciar partida' }).click();
    await Promise.all(players.map(async player => {
      await expect(player).toHaveURL(/\/pedregal\?room=.*survivors=2/, { timeout: 35_000 });
      const board = player.getByRole('grid', { name: 'Tablero de memoria 5 por 5' });
      await expect(board).toBeVisible();
      await expect.poll(async () => player.locator('.pedregal-cell.seed').count(), { timeout: 5_000 }).toBe(2);
      const labels = await player.locator('.pedregal-cell.seed').evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-label') ?? ''));
      for (const label of labels) {
        const number = Number(label.match(/^Casilla (\d+), semilla$/)?.[1]);
        await player.getByRole('gridcell', { name: `Casilla ${number}, cubierta` }).click();
      }
    }));
    await Promise.all(players.map(player => expect(player).toHaveURL(/\/espinos\?room=/, { timeout: 10_000 })));
    const maze = players[0].getByLabel('Laberinto de espinas');
    const bounds = await maze.boundingBox(); if (!bounds) throw new Error('Maze has no bounds');
    const route = [[.1,.84],[.1,.64],[.34,.64],[.34,.40],[.66,.40],[.66,.64],[.90,.64],[.90,.42],[.90,.20]];
    await players[0].mouse.move(bounds.x + route[0][0] * bounds.width, bounds.y + route[0][1] * bounds.height);
    await players[0].mouse.down();
    for (const [x,y] of route.slice(1)) await players[0].mouse.move(bounds.x + x * bounds.width, bounds.y + y * bounds.height, { steps: 5 });
    await players[0].mouse.up();
    await expect(players[0]).toHaveURL(/\/buena-tierra\?room=/, { timeout: 5_000 });
    await expect(players[1]).toHaveURL(/\/espinos\?room=/);
    await expect(players[0].getByRole('heading', { name: 'Pregunta 1 de 2' })).toBeVisible();
    await expect(players[0].getByRole('group', { name: 'Opciones de respuesta' }).getByRole('button')).toHaveCount(3);
    await players[0].getByRole('group', { name: 'Opciones de respuesta' }).getByRole('button').first().click();
    await expect(players[0].getByRole('heading', { name: 'Pregunta 2 de 2' })).toBeVisible();
    await players[0].getByRole('group', { name: 'Opciones de respuesta' }).getByRole('button').first().click();
    await expect(players[0].getByText(/^Respuestas correctas: \d de 2\.$/)).toBeVisible();
    await expect(players[0].getByRole('img', { name: /Planta (marchita|mediana|grande)/ })).toBeVisible();
    await expect(players[1]).toHaveURL(/\/espinos\?room=/);
  } finally { await Promise.all([ownerContext.close(), ...contexts.map(context => context.close())]); }
});
