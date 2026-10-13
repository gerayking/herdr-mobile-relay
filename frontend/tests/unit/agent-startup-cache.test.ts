import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSavedConversationPreviews, conversationStorageEnabled, loadAgentPreviews,
  saveAgentPreviews, setConversationStorageEnabled, CONVERSATION_STORAGE_TTL_MS,
} from '$lib/conversation-storage';
import type { Agent, RelayConfig } from '$lib/types';

const relay: RelayConfig = { id: 'relay-1', label: 'Relay', url: 'wss://relay.example', token: '' };
const agent: Agent = {
  relay_id: relay.id, relay_label: relay.label, pane_id: 'relay-1::pane-1', raw_pane_id: 'pane-1',
  server_session_id: 'primary', terminal_id: 'terminal-1', generation: 2, agent_session_id: 'session-1',
  agent: 'codex', project: 'Project', cwd: '/workspace', conversation_history_available: true,
  status: 'blocked', prompt: 'private approval', options: ['Approve'], interaction: null,
};

beforeEach(() => {
  localStorage.clear();
  conversationStorageEnabled.set(true);
});

describe('agent startup previews', () => {
  it('restores exact identity and display fields without old approvals or live status', () => {
    saveAgentPreviews(relay, [agent]);
    const saved = loadAgentPreviews([relay]);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      pane_id: agent.pane_id, agent_session_id: 'session-1', generation: 2,
      project: 'Project', cwd: '/workspace', cachedPreview: true, status: 'unknown',
    });
    expect(saved[0].prompt).toBeUndefined();
    expect(saved[0].options).toBeUndefined();
    expect(saved[0].interaction).toBeUndefined();
    expect(JSON.stringify(localStorage)).not.toContain('private approval');
  });

  it('rejects expired, malformed, and different-relay snapshots', () => {
    saveAgentPreviews(relay, [agent]);
    const key = 'herdr_agent_preview_v1:' + relay.id;
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.savedAt = Date.now() - CONVERSATION_STORAGE_TTL_MS - 1;
    localStorage.setItem(key, JSON.stringify(saved));
    expect(loadAgentPreviews([relay])).toEqual([]);
    localStorage.setItem(key, '{');
    expect(loadAgentPreviews([relay])).toEqual([]);
    saveAgentPreviews(relay, [agent]);
    expect(loadAgentPreviews([{ ...relay, url: 'wss://different.example' }])).toEqual([]);
  });

  it('bounds and deduplicates snapshots and accepts an authoritative empty list', () => {
    saveAgentPreviews(relay, Array.from({ length: 150 }, () => agent));
    expect(loadAgentPreviews([relay])).toHaveLength(1);
    saveAgentPreviews(relay, []);
    expect(loadAgentPreviews([relay])).toEqual([]);
  });

  it('clears startup metadata on disable and relay removal, and does not write while disabled', async () => {
    saveAgentPreviews(relay, [agent]);
    await clearSavedConversationPreviews(relay.id);
    expect(loadAgentPreviews([relay])).toEqual([]);
    saveAgentPreviews(relay, [agent]);
    await setConversationStorageEnabled(false);
    expect(localStorage.getItem('herdr_agent_preview_v1:' + relay.id)).toBeNull();
    saveAgentPreviews(relay, [agent]);
    expect(loadAgentPreviews([relay])).toEqual([]);
    await setConversationStorageEnabled(true);
    expect(loadAgentPreviews([relay])).toEqual([]);
  });
});
