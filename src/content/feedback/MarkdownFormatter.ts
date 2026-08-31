import type { FeedbackItem, ExtensionSettings } from '../../shared/types';

export class MarkdownFormatter {
  format(url: string, feedback: FeedbackItem[], settings?: ExtensionSettings): string {
    const detail = settings?.outputDetail || 'standard';

    const textEdits = feedback.filter((f) => f.kind === 'text-edit').length;

    let markdown = `# AgentEcho Feedback Report\n`;
    markdown += `**URL:** ${url}\n`;
    markdown += `**Captured:** ${new Date().toISOString().replace('T', ' ').substring(0, 19)}\n`;
    markdown += `**Total Items:** ${feedback.length}\n`;
    if (textEdits > 0) {
      markdown += `**Text Edits:** ${textEdits} (copy changes only - no styling changes requested)\n`;
    }
    markdown += `\n---\n\n`;

    for (const item of feedback) {
      markdown += this.formatFeedback(item, detail);
      markdown += `\n---\n\n`;
    }

    return markdown;
  }

  private formatFeedback(item: FeedbackItem, detail: 'minimal' | 'standard' | 'comprehensive'): string {
    if (item.kind === 'text-edit' && item.textEdit) {
      return this.formatTextEdit(item, detail);
    }

    let markdown = `## Feedback #${item.index}\n`;
    markdown += `> ${item.comment}\n\n`;

    if (item.category) {
      markdown += `**Category:** ${item.category}\n\n`;
    }

    markdown += `- **Element:** \`<${item.element.tagName}>\`\n`;
    markdown += `- **Selector:** \`${item.element.selector}\`\n`;

    if (detail === 'minimal') {
      return markdown;
    }

    if (item.element.classes.length > 0) {
      markdown += `- **Classes:** \`${item.element.classes.join('`, `')}\`\n`;
    }

    if (item.element.id) {
      markdown += `- **ID:** \`${item.element.id}\`\n`;
    }

    if (item.element.textContent) {
      markdown += `- **Text:** "${item.element.textContent}"\n`;
    }

    if (item.element.component) {
      markdown += `- **Component:** \`${item.element.component.name}\` (${item.element.component.framework})\n`;
    }

    if (detail === 'comprehensive') {
      if (Object.keys(item.element.dataAttributes).length > 0) {
        markdown += `- **Data Attributes:**\n`;
        for (const [key, value] of Object.entries(item.element.dataAttributes)) {
          markdown += `  - \`${key}\`: "${value}"\n`;
        }
      }

      const rect = item.element.boundingRect;
      markdown += `- **Position:** x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, width=${Math.round(rect.width)}, height=${Math.round(rect.height)}\n`;

      if (item.element.component?.props) {
        markdown += `- **Component Props:**\n`;
        for (const [key, value] of Object.entries(item.element.component.props)) {
          markdown += `  - \`${key}\`: ${JSON.stringify(value).substring(0, 50)}\n`;
        }
      }
    }

    return markdown;
  }

  /**
   * Text edits are emitted as an explicit before/after pair so an agent can
   * locate the string in the source and change only the copy.
   */
  private formatTextEdit(item: FeedbackItem, detail: 'minimal' | 'standard' | 'comprehensive'): string {
    const edit = item.textEdit!;

    let markdown = `## Text Edit #${item.index}\n`;
    markdown += `Replace the text content of this element. Do not change styling, classes or markup.\n\n`;
    markdown += `**Before:**\n\n\`\`\`text\n${edit.originalText}\n\`\`\`\n\n`;
    markdown += `**After:**\n\n\`\`\`text\n${edit.newText}\n\`\`\`\n\n`;

    markdown += `- **Element:** \`<${item.element.tagName}>\`\n`;
    markdown += `- **Selector:** \`${item.element.selector}\`\n`;

    if (detail === 'minimal') {
      return markdown;
    }

    if (item.element.classes.length > 0) {
      markdown += `- **Classes:** \`${item.element.classes.join('\`, \`')}\`\n`;
    }

    if (item.element.id) {
      markdown += `- **ID:** \`${item.element.id}\`\n`;
    }

    if (item.element.component) {
      markdown += `- **Component:** \`${item.element.component.name}\` (${item.element.component.framework})\n`;
    }

    if (detail === 'comprehensive') {
      const rect = item.element.boundingRect;
      markdown += `- **Position:** x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, width=${Math.round(rect.width)}, height=${Math.round(rect.height)}\n`;
    }

    return markdown;
  }
}
