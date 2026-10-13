import { loadSavedTerminalPreview, saveTerminalPreview } from './conversation-storage';
import { targetRefForAgent, targetRefMatchesAgent, targetStoreKey } from './resource-id';
import type { Agent, TerminalFrame } from './types';

const MAX_CONTENT_CHARS = 1024 * 1024;
const MAX_LINES = 2000;

export interface TerminalPreview {
  identity: string;
  relayId: string;
  savedAt: number;
  frame: TerminalFrame;
}

export function terminalPreviewIdentity(agent: Agent): string {
  const target = targetRefForAgent(agent);
  const key = target && targetStoreKey(target);
  return key ? `terminal:${key}` : '';
}

export function terminalPreview(agent: Agent, frame: TerminalFrame, savedAt = Date.now()): TerminalPreview | null {
  const identity = terminalPreviewIdentity(agent);
  const target = targetRefForAgent(agent);
  if (!identity || !target || !frame?.target || !targetRefMatchesAgent(frame.target, agent)
    || frame.paneId !== agent.pane_id || frame.noEcho || frame.resizeSettling
    || !['ansi', 'plain'].includes(frame.format) || typeof frame.content !== 'string'
    || !frame.content || !Number.isFinite(savedAt)) return null;

  // Keep complete recent rows, never the middle of an ANSI escape sequence.
  let start = 0;
  let end = frame.content.length;
  for (let lines = 0; lines < MAX_LINES; lines++) {
    const newline = frame.content.lastIndexOf('\n', end - 1);
    if (newline < 0) break;
    end = newline;
    if (lines === MAX_LINES - 1) start = newline + 1;
  }
  if (frame.content.length - start > MAX_CONTENT_CHARS) {
    const newline = frame.content.indexOf('\n', frame.content.length - MAX_CONTENT_CHARS);
    if (newline < 0) return null;
    start = newline + 1;
  }
  const content = frame.content.slice(start);
  if (!content) return null;
  return {
    identity, relayId: agent.relay_id, savedAt,
    frame: {
      paneId: agent.pane_id, target, content, format: frame.format,
      truncated: Boolean(frame.truncated || start),
      viewportOnly: frame.viewportOnly === true,
      ...(Number.isSafeInteger(frame.viewportRows) && Number(frame.viewportRows) > 0
        ? { viewportRows: frame.viewportRows } : {}),
    },
  };
}

export async function loadTerminalPreview(agent: Agent): Promise<TerminalPreview | null> {
  const identity = terminalPreviewIdentity(agent);
  if (!identity) return null;
  const saved = await loadSavedTerminalPreview(identity);
  if (!saved || saved.identity !== identity || saved.relayId !== agent.relay_id) return null;
  return terminalPreview(agent, saved.frame, saved.savedAt);
}

export async function persistTerminalPreview(agent: Agent, frame: TerminalFrame): Promise<void> {
  if (agent.cachedPreview) return;
  const preview = terminalPreview(agent, frame);
  if (preview) await saveTerminalPreview(preview, JSON.stringify(preview).length * 2);
}
