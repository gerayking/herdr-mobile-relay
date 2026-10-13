import { stripAnsi } from './terminal';

export function queuedQuestionCount(content: string, agent: string): number {
  if (!agent.toLowerCase().includes('codex')) return 0;
  const lines = stripAnsi(content).replace(/\r\n?/g, '\n').trimEnd().split('\n').slice(-20);
  const header = lines.findLastIndex(line => /^\s*Queued follow-up inputs\s*$/i.test(line));
  if (header < 0) return 0;
  const queue = lines.slice(header + 1).join('\n');
  const match = queue.match(/^\s*\?\s+(\d+)\s+questions?\s*\n\s*alt\s*\+\s*(?:↑|up)\s+to\s+answer\s*$/im);
  if (!match) return 0;
  // Only terminal chrome may follow a live queue, never newer conversation text.
  const after = queue.slice(match.index! + match[0].length).trim();
  if (after.split('\n').some(line => !/^\s*(?:[─━═]+|[›>]\s*|.*\b\d+%\s+(?:left|context).*|\? for shortcuts)?\s*$/i.test(line))) return 0;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}
