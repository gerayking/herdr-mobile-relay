import { describe, expect, it } from 'vitest';
import { terminalPreview, terminalPreviewIdentity } from '$lib/terminal-cache';
import { targetRefForAgent } from '$lib/resource-id';
import type { Agent, TerminalFrame } from '$lib/types';

const agent: Agent = {
  relay_id: 'relay-1', relay_label: 'Relay', pane_id: 'relay-1::pane-1', raw_pane_id: 'pane-1',
  server_session_id: 'primary', terminal_id: 'terminal-1', generation: 2, agent_session_id: 'session-1',
};
const frame: TerminalFrame = {
  paneId: agent.pane_id, target: targetRefForAgent(agent)!,
  content: '\u001b[32mSaved terminal\u001b[0m', format: 'ansi',
};

describe('terminal previews', () => {
  it('preserves raw ANSI and exact terminal identity with bounded metadata', () => {
    const preview = terminalPreview(agent, { ...frame, noEchoPrompt: 'stale prompt' });
    expect(preview?.frame.content).toBe(frame.content);
    expect(preview?.frame.target).toEqual(frame.target);
    expect(preview?.frame.noEchoPrompt).toBeUndefined();
    expect(preview?.identity.startsWith('terminal:')).toBe(true);
  });

  it.each([
    { terminal_id: 'replaced-terminal' }, { generation: 3 }, { agent_session_id: 'replaced-session' },
    { server_session_id: 'other-server' }, { relay_id: 'other-relay' }, { raw_pane_id: 'other-pane' },
  ])('isolates a changed target %j', (change) => {
    expect(terminalPreviewIdentity({ ...agent, ...change })).not.toBe(terminalPreviewIdentity(agent));
    expect(terminalPreview({ ...agent, ...change }, frame)).toBeNull();
  });

  it('rejects partial, unscoped, hidden-input, and unsupported frames', () => {
    for (const changed of [
      { resizeSettling: true }, { noEcho: true }, { target: undefined },
      { format: 'html' }, { paneId: 'other' }, { content: '' },
    ]) expect(terminalPreview(agent, { ...frame, ...changed })).toBeNull();
    expect(terminalPreviewIdentity({ ...agent, terminal_id: undefined })).toBe('');
  });

  it('keeps the latest complete rows and marks a bounded snapshot as truncated', () => {
    const content = Array.from({ length: 2500 }, (_, index) => `row-${index}`).join('\n');
    const preview = terminalPreview(agent, { ...frame, content });
    expect(preview?.frame.content.startsWith('row-500\n')).toBe(true);
    expect(preview?.frame.content.endsWith('row-2499')).toBe(true);
    expect(preview?.frame.content.split('\n')).toHaveLength(2000);
    expect(preview?.frame.truncated).toBe(true);
    const large = terminalPreview(agent, { ...frame, content: 'X'.repeat(2 * 1024 * 1024) + '\nlatest row' });
    expect(large?.frame.content).toBe('latest row');
    expect(terminalPreview(agent, { ...frame, content: 'X'.repeat(2 * 1024 * 1024) })).toBeNull();
  });
});
