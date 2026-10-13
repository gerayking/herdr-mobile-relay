import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import ConversationMessage from '$components/ConversationMessage.svelte';
import { safeMarkdownHtml } from '$lib/markdown';
import { renderConversationMath } from '$lib/conversation-math';

function renderMarkdown(source: string): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = safeMarkdownHtml(source);
  renderConversationMath(root);
  return root;
}

describe('conversation math', () => {
  it('renders the multiline formulas from the phone screenshot', () => {
    const root = renderMarkdown(String.raw`For packed documents:

\[
C_{\text{linear}}\propto\sum_i l_i
\]

\[
C_{\text{attention}}\propto\sum_i l_i^2
\]`);
    expect(root.querySelectorAll('.katex-display')).toHaveLength(2);
    expect(root.querySelectorAll('math')).toHaveLength(2);
    expect(root.querySelectorAll('.katex-error')).toHaveLength(0);
    expect(root.querySelector('annotation')?.textContent).toContain(String.raw`C_{\text{linear}}`);
  });

  it('supports dollar and backslash delimiters in prose, lists, and tables', () => {
    const root = renderMarkdown(String.raw`Inline $x_i^2$ and \(\frac{a}{b}\).

$$
\begin{aligned}
a &= b + c \\
d &= e
\end{aligned}
$$

- **Value \(\alpha\)**

| Formula | Value |
| --- | --- |
| $\sqrt{x}$ | 1 |`);
    expect(root.querySelectorAll('.katex')).toHaveLength(5);
    expect(root.querySelectorAll('.katex-display')).toHaveLength(1);
    expect(root.querySelector('strong .katex')).not.toBeNull();
    expect(root.querySelector('td .katex')).not.toBeNull();
  });

  it('leaves code, currency, and unfinished formulas as readable text', () => {
    const source = 'Prices: $5 and $10. Escaped: \\$x\\$.\n\n`$x$` and `\\(y\\)`\n\n```tex\n\\[\nx^2\n\\]\n```\n\n\\[\nunfinished';
    const root = renderMarkdown(source);
    expect(root.querySelector('.katex')).toBeNull();
    expect(root.querySelectorAll('code')).toHaveLength(3);
    expect(root.textContent).toContain('$5 and $10');
    expect(root.textContent).toContain('unfinished');
    expect(root.querySelector('pre')?.textContent).toContain('\\[');
  });

  it('keeps malformed expressions readable and blocks untrusted HTML commands', () => {
    const root = renderMarkdown(String.raw`$\unknowncommand{<img src=x onerror=alert(1)>}$

\[\href{javascript:alert(1)}{click}\]

\[\includegraphics{https://example.com/image.png}\]`);
    expect(root.querySelector('img, a, script')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('renders newly completed expressions when a message streams', async () => {
    const { container, rerender } = render(ConversationMessage, { text: '\\[\nx^2', messageId: 'streaming' });
    expect(container.querySelector('.katex')).toBeNull();
    await rerender({ text: '\\[\nx^2\n\\]', messageId: 'streaming' });
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(1));
    await rerender({ text: '$\\frac{a}{b}$', messageId: 'streaming' });
    await waitFor(() => expect(container.querySelector('annotation')?.textContent).toBe('\\frac{a}{b}'));
  });
});
