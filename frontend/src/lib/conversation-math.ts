import katex from 'katex';
import 'katex/dist/katex.min.css';

export function renderConversationMath(root: HTMLElement): void {
  for (const element of root.querySelectorAll<HTMLElement>('.conversation-math:not([data-math-rendered])')) {
    const source = element.textContent || '';
    if (source.length > 20_000) continue;
    try {
      katex.render(source, element, {
        displayMode: element.dataset.mathDisplay === 'true',
        output: 'htmlAndMathml',
        trust: false,
        strict: 'ignore',
        throwOnError: true,
        maxExpand: 500,
        maxSize: 20,
      });
      element.dataset.mathRendered = 'true';
    } catch {
      // Incomplete streamed expressions remain readable until the next update.
      element.textContent = source;
    }
  }
}
