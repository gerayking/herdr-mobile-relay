import { describe, expect, it } from 'vitest';
import { queuedQuestionCount } from '../../src/lib/queued-questions';

const queue = 'Queued follow-up inputs\n  ? 2 questions\n    alt + ↑ to answer';

describe('queuedQuestionCount', () => {
  it('recognizes the Codex queue with ANSI styles and CRLF', () => {
    expect(queuedQuestionCount(`Previous output\n\x1b[1m${queue}\x1b[0m\n`, 'codex')).toBe(2);
    expect(queuedQuestionCount(queue.replaceAll('\n', '\r\n'), 'Codex')).toBe(2);
    expect(queuedQuestionCount(queue.replace('2 questions', '1 question').replace('alt + ↑', 'alt+up'), 'codex')).toBe(1);
    expect(queuedQuestionCount(`${queue}\n\n${'─'.repeat(20)}\n› \n80% context left`, 'codex')).toBe(2);
  });

  it('does not offer keys for quoted, historical, incomplete or unrelated output', () => {
    for (const content of [
      `The UI says ${queue}`, queue.split('\n').map(line => `> ${line}`).join('\n'),
      `${queue}\nAnswer received.`, `${queue}\n${'new output\n'.repeat(20)}`,
      queue.replace('2 questions', '0 questions'), queue.replace('to answer', 'to edit'),
      queue.replace('alt +', 'ctrl +'), '? 2 questions\nalt + ↑ to answer',
    ]) expect(queuedQuestionCount(content, 'codex')).toBe(0);
    expect(queuedQuestionCount(queue, 'claude')).toBe(0);
  });
});
