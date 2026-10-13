import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebSocketTransport, WEBSOCKET_CONNECT_TIMEOUT_MS } from '$lib/transports/websocket';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => { this.readyState = 3; });
  send = vi.fn();
  constructor() { Socket.instances.push(this); }
  open(): void { this.readyState = Socket.OPEN; this.onopen?.(); }
}

describe('WebSocket connection deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Socket.instances = [];
    vi.stubGlobal('WebSocket', Socket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function connect() {
    const onStatus = vi.fn();
    const transport = createWebSocketTransport({
      id: 'test', label: 'Test', url: 'wss://relay.example/ws', token: '',
    }, { onStatus, onMessage: vi.fn() });
    transport.connect();
    return { transport, onStatus, socket: Socket.instances[0] };
  }

  it('closes a dial that never opens and ignores a late open event', async () => {
    const { socket, onStatus } = connect();
    await vi.advanceTimersByTimeAsync(WEBSOCKET_CONNECT_TIMEOUT_MS - 1);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.close).toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith('closed', { reason: 'Relay connection timed out' });
    socket.onopen?.();
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['connecting', 'closed']);
  });

  it('keeps an opened connection after its original deadline', async () => {
    const { socket, transport, onStatus } = connect();
    await vi.advanceTimersByTimeAsync(WEBSOCKET_CONNECT_TIMEOUT_MS - 1);
    socket.open();
    await vi.advanceTimersByTimeAsync(WEBSOCKET_CONNECT_TIMEOUT_MS * 2);
    expect(socket.close).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith('connected', { path: 'websocket' });
    expect(transport.send({ type: 'refresh_agents' })).toBe(true);
    expect(socket.send).toHaveBeenCalledWith('{"type":"refresh_agents"}');
    transport.close();
  });

  it('clears the deadline when the owner closes the transport', async () => {
    const { socket, transport, onStatus } = connect();
    transport.close();
    await vi.advanceTimersByTimeAsync(WEBSOCKET_CONNECT_TIMEOUT_MS * 2);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['connecting']);
  });

  it.each(['error', 'close'] as const)('reports an early %s only once', async (event) => {
    const { socket, onStatus } = connect();
    if (event === 'error') socket.onerror?.();
    else socket.onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(WEBSOCKET_CONNECT_TIMEOUT_MS * 2);
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['connecting', 'closed']);
  });
});
