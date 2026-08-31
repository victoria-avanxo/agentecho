import { HoverBox } from './HoverBox';
import { MarkerManager } from './MarkerManager';
import { Toolbar } from './Toolbar';
import { FeedbackModal } from './FeedbackModal';
import { ElementAnalyzer } from '../analyzers/ElementAnalyzer';
import { TextEditor } from './TextEditor';
import type { ExtensionSettings, FeedbackItem, OverlayMode, TextEditInfo } from '../../shared/types';
import type { FeedbackManager } from '../feedback/FeedbackManager';
import { sendMessage } from '../../shared/messaging';

const OVERLAY_STYLES = `
  .agentecho-overlay-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2147483647;
  }

  .agentecho-overlay-container.blocking {
    pointer-events: all;
    cursor: crosshair;
  }

  .agentecho-block-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    pointer-events: all;
    z-index: 2147483640;
  }
`;

export class Overlay {
  private container: HTMLElement;
  private shadowRoot: ShadowRoot;
  private blockOverlay: HTMLElement | null = null;
  private hoverBox: HoverBox;
  private markerManager: MarkerManager;
  private toolbar: Toolbar;
  private feedbackModal: FeedbackModal;
  private textEditor: TextEditor;
  private elementAnalyzer: ElementAnalyzer;
  private feedbackManager: FeedbackManager;
  private settings: ExtensionSettings;
  public isActive = false;
  private isPaused = false;
  private markersVisible = true;
  private targetElement: HTMLElement | null = null;
  private isModalOpen = false;
  private mode: OverlayMode = 'comment';

  constructor(settings: ExtensionSettings, feedbackManager: FeedbackManager) {
    this.settings = settings;
    this.feedbackManager = feedbackManager;

    this.container = document.createElement('div');
    this.container.className = 'agentecho-overlay-container';
    this.shadowRoot = this.container.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = OVERLAY_STYLES;
    this.shadowRoot.appendChild(style);

    this.hoverBox = new HoverBox(this.shadowRoot);
    this.markerManager = new MarkerManager(this.shadowRoot, settings, {
      onEdit: (id) => this.handleEditFeedback(id),
      onDelete: (id) => this.handleDeleteFeedback(id),
    });
    this.toolbar = new Toolbar(this.shadowRoot, settings);
    this.feedbackModal = new FeedbackModal(this.shadowRoot);
    this.textEditor = new TextEditor({
      onCommit: (element, edit) => this.handleTextEditCommit(element, edit),
      onSessionEnd: () => this.handleTextEditSessionEnd(),
    });
    this.elementAnalyzer = new ElementAnalyzer();

    this.setupEventListeners();
    this.setupToolbarListeners();
    this.applySavedTextEdits();
    this.loadExistingMarkers();

    // Apply block interactions setting
    if (this.settings.blockInteractions) {
      this.enableBlockingMode();
    }
  }

  private setupEventListeners() {
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('click', this.handleClick, true);
  }

  private removeEventListeners() {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick, true);
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isActive || this.isPaused || this.isModalOpen) return;
    if (this.textEditor.isEditing) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === this.container || target === this.blockOverlay) {
      this.hoverBox.hide();
      this.targetElement = null;
      return;
    }

    // Check if target is inside our shadow DOM
    if (this.shadowRoot.contains(target)) {
      return;
    }

    if (target instanceof HTMLElement) {
      // In text mode only elements whose content is pure text can be picked.
      if (this.mode === 'text' && !TextEditor.isEditableTextElement(target)) {
        this.hoverBox.hide();
        this.targetElement = null;
        return;
      }
      this.hoverBox.show(target);
      this.targetElement = target;
    }
  };

  private handleResize = () => {
    if (this.isActive && !this.isPaused) {
      this.markerManager.updatePositions(this.feedbackManager.getAll());
    }
  };

  private handleClick = (e: MouseEvent) => {
    if (!this.isActive || this.isPaused || this.isModalOpen) return;

    const target = e.target as HTMLElement;

    // A click while editing lands on the element being edited: let it through
    // so the caret moves, and let blur commit when focus leaves.
    if (this.textEditor.isEditing) return;

    // Check if click is inside our shadow DOM (toolbar, markers, etc.)
    // When clicking an element inside Shadow DOM, the event target is retargeted to the host (this.container)
    if (this.shadowRoot.contains(target) || target === this.container) {
      return;
    }

    // Check if clicking on the block overlay or if blocking is enabled
    // We prioritize feedback selection over blocking
    if (this.targetElement) {
      e.preventDefault();
      e.stopPropagation();

      if (this.mode === 'text') {
        this.startTextEdit(this.targetElement);
      } else {
        this.promptForFeedback(this.targetElement);
      }
      return;
    }

    if (this.settings.blockInteractions || target === this.blockOverlay) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }

    // Default behavior for non-target clicks when blocking is disabled
    // (do nothing, let event propagate)
  };

  private startTextEdit(element: HTMLElement) {
    this.hoverBox.hide();
    if (!this.textEditor.start(element)) {
      // Not a pure-text element; nothing to edit.
      return;
    }
  }

  /**
   * A committed inline edit becomes a feedback item of kind 'text-edit'. If the
   * same element was already edited, the existing item is updated so the
   * original copy is never lost behind a chain of edits.
   */
  private handleTextEditCommit(element: HTMLElement, edit: TextEditInfo) {
    const elementInfo = this.elementAnalyzer.analyze(element);
    const existing = this.feedbackManager
      .getAll()
      .find((f) => f.kind === 'text-edit' && f.element.selector === elementInfo.selector);

    if (existing && existing.textEdit) {
      const merged: TextEditInfo = {
        originalText: existing.textEdit.originalText,
        newText: edit.newText,
      };

      // Editing back to the original copy removes the item entirely.
      if (merged.newText.trim() === merged.originalText.trim()) {
        this.handleDeleteFeedback(existing.id);
        element.classList.remove('agentecho-text-edited');
        return;
      }

      this.feedbackManager.update(existing.id, {
        textEdit: merged,
        comment: this.describeTextEdit(merged),
        element: elementInfo,
        timestamp: Date.now(),
      });
      this.refreshMarkers();
      return;
    }

    const feedback: FeedbackItem = {
      id: crypto.randomUUID(),
      index: this.feedbackManager.getAll().length + 1,
      kind: 'text-edit',
      comment: this.describeTextEdit(edit),
      textEdit: edit,
      timestamp: Date.now(),
      url: window.location.href,
      element: elementInfo,
    };

    this.feedbackManager.add(feedback);
    this.markerManager.addMarker(feedback);
  }

  private describeTextEdit(edit: TextEditInfo): string {
    return `Change text from "${edit.originalText.trim()}" to "${edit.newText.trim()}"`;
  }

  private handleTextEditSessionEnd() {
    // Marker geometry may have shifted if the new copy changed the layout.
    requestAnimationFrame(() => {
      this.markerManager.updatePositions(this.feedbackManager.getAll());
    });
  }

  /** Re-apply every saved text edit to the current DOM. */
  public applySavedTextEdits() {
    TextEditor.applySavedEdits(this.feedbackManager.getAll());
  }

  public setMode(mode: OverlayMode) {
    if (this.textEditor.isEditing) {
      this.textEditor.commit();
    }
    this.mode = mode;
    this.toolbar.setMode(mode);
    this.hoverBox.hide();
    this.targetElement = null;
  }

  public toggleMode() {
    this.setMode(this.mode === 'text' ? 'comment' : 'text');
  }

  public get currentMode(): OverlayMode {
    return this.mode;
  }

  public get isEditingText(): boolean {
    return this.textEditor.isEditing;
  }

  private async promptForFeedback(element: HTMLElement) {
    this.isModalOpen = true;
    this.hoverBox.hide();

    const result = await this.feedbackModal.show(element);
    this.isModalOpen = false;

    if (!result) return;

    const elementInfo = this.elementAnalyzer.analyze(element);
    const feedback: FeedbackItem = {
      id: crypto.randomUUID(),
      index: this.feedbackManager.getAll().length + 1,
      comment: result.comment,
      timestamp: Date.now(),
      url: window.location.href,
      element: elementInfo,
    };

    this.feedbackManager.add(feedback);
    this.markerManager.addMarker(feedback);
  }

  private async handleEditFeedback(id: string) {
    const feedback = this.feedbackManager.getAll().find(f => f.id === id);
    if (!feedback) return;

    // For a text edit the action is "Revert": put the original copy back and
    // drop the item, rather than opening the comment modal.
    if (feedback.kind === 'text-edit') {
      TextEditor.revertEdit(feedback);
      this.handleDeleteFeedback(id);
      return;
    }

    // Find the element again using the selector
    const element = document.querySelector(feedback.element.selector) as HTMLElement;
    if (!element) {
      // Element no longer exists, use a placeholder
      const placeholder = document.createElement('div');
      placeholder.textContent = 'Element not found';
      this.isModalOpen = true;
      const result = await this.feedbackModal.show(placeholder, feedback.comment);
      this.isModalOpen = false;

      if (result) {
        this.feedbackManager.update(id, { comment: result.comment });
        this.markerManager.updateMarkerTooltip(id, result.comment);
      }
      return;
    }

    this.isModalOpen = true;
    const result = await this.feedbackModal.show(element, feedback.comment);
    this.isModalOpen = false;

    if (result) {
      this.feedbackManager.update(id, { comment: result.comment });
      this.markerManager.updateMarkerTooltip(id, result.comment);
    }
  }

  private handleDeleteFeedback(id: string) {
    this.feedbackManager.remove(id);
    this.markerManager.removeMarker(id);
    // Re-index remaining markers
    this.reindexMarkers();
  }

  private reindexMarkers() {
    const allFeedback = this.feedbackManager.getAll();
    allFeedback.forEach((feedback, index) => {
      feedback.index = index + 1;
    });
    // Update storage
    this.feedbackManager.save();
    // Refresh markers
    this.markerManager.clearAll();
    allFeedback.forEach((item) => {
      this.markerManager.addMarker(item);
    });
  }

  private setupToolbarListeners() {
    this.toolbar.onPauseToggle = () => this.togglePause();
    this.toolbar.onMarkersToggle = () => this.toggleMarkers();
    this.toolbar.onCopy = () => this.copyFeedback();
    this.toolbar.onDownload = () => this.downloadFeedback();
    this.toolbar.onClear = () => this.clearAll();
    this.toolbar.onExit = () => this.deactivate();
    this.toolbar.onModeToggle = (mode) => this.setMode(mode);
  }

  public loadExistingMarkers() {
    const feedback = this.feedbackManager.getAll();
    feedback.forEach((item) => {
      this.markerManager.addMarker(item);
    });
  }

  private enableBlockingMode() {
    this.container.classList.add('blocking');
    if (!this.blockOverlay) {
      this.blockOverlay = document.createElement('div');
      this.blockOverlay.className = 'agentecho-block-overlay';
      this.shadowRoot.appendChild(this.blockOverlay);
    }
  }

  private disableBlockingMode() {
    this.container.classList.remove('blocking');
    if (this.blockOverlay) {
      this.blockOverlay.remove();
      this.blockOverlay = null;
    }
  }

  activate() {
    this.isActive = true;
    document.body.appendChild(this.container);
    window.addEventListener('resize', this.handleResize);
    // Initial update to fix position if layout changed since save
    requestAnimationFrame(() => {
      try {
        this.markerManager.updatePositions(this.feedbackManager.getAll());
      } catch (e) {
        console.error('Failed to update marker positions:', e);
      }
    });
  }

  deactivate() {
    this.deactivateTextEditing();
    this.isActive = false;
    this.removeEventListeners();
    window.removeEventListener('resize', this.handleResize);
    this.container.remove();
    sendMessage({ type: 'SET_STATE', state: { isActive: false } }).catch(console.error);
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.toolbar.setPaused(this.isPaused);
    if (this.isPaused) {
      this.hoverBox.hide();
    }
  }

  toggleMarkers() {
    this.markersVisible = !this.markersVisible;
    this.markerManager.setVisible(this.markersVisible);
    this.toolbar.setMarkersVisible(this.markersVisible);
  }

  async copyFeedback() {
    const markdown = this.feedbackManager.toMarkdown();
    await navigator.clipboard.writeText(markdown);
    this.toolbar.showCopySuccess();

    if (this.settings.clearAfterCopy) {
      this.clearAll();
    }
  }

  /**
   * Save the report as a .txt file. Uses an object URL rather than the
   * downloads API so no extra extension permission is needed.
   */
  downloadFeedback(): boolean {
    const items = this.feedbackManager.getAll();
    if (items.length === 0) {
      return false;
    }

    const markdown = this.feedbackManager.toMarkdown(this.settings);
    const blob = new Blob([markdown], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = this.buildFileName();
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    link.remove();

    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    this.toolbar.showDownloadSuccess();

    if (this.settings.clearAfterCopy) {
      this.clearAll();
    }
    return true;
  }

  /** agentecho-<host>-<path>-<timestamp>.txt, kept filesystem-safe. */
  private buildFileName(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    let slug = 'page';
    try {
      const { hostname, pathname } = new URL(window.location.href);
      slug = `${hostname}${pathname}`;
    } catch {
      // Fall back to the generic slug.
    }

    slug = slug
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .substring(0, 60);

    return `agentecho-${slug || 'page'}-${stamp}.txt`;
  }

  clearAll() {
    // Put the page's original copy back before dropping the records.
    this.feedbackManager.getAll().forEach((item) => TextEditor.revertEdit(item));
    this.feedbackManager.clearAll();
    this.markerManager.clearAll();
  }

  clearAllMarkers() {
    this.markerManager.clearAll();
  }

  removeMarker(id: string) {
    this.markerManager.removeMarker(id);
  }

  refreshMarkers() {
    this.markerManager.clearAll();
    this.loadExistingMarkers();
  }

  updateSettings(settings: Partial<ExtensionSettings>) {
    const oldBlockInteractions = this.settings.blockInteractions;
    this.settings = { ...this.settings, ...settings };
    this.markerManager.updateSettings(this.settings);

    // Handle blocking mode change
    if (this.settings.blockInteractions !== oldBlockInteractions) {
      if (this.settings.blockInteractions) {
        this.enableBlockingMode();
      } else {
        this.disableBlockingMode();
      }
    }
  }

  updateFeedbackManager(feedbackManager: FeedbackManager) {
    this.feedbackManager = feedbackManager;
  }

  deactivateTextEditing() {
    if (this.textEditor.isEditing) {
      this.textEditor.commit();
    }
  }
}
