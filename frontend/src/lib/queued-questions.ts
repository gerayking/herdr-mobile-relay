import { stripAnsi } from './terminal';

export function queuedQuestionCount(content: string, agent: string): number {
  if (!agent.toLowerCase().includes('codex')) return 0;
  const lines = stripAnsi(content).replace(/\r\n?/g, '\n').trimEnd().split('\n').slice(-20);
  const header = lines.findLastIndex(line => /^\s*[•●]?\s*Queued follow-up inputs\s*$/i.test(line));
  if (header < 0) return 0;
  const queue = lines.slice(header + 1).join('\n');
  const match = queue.match(/^\s*\?\s+(\d+)\s+questions?\s*\n\s*alt\s*\+\s*(?:↑|up)\s+to\s+answer\s*$/im);
  if (!match) return 0;
  // Only terminal chrome may follow a live queue, never newer conversation text.
  const after = queue.slice(match.index! + match[0].length).trim();
  if (after.split('\n').some(line => !isCodexChrome(line.trim()))) return 0;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function isCodexChrome(line: string): boolean {
  if (!line || /^[─━═.·\s]+$/.test(line)) return true;
  if (/^[›>]\s*(?:Ask Codex to do anything)?\s*$/i.test(line)) return true;
  if (/^(?:\d+%\s+(?:left|context)(?:\s+left)?|\? for shortcuts)\s*$/i.test(line)) return true;
  return /^(?:gpt-[\w.-]+|o[1-9][\w.-]*|codex[\w.-]*)\s+.*(?:[·•]|ctrl\s*\+\s*\/|\d+%)/i.test(line);
}
