import type { FeedbackItem, TextEditInfo } from '../../shared/types';

export interface TextEditorCallbacks {
  /** Fired when the user commits a change that actually differs from the original. */
  onCommit: (element: HTMLElement, edit: TextEditInfo) => void;
  /** Fired whenever an editing session ends, committed or not. */
  onSessionEnd: () => void;
}

const TEXT_EDITOR_STYLES = `
  .agentecho-text-editable {
    outline: 2px dashed #f59e0b !important;
    outline-offset: 2px !important;
    cursor: text !important;
  }

  .agentecho-text-edited {
    outline: 2px solid #f59e0b !important;
    outline-offset: 2px !important;
  }
`;

/**
 * Drives inline, plain-text-only editing of page elements.
 *
 * Deliberately narrow in scope: it captures copy changes and nothing else.
 * Styles, classes and markup are never touched - the element is put into
 * `plaintext-only` contentEditable so the browser itself refuses to paste
 * rich text, and on commit we write back through `textContent`.
 */
export class TextEditor {
  private callbacks: TextEditorCallbacks;
  private activeElement: HTMLElement | null = null;
  private originalText = '';
  /** Exact textContent before editing, used to restore the DOM on cancel. */
  private originalRawText = '';
  private previousContentEditable: string | null = null;
  private previousSpellcheck: string | null = null;

  constructor(callbacks: TextEditorCallbacks) {
    this.callbacks = callbacks;
    this.injectPageStyles();
  }

  /**
   * Styles for edited elements live in the page (not the shadow root) because
   * they decorate page elements, not overlay chrome.
   */
  private injectPageStyles() {
    if (document.getElementById('agentecho-text-editor-styles')) return;
    const style = document.createElement('style');
    style.id = 'agentecho-text-editor-styles';
    style.textContent = TEXT_EDITOR_STYLES;
    document.head.appendChild(style);
  }

  get isEditing(): boolean {
    return this.activeElement !== null;
  }

  /**
   * True when the element's own CSS makes whitespace significant, as in <pre>
   * or a code block. For those the text must be left byte-for-byte alone.
   */
  private static preservesWhitespace(element: HTMLElement): boolean {
    const ws = getComputedStyle(element).whiteSpace;
    return ws === 'pre' || ws === 'pre-wrap' || ws === 'pre-line' || ws === 'break-spaces';
  }

  /**
   * Collapse source formatting down to the text the user actually sees.
   *
   * Markup like `<button>\n  Save\n</button>` has a textContent of
   * "\n  Save\n". The browser collapses that to "Save" when rendering, but a
   * contenteditable host renders whitespace literally - so without this the
   * element gains a blank line above and below the moment editing starts, and
   * the page visibly jumps. Elements with pre-like white-space are exempt.
   */
  private static visibleText(element: HTMLElement): string {
    const raw = element.textContent ?? '';
    if (TextEditor.preservesWhitespace(element)) return raw;
    return raw.replace(/\s+/g, ' ').trim();
  }

  /**
   * An element is editable only when its content is purely text. Elements that
   * contain child elements are rejected: editing them risks destroying markup,
   * which is exactly what this feature must not do.
   */
  static isEditableTextElement(element: HTMLElement): boolean {
    if (element.isContentEditable) return false;

    const tag = element.tagName.toLowerCase();
    const forbidden = ['input', 'textarea', 'select', 'option', 'script', 'style', 'svg', 'img', 'video', 'canvas', 'iframe'];
    if (forbidden.includes(tag)) return false;

    // Must have exactly the text it renders and no element children.
    if (element.children.length > 0) return false;

    const text = element.textContent?.trim();
    return !!text && text.length > 0;
  }

  start(element: HTMLElement): boolean {
    if (this.activeElement) this.commit();
    if (!TextEditor.isEditableTextElement(element)) return false;

    this.activeElement = element;
    this.originalRawText = element.textContent ?? '';
    this.originalText = TextEditor.visibleText(element);

    // Write the collapsed text back before the element becomes editable, so
    // the editing host renders exactly what the user was already seeing.
    if (this.originalText !== this.originalRawText) {
      element.textContent = this.originalText;
    }

    this.previousContentEditable = element.getAttribute('contenteditable');
    this.previousSpellcheck = element.getAttribute('spellcheck');

    // plaintext-only stops the browser from inserting markup or inline styles
    // when the user pastes. Chrome supports it; fall back to true if not.
    element.setAttribute('contenteditable', 'plaintext-only');
    if (!element.isContentEditable) {
      element.setAttribute('contenteditable', 'true');
    }
    element.setAttribute('spellcheck', 'false');
    element.classList.add('agentecho-text-editable');

    element.addEventListener('keydown', this.handleKeyDown, true);
    element.addEventListener('blur', this.handleBlur, true);
    element.addEventListener('paste', this.handlePaste, true);

    element.focus();
    this.selectAll(element);
    return true;
  }

  private selectAll(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  /**
   * Force plain text on paste even when `plaintext-only` is unavailable, so no
   * foreign markup or styling can enter the page through this feature.
   */
  private handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    // Keep page/overlay shortcuts from firing while the user types.
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancel();
      return;
    }

    // Enter commits; Shift+Enter is not offered because a single element's
    // copy is captured as one line of text.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.commit();
    }
  };

  private handleBlur = () => {
    if (this.activeElement) this.commit();
  };

  /** Commit the current edit, emitting a change only when the text differs. */
  commit() {
    const element = this.activeElement;
    if (!element) return;

    // Read before teardown, then normalise the same way, so a stray newline
    // typed or pasted into the element cannot alter the page's layout.
    const preserve = TextEditor.preservesWhitespace(element);
    const raw = element.textContent ?? '';
    const newText = preserve ? raw : raw.replace(/\s+/g, ' ').trim();

    this.teardown(element);

    // Normalise through textContent so nothing but text survives.
    element.textContent = newText;

    if (newText.trim() === this.originalText.trim()) {
      // Nothing changed - put the original source formatting back so the DOM
      // is left exactly as we found it.
      element.textContent = this.originalRawText;
    } else {
      element.classList.add('agentecho-text-edited');
      this.callbacks.onCommit(element, {
        originalText: this.originalText,
        newText,
      });
    }

    this.callbacks.onSessionEnd();
  }

  /** Abandon the edit and restore the text the element had before. */
  cancel() {
    const element = this.activeElement;
    if (!element) return;

    this.teardown(element);
    // Restore the exact original text, including its source formatting.
    element.textContent = this.originalRawText;
    this.callbacks.onSessionEnd();
  }

  private teardown(element: HTMLElement) {
    element.removeEventListener('keydown', this.handleKeyDown, true);
    element.removeEventListener('blur', this.handleBlur, true);
    element.removeEventListener('paste', this.handlePaste, true);
    element.classList.remove('agentecho-text-editable');

    if (this.previousContentEditable === null) {
      element.removeAttribute('contenteditable');
    } else {
      element.setAttribute('contenteditable', this.previousContentEditable);
    }

    if (this.previousSpellcheck === null) {
      element.removeAttribute('spellcheck');
    } else {
      element.setAttribute('spellcheck', this.previousSpellcheck);
    }

    window.getSelection()?.removeAllRanges();
    this.activeElement = null;
    this.previousContentEditable = null;
    this.previousSpellcheck = null;
  }

  /**
   * Re-apply saved text edits to the live page. Called on load and after SPA
   * navigation so committed copy changes survive a refresh.
   */
  static applySavedEdits(items: FeedbackItem[]): void {
    for (const item of items) {
      if (item.kind !== 'text-edit' || !item.textEdit) continue;

      let element: HTMLElement | null = null;
      try {
        element = document.querySelector(item.element.selector) as HTMLElement | null;
      } catch {
        continue; // Selector no longer valid for this page.
      }
      if (!element || element.children.length > 0) continue;

      // Compare collapsed text: the stored original is normalised, but the
      // page's markup still carries its source indentation.
      const current = TextEditor.visibleText(element);
      // Only re-apply when the element still holds the original copy, so we
      // never clobber text the page itself has since changed.
      if (current === item.textEdit.originalText.trim()) {
        element.textContent = item.textEdit.newText;
        element.classList.add('agentecho-text-edited');
      }
    }
  }

  /** Put the original copy back for a single saved edit. */
  static revertEdit(item: FeedbackItem): void {
    if (item.kind !== 'text-edit' || !item.textEdit) return;

    let element: HTMLElement | null = null;
    try {
      element = document.querySelector(item.element.selector) as HTMLElement | null;
    } catch {
      return;
    }
    if (!element || element.children.length > 0) return;

    if (TextEditor.visibleText(element) === item.textEdit.newText.trim()) {
      element.textContent = item.textEdit.originalText;
    }
    element.classList.remove('agentecho-text-edited');
  }
}
