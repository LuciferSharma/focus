import { TaskCategory } from '@focuswatch/shared-types';

/**
 * Prompt handed to an external AI agent so it emits task lines in exactly the
 * shape batchCreateTasks() parses (see useTaskStore.batchCreateTasks).
 */
const AI_BATCH_PROMPT = `You are helping me build my task backlog for FocusWatch, a deep-work tracker.

Go through everything I have asked you for in this conversation / project: every request, feature, fix, follow-up, idea, and open question. Turn ALL of them into a flat task list I can paste into FocusWatch's batch importer.

OUTPUT FORMAT (strict, the importer is a simple line parser):
- Exactly one task per line. Every line becomes a task.
- Start each line with "- [ ] " followed by a short, concrete, action-oriented title (max ~80 chars, start with a verb).
- After the title, append zero or more of these tokens, separated by spaces, in this order:
    #tag          one or more tags, letters/numbers/underscore only, no hyphens or spaces (e.g. #backend #ui #bugfix)
    @category     optional, exactly one of: {{CATEGORIES}}. Pick the best fit for the kind of work and omit it if none fits. Never invent a new one.
    (45m)         estimated minutes in parentheses, whole number followed by "m" (e.g. (15m), (90m)). Omit if unsure; default is 45m.
    [critical] | [high] | [low]   priority. Omit the token for medium priority.
- Do NOT output: headings, section titles, blank-line separators with text, numbering, nested/indented sub-bullets, code fences (\`\`\`), tables, bold/italics, emojis, or any commentary before or after the list. Any extra line would be imported as a bogus task.
- Do NOT put "#" or "@" anywhere in a title except for tags and the category. Do NOT use parentheses or square brackets in a title.
- Split big asks into several independent tasks. Merge duplicates. Skip things already completed.
- Order lines by priority: critical, then high, then medium, then low.

EXAMPLE OF THE ONLY ACCEPTABLE OUTPUT STYLE:
- [ ] Fix trailing whitespace being trimmed in note editor #bugfix #extension{{CAT1}} (20m) [critical]
- [ ] Add copy-to-clipboard button for AI batch prompt #ui #tasks{{CAT2}} (30m) [high]
- [ ] Generate extension icon set at 16, 32, 48, 128 px #design{{CAT3}} (45m)
- [ ] Write README section for desktop launcher shortcut #docs{{CAT4}} (25m) [low]

Now produce the list. Output only the task lines.`;

/** The import prompt, filled in with your current (non-archived) categories. */
export function buildAiBatchPrompt(categories: TaskCategory[]): string {
  const live = categories.filter((c) => !c.archived);
  const list = live.length
    ? live
        .map((c) => `@${c.id} (${c.name}${c.isWaste ? ', wasted time, rarely applies' : ''})`)
        .join(', ')
    : 'none are set up, so leave the category out';
  const example = (i: number) => (live.length ? ` @${live[i % live.length].id}` : '');
  return AI_BATCH_PROMPT.replace('{{CATEGORIES}}', list)
    .replace('{{CAT1}}', example(0))
    .replace('{{CAT2}}', example(0))
    .replace('{{CAT3}}', example(1))
    .replace('{{CAT4}}', example(2));
}
