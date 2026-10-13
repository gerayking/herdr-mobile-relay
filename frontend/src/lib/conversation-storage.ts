import { get, writable } from 'svelte/store';
import type { ConversationPreview } from './conversation-cache';
import type { TerminalPreview } from './terminal-cache';
import type { Agent, RelayConfig } from './types';
import { targetRefForAgent } from './resource-id';

export const CONVERSATION_STORAGE_KEY = 'herdr_conversation_cache_enabled';
export const CONVERSATION_STORAGE_DB = 'herdr-conversation-cache';
export const CONVERSATION_STORAGE_TTL_MS = 7 * 24 * 60 * 60_000;
const MAX_IDENTITIES = 30;
const MAX_BYTES = 24 * 1024 * 1024;
const AGENT_PREVIEW_PREFIX = 'herdr_agent_preview_v1:';
const AGENT_PREVIEW_FIELDS = [
  'agent', 'name', 'session', 'session_name', 'project', 'cwd', 'host',
  'server_session_id', 'terminal_id', 'agent_session_id', 'tab_id', 'tab_label', 'workspace_id',
] as const;

function relaySource(relay: RelayConfig): string {
  return JSON.stringify([relay.url, relay.transport || 'websocket', relay.gatewayUrl || '', relay.gatewayRelayId || '']);
}

function agentPreview(agent: Agent, relay: RelayConfig): Agent | null {
  if (!agent || typeof agent.raw_pane_id !== 'string' || !targetRefForAgent(agent) || agent.relay_id !== relay.id) return null;
  const result: Agent = {
    relay_id: relay.id, relay_label: relay.label,
    raw_pane_id: agent.raw_pane_id, pane_id: `${relay.id}::${agent.raw_pane_id}`,
    cachedPreview: true, status: 'unknown', generation: agent.generation,
    conversation_history_available: agent.conversation_history_available === true,
  };
  for (const key of AGENT_PREVIEW_FIELDS) {
    if (typeof agent[key] === 'string') result[key] = agent[key].slice(0, 4096);
  }
  for (const key of ['tab_number', 'tab_order'] as const) {
    if (Number.isSafeInteger(agent[key])) result[key] = agent[key];
  }
  return result;
}

export function loadAgentPreviews(relays: RelayConfig[]): Agent[] {
  if (!enabled()) return [];
  const result: Agent[] = [];
  for (const relay of relays) {
    const key = AGENT_PREVIEW_PREFIX + relay.id;
    try {
      const raw = localStorage.getItem(key);
      if (!raw || raw.length > 256 * 1024) continue;
      const saved = JSON.parse(raw);
      if (saved.source !== relaySource(relay) || !Number.isFinite(saved.savedAt)
        || Date.now() - saved.savedAt >= CONVERSATION_STORAGE_TTL_MS || !Array.isArray(saved.agents)) {
        localStorage.removeItem(key);
        continue;
      }
      const byPane = new Map<string, Agent>();
      for (const value of saved.agents.slice(0, 100)) {
        const preview = agentPreview(value, relay);
        if (preview) byPane.set(preview.pane_id, preview);
      }
      result.push(...byPane.values());
    } catch { /* A damaged startup snapshot must not block a fresh connection. */ }
  }
  return result;
}

export function saveAgentPreviews(relay: RelayConfig, agents: Agent[]): void {
  if (!enabled()) return;
  try {
    const previews = agents.slice(0, 100).map(agent => agentPreview(agent, relay)).filter(Boolean);
    const key = AGENT_PREVIEW_PREFIX + relay.id;
    const source = relaySource(relay);
    const previous = JSON.parse(localStorage.getItem(key) || 'null');
    if (previous?.source === source && Date.now() - previous.savedAt < 60_000
      && JSON.stringify(previous.agents) === JSON.stringify(previews)) return;
    const encoded = JSON.stringify({ source, savedAt: Date.now(), agents: previews });
    if (encoded.length <= 256 * 1024) localStorage.setItem(key, encoded);
  } catch { /* Conversation storage and live loading can still proceed. */ }
}

function clearAgentPreviews(relayId?: string): void {
  try {
    if (relayId) localStorage.removeItem(AGENT_PREVIEW_PREFIX + relayId);
    else {
      const keys: string[] = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(AGENT_PREVIEW_PREFIX)) keys.push(key);
      }
      for (const key of keys) localStorage.removeItem(key);
    }
  } catch { conversationStorageError.set('Could not clear the saved agent list.'); }
}

interface Metadata {
  identity: string;
  relayId: string;
  savedAt: number;
  lastUsed: number;
  bytes: number;
}

function savedEnabled(): boolean {
  try { return localStorage.getItem(CONVERSATION_STORAGE_KEY) !== 'false'; }
  catch { return false; }
}

export const conversationStorageEnabled = writable(savedEnabled());
export const conversationStorageError = writable('');
let epoch = 0;
let database: Promise<IDBDatabase | null> | undefined;

function enabled(): boolean {
  return get(conversationStorageEnabled) && savedEnabled();
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (database) return database;
  database = new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) { db?.close(); return; }
      settled = true;
      clearTimeout(timeout);
      resolve(db);
    };
    const timeout = setTimeout(() => finish(null), 1500);
    try {
      const request = indexedDB.open(CONVERSATION_STORAGE_DB, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('previews', { keyPath: 'identity' });
        request.result.createObjectStore('metadata', { keyPath: 'identity' });
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        finish(db);
      };
    } catch { finish(null); }
  });
  return database;
}

async function transaction<T>(fallback: T, run: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  if (!db) {
    conversationStorageError.set('Local conversation and terminal storage is unavailable in this browser.');
    return fallback;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['previews', 'metadata'], 'readwrite');
      let result = fallback;
      tx.oncomplete = () => { conversationStorageError.set(''); resolve(result); };
      tx.onabort = tx.onerror = () => {
        conversationStorageError.set('Could not access saved conversations and terminals.');
        resolve(fallback);
      };
      run(tx, (value) => { result = value; });
    } catch {
      conversationStorageError.set('Could not access saved conversations and terminals.');
      resolve(fallback);
    }
  });
}

async function loadSavedPreview<T extends ConversationPreview | TerminalPreview>(identity: string): Promise<T | null> {
  if (!enabled()) return null;
  const started = epoch;
  const preview = await transaction<T | null>(null, (tx, result) => {
    const metadata = tx.objectStore('metadata');
    const previews = tx.objectStore('previews');
    const request = metadata.get(identity);
    request.onsuccess = () => {
      if (!enabled() || epoch !== started) return;
      const record = request.result as Metadata | undefined;
      if (!record || !Number.isFinite(record.savedAt) || Date.now() - record.savedAt >= CONVERSATION_STORAGE_TTL_MS) {
        metadata.delete(identity);
        previews.delete(identity);
        return;
      }
      metadata.put({ ...record, lastUsed: Date.now() });
      const content = previews.get(identity);
      content.onsuccess = () => result(content.result || null);
    };
  });
  return enabled() && epoch === started ? preview : null;
}

/** Callers bound the content before opening the transaction. */
async function savePreview(preview: ConversationPreview | TerminalPreview, bytes: number): Promise<void> {
  if (!enabled() || bytes > MAX_BYTES) return;
  const started = epoch;
  await transaction(false, (tx, result) => {
    const metadata = tx.objectStore('metadata');
    const previews = tx.objectStore('previews');
    const request = metadata.getAll();
    request.onsuccess = () => {
      if (!enabled() || epoch !== started) return;
      const now = Date.now();
      const retained: Metadata[] = [];
      for (const record of request.result as Metadata[]) {
        if (record.identity === preview.identity) continue;
        if (now - record.savedAt >= CONVERSATION_STORAGE_TTL_MS) {
          metadata.delete(record.identity);
          previews.delete(record.identity);
        } else retained.push(record);
      }
      retained.sort((a, b) => a.lastUsed - b.lastUsed);
      let total = bytes + retained.reduce((sum, record) => sum + record.bytes, 0);
      while (retained.length >= MAX_IDENTITIES || total > MAX_BYTES) {
        const oldest = retained.shift();
        if (!oldest) break;
        total -= oldest.bytes;
        metadata.delete(oldest.identity);
        previews.delete(oldest.identity);
      }
      previews.put(preview);
      metadata.put({ identity: preview.identity, relayId: preview.relayId, savedAt: preview.savedAt, lastUsed: now, bytes } satisfies Metadata);
      result(true);
    };
  });
}

export const loadSavedConversationPreview = (identity: string) => loadSavedPreview<ConversationPreview>(identity);
export const loadSavedTerminalPreview = (identity: string) => loadSavedPreview<TerminalPreview>(identity);
export const saveConversationPreview = (preview: ConversationPreview, bytes: number) => savePreview(preview, bytes);
export const saveTerminalPreview = (preview: TerminalPreview, bytes: number) => savePreview(preview, bytes);

export async function clearSavedConversationPreviews(relayId?: string): Promise<boolean> {
  epoch++;
  clearAgentPreviews(relayId);
  return transaction(false, (tx, result) => {
    const metadata = tx.objectStore('metadata');
    const previews = tx.objectStore('previews');
    if (!relayId) {
      metadata.clear();
      previews.clear();
      result(true);
      return;
    }
    const request = metadata.getAll();
    request.onsuccess = () => {
      for (const record of request.result as Metadata[]) {
        if (record.relayId !== relayId) continue;
        metadata.delete(record.identity);
        previews.delete(record.identity);
      }
      result(true);
    };
  });
}

export async function setConversationStorageEnabled(value: boolean): Promise<void> {
  epoch++;
  try { localStorage.setItem(CONVERSATION_STORAGE_KEY, String(value)); }
  catch {
    if (!value) {
      conversationStorageEnabled.set(false);
      await clearSavedConversationPreviews();
    }
    conversationStorageError.set('Could not save the cache setting.');
    return;
  }
  conversationStorageEnabled.set(value);
  if (!value) await clearSavedConversationPreviews();
  else conversationStorageError.set('');
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== CONVERSATION_STORAGE_KEY && event.key !== null) return;
    epoch++;
    conversationStorageEnabled.set(savedEnabled());
    if (!savedEnabled() || event.key === null) void clearSavedConversationPreviews();
  });
}
