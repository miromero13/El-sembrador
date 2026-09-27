import { expect, test } from '@playwright/test';
test('organizer invitation joins synchronized players and exposes a scannable public URL', async ({ browser }) => {
  const organizer = await browser.newContext(); const guest = await browser.newContext();
  const host = await organizer.newPage(); const player = await guest.newPage();
  await host.goto('/'); await host.getByRole('button', { name: 'Crear sala' }).click();
  await expect(host.getByRole('heading', { name: 'Invitá a quienes van a jugar' })).toBeVisible();
  const invite = host.getByLabel('Enlace para compartir').inputValue();
  const url = await invite; expect(url).toMatch(/\/?room=[A-Za-z0-9_-]+$/);
  expect(url).not.toContain('ownerCredential');
  await expect(host.getByRole('img', { name: 'Código QR de invitación a la sala' })).toBeVisible();
  await player.goto(url); await player.getByLabel('Tu nombre').fill('Ada'); await player.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(player.locator('.participant-list')).toContainText('Ada'); await expect(host.locator('.participant-list')).toContainText('Ada');
  await host.close(); await guest.close(); await organizer.close();
});
test('organizer reload recovery, connected-player start, late-join rejection, and member reconnect', async ({ browser }) => {
  const ownerContext = await browser.newContext(); const owner = await ownerContext.newPage();
  await owner.goto('/'); await owner.getByRole('button', { name: 'Crear sala' }).click();
  const invite = await owner.getByLabel('Enlace para compartir').inputValue();
  const roomId = new URL(invite).searchParams.get('room')!;
  const start = owner.getByRole('button', { name: 'Iniciar partida' });
  await expect(start).toBeDisabled();
  const playerContexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const players = await Promise.all(playerContexts.map(context => context.newPage()));
  for (const [index, player] of players.entries()) {
    await player.goto(invite); await player.getByLabel('Tu nombre').fill(`Player ${index + 1}`); await player.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(player.locator('.player-card')).toContainText(`Player ${index + 1}`);
    await expect(player.getByRole('button', { name: 'Iniciar partida' })).toHaveCount(0);
  }
  await expect(start).toBeEnabled();
  const ownerCredential = await owner.evaluate(id => sessionStorage.getItem(`sembrador.owner.${id}`), roomId);
  expect(ownerCredential).toBeTruthy();
  await owner.reload();
  await expect(owner.getByRole('heading', { name: 'Invitá a quienes van a jugar' })).toBeVisible();
  await expect(owner.getByRole('button', { name: 'Iniciar partida' })).toBeEnabled();
  await owner.getByRole('button', { name: 'Iniciar partida' }).click();
  await expect(owner.getByText('La partida comenzó: El Camino.')).toBeVisible();
  for (const player of players) await expect(player).toHaveURL(/\/camino\?room=/);
  const lateContext = await browser.newContext(); const late = await lateContext.newPage(); await late.goto(invite);
  await late.getByLabel('Tu nombre').fill('Late'); await late.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(late.getByRole('alert')).toContainText('No pudimos completar');
  await players[0].reload();
  await expect(players[0]).toHaveURL(/\/camino\?room=/);
  await expect(players[0].locator('.camino-counts')).toBeVisible({ timeout: 15_000 });
  await Promise.all([ownerContext.close(), ...playerContexts.map(context => context.close()), lateContext.close()]);
});

test('root reload resumes the newly created room instead of a stale stored owner room', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => sessionStorage.setItem('sembrador.owner.stale-room', 'stale-secret'));
  const owner = await context.newPage(); await owner.goto('/');
  await owner.getByRole('button', { name: 'Crear sala' }).click();
  const invite = await owner.getByLabel('Enlace para compartir').inputValue();
  const currentRoomId = new URL(invite).searchParams.get('room')!;
  const guests = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const [index, guest] of guests.entries()) {
    await guest.goto(invite); await guest.getByLabel('Tu nombre').fill(`Current guest ${index + 1}`); await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  }
  await expect(owner.locator('.participant-list')).toContainText('Current guest 1');
  await expect(owner.locator('.participant-list')).toContainText('Current guest 2');
  await owner.reload();
  await expect(owner.getByRole('heading', { name: 'Invitá a quienes van a jugar' })).toBeVisible();
  await expect(owner.getByLabel('Enlace para compartir')).toHaveValue(new RegExp(`room=${currentRoomId}$`));
  await expect(owner.locator('.participant-list')).toContainText('Current guest 1');
  await expect(owner.locator('.participant-list')).toContainText('Current guest 2');
  await expect(owner.getByRole('button', { name: 'Iniciar partida' })).toBeEnabled();
  expect(await owner.evaluate(id => sessionStorage.getItem(`sembrador.owner.${id}`), currentRoomId)).toBeTruthy();
  await Promise.all([context.close(), ...guests.map(guest => guest.context().close())]);
});

test('organizer transient socket loss recovers without losing guests or granting start to guests', async ({ browser }) => {
  const ownerContext = await browser.newContext();
  await ownerContext.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    let organizerSocket: WebSocket | undefined;
    class CapturedWebSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); }
      send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === 'string' && (data.includes('createRoom') || data.includes('resumeOwner'))) organizerSocket = this;
        super.send(data);
      }
    }
    window.WebSocket = CapturedWebSocket;
    (window as typeof window & { organizerSocketEvidence?: () => { exists: boolean; readyState: number | null; close: () => void } }).organizerSocketEvidence = () => ({
      exists: Boolean(organizerSocket), readyState: organizerSocket?.readyState ?? null, close: () => organizerSocket?.close(),
    });
  });
  const owner = await ownerContext.newPage(); await owner.goto('/'); await owner.getByRole('button', { name: 'Crear sala' }).click();
  const invite = await owner.getByLabel('Enlace para compartir').inputValue();
  const guestContexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const guests = await Promise.all(guestContexts.map(context => context.newPage()));
  for (const [index, guest] of guests.entries()) {
    await guest.goto(invite); await guest.getByLabel('Tu nombre').fill(`Guest ${index + 1}`); await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  }
  const start = owner.getByRole('button', { name: 'Iniciar partida' }); await expect(start).toBeEnabled();
  for (const guest of guests) await expect(guest.getByRole('button', { name: 'Iniciar partida' })).toHaveCount(0);
  const evidence = await owner.evaluate(() => (window as typeof window & { organizerSocketEvidence?: () => { exists: boolean; readyState: number | null; close: () => void } }).organizerSocketEvidence?.());
  expect(evidence?.exists, 'createRoom interception must capture organizer WebSocket').toBe(true);
  expect(evidence?.readyState).toBe(WebSocket.OPEN);
  await owner.evaluate(() => (window as typeof window & { organizerSocketEvidence?: () => { close: () => void } }).organizerSocketEvidence?.().close());
  await expect.poll(() => owner.evaluate(() => (window as typeof window & { organizerSocketEvidence?: () => { readyState: number | null } }).organizerSocketEvidence?.().readyState)).toBe(WebSocket.CLOSED);
  await expect(start).toBeDisabled();
  await expect(owner.locator('.lobby-error')).toContainText('Intentando recuperar');
  await expect(owner.locator('.participant-list')).toContainText('Guest 1');
  await expect(owner.locator('.participant-list')).toContainText('Guest 2');
  await expect(start).toBeEnabled({ timeout: 10_000 });
  await expect(owner.locator('.participant-list')).toContainText('Guest 1');
  await expect(owner.locator('.participant-list')).toContainText('Guest 2');
  await Promise.all([ownerContext.close(), ...guestContexts.map(context => context.close())]);
});

test('friendly missing-room and full-room errors for six players', async ({ browser }) => {
  const invalid = await browser.newPage(); await invalid.goto('/?room=not-a-real-room');
  await invalid.getByLabel('Tu nombre').fill('Invitado'); await invalid.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(invalid.getByRole('alert')).toContainText('No encontramos esa sala'); await invalid.context().close();
  const hostContext = await browser.newContext(); const host = await hostContext.newPage(); await host.goto('/'); await host.getByRole('button', { name: 'Crear sala' }).click();
  const url = await host.getByLabel('Enlace para compartir').inputValue();
  const contexts = [];
  for (let index = 0; index < 7; index++) {
    const context = await browser.newContext(); contexts.push(context); const page = await context.newPage(); await page.goto(url);
    await page.getByLabel('Tu nombre').fill(`Jugador ${index + 1}`); await page.getByRole('button', { name: 'Entrar a la sala' }).click();
    if (index < 6) await expect(page.locator('.participant-list')).toContainText(`Jugador ${index + 1}`);
    else await expect(page.getByRole('alert')).toContainText('sala está completa');
  }
  await expect(host.locator('.participant-list')).toContainText('Jugador 6');
  await Promise.all(contexts.map(context => context.close())); await hostContext.close();
});
test('transient guest socket loss reconnects without duplicate membership or errors', async ({ browser }) => {
  const hostContext = await browser.newContext(); const host = await hostContext.newPage();
  const ownerRoomStateFrames: string[] = [];
  host.on('websocket', socket => socket.on('framereceived', frame => {
    if (typeof frame.payload === 'string' && frame.payload.includes('roomState')) ownerRoomStateFrames.push(frame.payload);
  }));
  await host.goto('/'); await host.getByRole('button', { name: 'Crear sala' }).click();
  const url = await host.getByLabel('Enlace para compartir').inputValue();
  const guestContext = await browser.newContext();
  await guestContext.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    const nativeSetTimeout = window.setTimeout.bind(window);
    let retryTimer: (() => void) | undefined;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 500 && typeof handler === 'function' && handler.toString().includes('reconnect')) {
        retryTimer = () => handler(...args);
        return 0;
      }
      return nativeSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout;
    let lobbySocket: WebSocket | undefined;
    let closedEmitted = false;
    class CapturedWebSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); }
      send(data: string) {
        if (data.includes('"type":"joinRoom"')) {
          lobbySocket = this;
          this.addEventListener('close', () => { closedEmitted = true; }, { once: true });
        }
        super.send(data);
      }
    }
    window.WebSocket = CapturedWebSocket;
    (window as typeof window & { closeLobbySocket?: () => void; releaseRetry?: () => void; lobbySocketEvidence?: () => { exists: boolean; readyState: number | null; closedEmitted: boolean } }).lobbySocketEvidence = () => ({
      exists: Boolean(lobbySocket),
      readyState: lobbySocket?.readyState ?? null,
      closedEmitted,
    });
    (window as typeof window & { closeLobbySocket?: () => void; releaseRetry?: () => void }).closeLobbySocket = () => {
      lobbySocket?.close();
    };
    (window as typeof window & { releaseRetry?: () => void }).releaseRetry = () => retryTimer?.();
  });
  const guest = await guestContext.newPage(); await guest.goto(url); await guest.getByLabel('Tu nombre').fill('Luz'); await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(guest.locator('.player-card')).toContainText('Luz');
  await expect(guest.locator('.participant-list')).toContainText('Conectado');
  await expect(host.locator('.participant-list')).toContainText('Luz');
  const socketEvidence = await guest.evaluate(() => (window as typeof window & { lobbySocketEvidence?: () => { exists: boolean; readyState: number | null; closedEmitted: boolean } }).lobbySocketEvidence?.());
  expect(socketEvidence, 'joinRoom interception must capture the guest WebSocket').toMatchObject({ exists: true, readyState: WebSocket.OPEN, closedEmitted: false });
  await guest.evaluate(() => (window as typeof window & { closeLobbySocket?: () => void }).closeLobbySocket?.());
  await expect.poll(() => guest.evaluate(() => (window as typeof window & { lobbySocketEvidence?: () => { exists: boolean; readyState: number | null; closedEmitted: boolean } }).lobbySocketEvidence?.())).toMatchObject({ readyState: WebSocket.CLOSED, closedEmitted: true });
  expect(socketEvidence.readyState).toBe(WebSocket.OPEN);
  await expect(host.locator('.participant-list')).toContainText('Desconectado');
  expect(ownerRoomStateFrames.some(frame => frame.includes('connected') && frame.includes('false')), 'owner must receive a roomState frame marking the guest disconnected').toBe(true);
  await guest.evaluate(() => (window as typeof window & { releaseRetry?: () => void }).releaseRetry?.());
  await expect(host.locator('.participant-list')).toContainText('Conectado');
  await expect(host.locator('.participant-list')).toHaveCount(1);
  await expect(host.locator('.participant-list').getByText('Luz', { exact: true })).toHaveCount(1);
  await expect(guest.locator('.lobby-error')).toHaveCount(0);
  await guestContext.close(); await hostContext.close();
});
test('reload resumes the same player using its private tab credential', async ({ browser }) => {
  const hostContext = await browser.newContext(); const host = await hostContext.newPage(); await host.goto('/'); await host.getByRole('button', { name: 'Crear sala' }).click();
  const url = await host.getByLabel('Enlace para compartir').inputValue();
  const guestContext = await browser.newContext(); const guest = await guestContext.newPage(); await guest.goto(url);
  await guest.getByLabel('Tu nombre').fill('Luz'); await guest.getByRole('button', { name: 'Entrar a la sala' }).click(); await expect(guest.locator('.participant-list')).toContainText('Luz'); await expect(host.locator('.participant-list')).toContainText('Luz');
  expect(await guest.evaluate(() => window.sessionStorage.getItem('sembrador.reconnect.' + new URLSearchParams(location.search).get('room')))).toBeTruthy();
  await guest.reload(); await expect(guest.locator('.participant-list')).toContainText('Luz');
  await guestContext.close(); await hostContext.close();
});
