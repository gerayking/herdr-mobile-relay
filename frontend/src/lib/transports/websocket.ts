import { E2EE_SUBPROTOCOL, type E2EEWireFrame } from '../e2ee';
import type { RelayConfig } from '../types';
import { createEncryptedTransport, type TransportAuthentication } from './encrypted';
import type {
  FrameChannel,
  FrameChannelHandlers,
  RelayTransport,
  TransportHandlers,
} from './types';

/**
 * The relay closes with this application code when it refuses a device's
 * credential. It matches `transport.UnauthorizedCloseCode` on the relay.
 */
export const UNAUTHORIZED_CLOSE_CODE = 4401;
export const WEBSOCKET_CONNECT_TIMEOUT_MS = 10_000;

/**
 * The original direct browser WebSocket path: the phone reaches the relay over
 * whatever URL the relay published (a Cloudflare tunnel, a LAN address). The
 * encrypted session rides the legacy JSON text envelope so relays that predate
 * the binary codec keep working unchanged.
 */
export function createWebSocketTransport(
  relay: RelayConfig,
  handlers: TransportHandlers,
  authentication: TransportAuthentication = {},
): RelayTransport {
  return createEncryptedTransport({
    kind: 'websocket',
    token: relay.token,
    codec: 'json',
    handlers,
    ...authentication,
    createChannel: (channelHandlers, encrypted) => createWebSocketChannel(
      relay,
      channelHandlers,
      encrypted,
    ),
  });
}

function createWebSocketChannel(
  relay: RelayConfig,
  handlers: FrameChannelHandlers,
  encrypted: boolean,
): FrameChannel {
  let socket: WebSocket | null = null;
  let closed = false;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;

  function clearConnectTimer(): void {
    if (connectTimer === null) return;
    clearTimeout(connectTimer);
    connectTimer = null;
  }

  function fail(reason: string): void {
    if (closed) return;
    closed = true;
    clearConnectTimer();
    socket?.close();
    handlers.onClose({ reason });
  }

  return {
    kind: 'websocket',
    codec: 'json',
    open(): void {
      if (closed || socket) return;
      try {
        socket = encrypted
          ? new WebSocket(relay.url, E2EE_SUBPROTOCOL)
          : new WebSocket(relay.url);
      } catch {
        fail('Relay connection failed');
        return;
      }
      connectTimer = setTimeout(() => fail('Relay connection timed out'), WEBSOCKET_CONNECT_TIMEOUT_MS);
      socket.onopen = () => {
        if (closed) return;
        clearConnectTimer();
        // A relay that ignores the encrypted subprotocol would otherwise get a
        // plaintext hello, so refuse the socket before anything is sent.
        if (encrypted
          && typeof socket?.protocol === 'string'
          && socket.protocol !== E2EE_SUBPROTOCOL) {
          fail('Relay did not negotiate encrypted transport');
          return;
        }
        handlers.onOpen();
      };
      socket.onmessage = (event) => {
        if (closed) return;
        handlers.onFrame(String(event.data));
      };
      socket.onerror = () => {
        fail('Relay connection failed');
      };
      socket.onclose = (event) => {
        if (closed) return;
        closed = true;
        clearConnectTimer();
        // 4401: the relay refuses this device's credential. Retrying replays
        // the same rejected material, so the path manager must not.
        if (event?.code === UNAUTHORIZED_CLOSE_CODE) {
          handlers.onClose({
            reason: 'This relay no longer accepts this device',
            fatal: true,
            code: 'device_unauthorized',
          });
          return;
        }
        handlers.onClose({ reason: 'Relay disconnected' });
      };
    },
    sendFrame(frame: E2EEWireFrame): void {
      if (closed || socket?.readyState !== WebSocket.OPEN) return;
      socket.send(frame);
    },
    close(): void {
      closed = true;
      clearConnectTimer();
      socket?.close();
    },
  };
}
