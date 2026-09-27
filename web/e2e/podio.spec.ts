import { expect, test } from '@playwright/test';
test('publishes one final podium to two participants, authorizes reset, and permits a replay', async ({ browser }) => {
  test.setTimeout(120_000);
  const ownerContext = await browser.newContext(); const owner = await ownerContext.newPage();
  await owner.goto('/'); await owner.getByRole('button', { name: 'Crear sala' }).click();
  const invite = await owner.getByLabel('Enlace para compartir').inputValue();
  const contexts = [await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }), await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })];
  const players = await Promise.all(contexts.map(context => context.newPage()));
  for (const [index, player] of players.entries()) {
    await player.goto(invite); await player.getByLabel('Tu nombre').fill(`Podio ${index + 1}`); await player.getByRole('button', { name: 'Entrar a la sala' }).click();
  }
  await owner.getByRole('button', { name: 'Iniciar partida' }).click();
  await Promise.all(players.map(async player => {
    await expect(player).toHaveURL(/\/pedregal\?room=.*survivors=2/, { timeout: 35_000 });
    const seedNumbers = (await player.locator('.pedregal-cell.seed').evaluateAll(cells => cells.map(cell => Number((cell.getAttribute('aria-label') ?? '').match(/^Casilla (\d+), semilla$/)?.[1])))).filter(Number.isFinite);
    expect(seedNumbers).toHaveLength(2);
    await expect(player.locator('.pedregal-cell.covered')).toHaveCount(25, { timeout: 5_000 });
    for (const number of seedNumbers) await player.getByRole('gridcell', { name: `Casilla ${number}, cubierta` }).click();
    await expect(player).toHaveURL(/\/espinos\?room=/, { timeout: 8_000 });
  }));
  const maze = players[0].getByLabel('Laberinto de espinas'); const bounds = await maze.boundingBox();
  if (!bounds) throw new Error('Maze has no bounds');
  const path = [[.1,.84],[.1,.64],[.34,.64],[.34,.40],[.66,.40],[.66,.64],[.90,.64],[.90,.42],[.90,.20]];
  await players[0].mouse.move(bounds.x + path[0][0] * bounds.width, bounds.y + path[0][1] * bounds.height);
  await players[0].mouse.down();
  for (const [x,y] of path.slice(1)) await players[0].mouse.move(bounds.x + x * bounds.width, bounds.y + y * bounds.height, { steps: 5 });
  await players[0].mouse.up();
  await expect(players[0]).toHaveURL(/\/buena-tierra\?room=/, { timeout: 8_000 });
  await players[0].getByRole('button', { name: /.+/ }).first().click();
  await expect(players[0].getByRole('heading', { name: 'Pregunta 2 de 2' })).toBeVisible();
  await players[0].getByRole('button', { name: /.+/ }).first().click();
  await expect(players[0].getByText(/Respuestas correctas:/)).toBeVisible();

  const eliminatedMaze = players[1].getByLabel('Laberinto de espinas'); const eliminatedBounds = await eliminatedMaze.boundingBox();
  if (!eliminatedBounds) throw new Error('Eliminated maze has no bounds');
  const safe = [ .1, .84 ]; const thorn = [ .5, .95 ];
  await players[1].mouse.move(eliminatedBounds.x + safe[0] * eliminatedBounds.width, eliminatedBounds.y + safe[1] * eliminatedBounds.height);
  await players[1].mouse.down();
  for (const [x,y] of [thorn, safe, thorn]) await players[1].mouse.move(eliminatedBounds.x + x * eliminatedBounds.width, eliminatedBounds.y + y * eliminatedBounds.height, { steps: 2 });
  await players[1].mouse.up();
  await expect(players[0]).toHaveURL(/\/podio\?room=/, { timeout: 10_000 });
  await expect(players[1]).toHaveURL(/\/podio\?room=/, { timeout: 10_000 });
  for (const player of players) await expect(player.getByRole('list').locator('li')).toHaveCount(2);
  await expect(owner).toHaveURL(/\/podio\?room=/, { timeout: 10_000 });
  const ownerRows = await owner.getByRole('list').locator('li').allTextContents();
  for (const player of players) await expect(player.getByRole('list').locator('li')).toHaveText(ownerRows);
  expect(ownerRows.join(' ')).toContain('400 puntos');
  expect(ownerRows.join(' ')).toContain('Eliminado');
  expect(ownerRows.join(' ')).toContain('0 puntos');
  const unauthorized = await owner.evaluate(async () => await new Promise<{ type: string; code: string }>((resolve, reject) => {
    const socket = new WebSocket('ws://127.0.0.1:3199/ws');
    const timer = setTimeout(() => reject(new Error('Unauthorized finalization did not respond')), 2_000);
    socket.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'welcome') socket.send(JSON.stringify({ type: 'finalizeGame' }));
      else if (message.type === 'error') { clearTimeout(timer); socket.close(); resolve(message); }
    };
    socket.onerror = () => reject(new Error('Could not open authorization probe'));
  }));
  expect(unauthorized).toMatchObject({ type: 'error', code: 'forbidden' });
  await expect(owner.getByRole('list').locator('li')).toHaveCount(2);
  await expect(players[0].getByRole('button', { name: 'Finalizar partida' })).toHaveCount(0);
  await owner.getByRole('button', { name: 'Finalizar partida' }).click();
  await expect(owner.getByRole('button', { name: 'Iniciar partida' })).toBeEnabled({ timeout: 10_000 });
  for (const player of players) await expect(player.locator('.player-card')).toContainText(/Podio [12]/, { timeout: 10_000 });
  await expect(owner.locator('.presence.connected')).toHaveCount(2, { timeout: 10_000 });
  await owner.getByRole('button', { name: 'Iniciar partida' }).click();
  for (const player of players) await expect(player).toHaveURL(/\/camino\?room=/, { timeout: 10_000 });
  await Promise.all([ownerContext.close(), ...contexts.map(context => context.close())]);
});
