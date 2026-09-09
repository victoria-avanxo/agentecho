import type { FeedbackItem, TextEditInfo } from '../../shared/types';

const FORBIDDEN_TAGS = [
  'input', 'textarea', 'select', 'option', 'script', 'style',
  'svg', 'img', 'video', 'canvas', 'iframe',
];

/**
 * What a click resolved to. `textNode` is null when the element holds nothing
 * but text and can be edited whole.
 */
export interface EditTarget {
  element: HTMLElement;
  textNode: Text | null;
  textNodeIndex: number;
}

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

  /* Temporary wrapper around a single text run. Must not affect layout. */
  .agentecho-text-slot {
    all: unset !important;
    outline: 2px dashed #f59e0b !important;
    outline-offset: 1px !important;
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
  /** Set when editing a single text run inside an element with inline markup. */
  private slot: HTMLElement | null = null;
  private slotIndex = -1;
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
   * The run of text a click resolves to: either a single text node inside an
   * element that also holds inline markup, or the element itself when its
   * content is nothing but text.
   */
  static resolveTarget(element: HTMLElement, x: number, y: number): EditTarget | null {
    if (!TextEditor.isEditableHost(element)) return null;

    // Pure-text element: edit it whole, as before.
    if (element.children.length === 0) {
      const text = element.textContent?.trim();
      if (!text) return null;
      return { element, textNode: null, textNodeIndex: -1 };
    }

    // Mixed content (a paragraph with links, a list item with <i>, ...).
    // Edit only the text run under the cursor so markup survives untouched.
    const node = TextEditor.textNodeAtPoint(x, y);
    if (!node) return null;

    const parent = node.parentElement;
    if (!parent || !TextEditor.isEditableHost(parent)) return null;
    if (!(node.nodeValue ?? '').trim()) return null;

    const index = TextEditor.textNodes(parent).indexOf(node);
    if (index === -1) return null;

    return { element: parent, textNode: node, textNodeIndex: index };
  }

  /** Non-empty text node children of an element, in document order. */
  private static textNodes(parent: Element): Text[] {
    // Merge adjacent text nodes first so indices are reproducible after a
    // reload, when the same markup may be parsed into a single node.
    parent.normalize();
    return Array.from(parent.childNodes).filter(
      (n): n is Text => n.nodeType === Node.TEXT_NODE && !!(n.nodeValue ?? '').trim()
    );
  }

  private static textNodeAtPoint(x: number, y: number): Text | null {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
    };

    const range = doc.caretRangeFromPoint?.(x, y);
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      return range.startContainer as Text;
    }

    // Firefox-style API, kept as a fallback.
    const pos = doc.caretPositionFromPoint?.(x, y);
    if (pos && pos.offsetNode.nodeType === Node.TEXT_NODE) {
      return pos.offsetNode as Text;
    }

    return null;
  }

  /** Rect of the text run, so the hover box outlines the text and not the block. */
  static targetRect(target: EditTarget): DOMRect {
    if (!target.textNode) return target.element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(target.textNode);
    return range.getBoundingClientRect();
  }

  /** Tags that must never become an editing host. */
  private static isEditableHost(element: HTMLElement): boolean {
    if (element.isContentEditable) return false;
    const tag = element.tagName.toLowerCase();
    return !FORBIDDEN_TAGS.includes(tag);
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

  /** True when some run of text under the cursor can be edited. */
  static canEditAt(element: HTMLElement, x: number, y: number): boolean {
    return TextEditor.resolveTarget(element, x, y) !== null;
  }

  start(target: EditTarget): boolean {
    if (this.activeElement) this.commit();

    return target.textNode
      ? this.startTextNodeEdit(target)
      : this.startElementEdit(target.element);
  }

  /** Whole-element editing: the element contains nothing but text. */
  private startElementEdit(element: HTMLElement): boolean {
    if (element.children.length > 0) return false;
    if (!(element.textContent ?? '').trim()) return false;

    this.slot = null;
    this.slotIndex = -1;
    this.activeElement = element;
    this.originalRawText = element.textContent ?? '';
    this.originalText = TextEditor.visibleText(element);

    // Write the collapsed text back before the element becomes editable, so
    // the editing host renders exactly what the user was already seeing.
    if (this.originalText !== this.originalRawText) {
      element.textContent = this.originalText;
    }

    this.makeEditable(element, 'agentecho-text-editable');
    return true;
  }

  /**
   * Edit one text run inside an element that also holds inline markup, by
   * wrapping just that run in a temporary span. Links, <i>, <span> and every
   * other sibling node are left completely untouched.
   */
  private startTextNodeEdit(target: EditTarget): boolean {
    const node = target.textNode!;
    const parent = node.parentNode;
    if (!parent) return false;

    const raw = node.nodeValue ?? '';
    const collapse = !TextEditor.preservesWhitespace(target.element);

    // Keep the surrounding spacing so neighbouring markup does not run into
    // the edited words when the run is put back.
    const leading = collapse && /^\s/.test(raw) ? ' ' : '';
    const trailing = collapse && /\s$/.test(raw) ? ' ' : '';
    const visible = collapse ? raw.replace(/\s+/g, ' ').trim() : raw;
    if (!visible.trim()) return false;

    const slot = document.createElement('span');
    slot.className = 'agentecho-text-slot';
    slot.textContent = visible;
    parent.replaceChild(slot, node);

    this.slot = slot;
    this.slotIndex = target.textNodeIndex;
    this.activeElement = target.element;
    this.originalText = visible;
    // Reconstructed on cancel/no-op so the DOM returns to its exact shape.
    this.originalRawText = leading + visible + trailing;

    this.makeEditable(slot, 'agentecho-text-slot');
    return true;
  }

  private makeEditable(host: HTMLElement, keepClass: string) {
    this.previousContentEditable = host.getAttribute('contenteditable');
    this.previousSpellcheck = host.getAttribute('spellcheck');

    // plaintext-only stops the browser from inserting markup or inline styles
    // when the user pastes. Chrome supports it; fall back to true if not.
    host.setAttribute('contenteditable', 'plaintext-only');
    if (!host.isContentEditable) {
      host.setAttribute('contenteditable', 'true');
    }
    host.setAttribute('spellcheck', 'false');
    if (keepClass === 'agentecho-text-editable') {
      host.classList.add('agentecho-text-editable');
    }

    host.addEventListener('keydown', this.handleKeyDown, true);
    host.addEventListener('blur', this.handleBlur, true);
    host.addEventListener('paste', this.handlePaste, true);

    host.focus();
    this.selectAll(host);
  }

  /** The element the browser is actually editing. */
  private get host(): HTMLElement | null {
    return this.slot ?? this.activeElement;
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
    const host = this.host;
    if (!element || !host) return;

    // Read before teardown, then normalise the same way, so a stray newline
    // typed or pasted into the element cannot alter the page's layout.
    const preserve = TextEditor.preservesWhitespace(element);
    const raw = host.textContent ?? '';
    const newText = preserve ? raw : raw.replace(/\s+/g, ' ').trim();

    const slot = this.slot;
    const slotIndex = this.slotIndex;
    const original = this.originalText;
    const originalRaw = this.originalRawText;
    const unchanged = newText.trim() === original.trim();

    this.teardown(host);

    if (slot) {
      // Put a plain text node back where the wrapper was: the DOM returns to
      // its original shape, with no leftover element from the editor.
      const restored = unchanged ? originalRaw : this.padLike(originalRaw, newText);
      slot.replaceWith(document.createTextNode(restored));
      element.normalize();

      if (!unchanged) {
        element.classList.add('agentecho-text-edited');
        this.callbacks.onCommit(element, {
          originalText: original,
          newText,
          textNodeIndex: slotIndex,
        });
      }
    } else {
      // Normalise through textContent so nothing but text survives.
      element.textContent = unchanged ? originalRaw : newText;

      if (!unchanged) {
        element.classList.add('agentecho-text-edited');
        this.callbacks.onCommit(element, { originalText: original, newText });
      }
    }

    this.callbacks.onSessionEnd();
  }

  /** Re-attach the leading/trailing spacing the original run carried. */
  private padLike(originalRaw: string, newText: string): string {
    const leading = /^\s/.test(originalRaw) ? ' ' : '';
    const trailing = /\s$/.test(originalRaw) ? ' ' : '';
    return leading + newText.trim() + trailing;
  }

  /** Abandon the edit and restore the text the element had before. */
  cancel() {
    const element = this.activeElement;
    const host = this.host;
    if (!element || !host) return;

    const slot = this.slot;
    const originalRaw = this.originalRawText;
    this.teardown(host);

    if (slot) {
      slot.replaceWith(document.createTextNode(originalRaw));
      element.normalize();
    } else {
      // Restore the exact original text, including its source formatting.
      element.textContent = originalRaw;
    }
    this.callbacks.onSessionEnd();
  }

  private teardown(host: HTMLElement) {
    host.removeEventListener('keydown', this.handleKeyDown, true);
    host.removeEventListener('blur', this.handleBlur, true);
    host.removeEventListener('paste', this.handlePaste, true);
    host.classList.remove('agentecho-text-editable');

    if (this.previousContentEditable === null) {
      host.removeAttribute('contenteditable');
    } else {
      host.setAttribute('contenteditable', this.previousContentEditable);
    }

    if (this.previousSpellcheck === null) {
      host.removeAttribute('spellcheck');
    } else {
      host.setAttribute('spellcheck', this.previousSpellcheck);
    }

    window.getSelection()?.removeAllRanges();
    this.activeElement = null;
    this.slot = null;
    this.slotIndex = -1;
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

      const element = TextEditor.findElement(item.element.selector);
      if (!element) continue;

      TextEditor.swapText(
        element,
        item.textEdit.textNodeIndex,
        item.textEdit.originalText,
        item.textEdit.newText
      );
    }
  }

  /** Put the original copy back for a single saved edit. */
  static revertEdit(item: FeedbackItem): void {
    if (item.kind !== 'text-edit' || !item.textEdit) return;

    const element = TextEditor.findElement(item.element.selector);
    if (!element) return;

    TextEditor.swapText(
      element,
      item.textEdit.textNodeIndex,
      item.textEdit.newText,
      item.textEdit.originalText
    );
    element.classList.remove('agentecho-text-edited');
  }

  private static findElement(selector: string): HTMLElement | null {
    try {
      return document.querySelector(selector) as HTMLElement | null;
    } catch {
      return null; // Selector no longer valid for this page.
    }
  }

  /**
   * Replace `from` with `to`, either across the whole element or in one text
   * run. The swap only happens when the target still holds `from`, so text the
   * page has changed since is never clobbered.
   */
  private static swapText(
    element: HTMLElement,
    textNodeIndex: number | undefined,
    from: string,
    to: string
  ): boolean {
    const collapse = !TextEditor.preservesWhitespace(element);
    const norm = (v: string) => (collapse ? v.replace(/\s+/g, ' ').trim() : v);

    // Whole-element edit (also the shape saved before inline markup support).
    if (textNodeIndex === undefined || textNodeIndex < 0) {
      if (element.children.length > 0) return false;
      if (norm(element.textContent ?? '') !== norm(from)) return false;
      element.textContent = to;
      if (to !== from) element.classList.add('agentecho-text-edited');
      return true;
    }

    const nodes = TextEditor.textNodes(element);
    const node = nodes[textNodeIndex];
    if (!node) return false;

    const raw = node.nodeValue ?? '';
    if (norm(raw) !== norm(from)) return false;

    const leading = collapse && /^\s/.test(raw) ? ' ' : '';
    const trailing = collapse && /\s$/.test(raw) ? ' ' : '';
    node.nodeValue = leading + to.trim() + trailing;
    if (to !== from) element.classList.add('agentecho-text-edited');
    return true;
  }
}
