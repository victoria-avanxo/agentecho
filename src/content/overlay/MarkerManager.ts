import type { FeedbackItem, ExtensionSettings } from '../../shared/types';

export interface MarkerCallbacks {
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const TEXT_EDIT_COLOR = '#f59e0b';

const MARKER_STYLES = (color: string) => `
  .agentecho-markers-container {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 2147483645;
  }

  .agentecho-marker {
    position: absolute;
    width: 28px;
    height: 28px;
    background-color: ${color};
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s ease-out, opacity 0.15s ease-out;
    pointer-events: all;
    user-select: none;
  }

  .agentecho-marker:hover {
    transform: scale(1.15);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .agentecho-marker.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .agentecho-marker.text-edit {
    background-color: ${TEXT_EDIT_COLOR};
    border-radius: 6px;
  }

  .agentecho-marker-diff {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    line-height: 1.5;
    margin-bottom: 10px;
    word-wrap: break-word;
    white-space: pre-wrap;
  }

  .agentecho-marker-diff .old {
    color: #fca5a5;
    text-decoration: line-through;
    display: block;
  }

  .agentecho-marker-diff .new {
    color: #86efac;
    display: block;
    margin-top: 4px;
  }

  .agentecho-marker-btn.revert {
    background: #6b7280;
  }

  .agentecho-marker-btn.revert:hover {
    background: #4b5563;
  }

  .agentecho-marker-popup {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    border-radius: 8px;
    padding: 10px 12px;
    min-width: 180px;
    max-width: 280px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.15s ease-out, visibility 0.15s ease-out;
    z-index: 2147483646;
  }

  .agentecho-marker-popup::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: #1f2937;
  }

  .agentecho-marker:hover .agentecho-marker-popup {
    opacity: 1;
    visibility: visible;
    pointer-events: all;
  }

  .agentecho-marker-comment {
    color: #f3f4f6;
    font-size: 13px;
    line-height: 1.4;
    margin-bottom: 10px;
    word-wrap: break-word;
    white-space: pre-wrap;
  }

  .agentecho-marker-actions {
    display: flex;
    gap: 6px;
    border-top: 1px solid #374151;
    padding-top: 10px;
  }

  .agentecho-marker-btn {
    flex: 1;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 500;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: white;
    transition: background 0.15s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .agentecho-marker-btn.edit {
    background: #3b82f6;
  }

  .agentecho-marker-btn.edit:hover {
    background: #2563eb;
  }

  .agentecho-marker-btn.delete {
    background: #ef4444;
  }

  .agentecho-marker-btn.delete:hover {
    background: #dc2626;
  }
`;

export class MarkerManager {
  private shadowRoot: ShadowRoot;
  private settings: ExtensionSettings;
  private callbacks: MarkerCallbacks;
  private container: HTMLElement;
  private markers = new Map<string, { element: HTMLElement; commentEl: HTMLElement }>();
  private visible = true;

  constructor(shadowRoot: ShadowRoot, settings: ExtensionSettings, callbacks: MarkerCallbacks) {
    this.shadowRoot = shadowRoot;
    this.settings = settings;
    this.callbacks = callbacks;
    
    // Create container for markers
    this.container = document.createElement('div');
    this.container.className = 'agentecho-markers-container';
    this.shadowRoot.appendChild(this.container);
    
    this.injectStyles();
  }

  private injectStyles() {
    let styleElement = this.shadowRoot.querySelector('#agentecho-marker-styles');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'agentecho-marker-styles';
      this.shadowRoot.appendChild(styleElement);
    }
    (styleElement as HTMLStyleElement).textContent = MARKER_STYLES(this.settings.markerColor);
  }

  addMarker(feedback: FeedbackItem) {
    const rect = feedback.element.boundingRect;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    const isTextEdit = feedback.kind === 'text-edit';

    const marker = document.createElement('div');
    marker.className = isTextEdit ? 'agentecho-marker text-edit' : 'agentecho-marker';
    marker.dataset.feedbackId = feedback.id;
    marker.textContent = feedback.index.toString();
    marker.style.top = `${rect.top + scrollTop - 14}px`;
    marker.style.left = `${rect.left + scrollLeft + rect.width / 2 - 14}px`;

    // Create popup container
    const popup = document.createElement('div');
    popup.className = 'agentecho-marker-popup';

    // Comment text - for a text edit, show the before/after copy instead.
    const commentEl = document.createElement('div');
    if (isTextEdit && feedback.textEdit) {
      commentEl.className = 'agentecho-marker-diff';
      const oldEl = document.createElement('span');
      oldEl.className = 'old';
      oldEl.textContent = feedback.textEdit.originalText;
      const newEl = document.createElement('span');
      newEl.className = 'new';
      newEl.textContent = feedback.textEdit.newText;
      commentEl.appendChild(oldEl);
      commentEl.appendChild(newEl);
    } else {
      commentEl.className = 'agentecho-marker-comment';
      commentEl.textContent = feedback.comment;
    }

    // Actions container
    const actions = document.createElement('div');
    actions.className = 'agentecho-marker-actions';

    const editBtn = document.createElement('button');
    editBtn.className = isTextEdit ? 'agentecho-marker-btn revert' : 'agentecho-marker-btn edit';
    editBtn.textContent = isTextEdit ? 'Revert' : 'Edit';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.callbacks.onEdit(feedback.id);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'agentecho-marker-btn delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.callbacks.onDelete(feedback.id);
    };

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    popup.appendChild(commentEl);
    popup.appendChild(actions);
    marker.appendChild(popup);

    this.container.appendChild(marker);
    this.markers.set(feedback.id, { element: marker, commentEl });

    if (!this.visible) {
      marker.classList.add('hidden');
    }
  }

  updateMarkerTooltip(id: string, newComment: string) {
    const markerData = this.markers.get(id);
    // Text-edit popups render a before/after diff, not a plain comment.
    if (markerData && markerData.commentEl.className === 'agentecho-marker-comment') {
      markerData.commentEl.textContent = newComment;
    }
  }

  removeMarker(id: string) {
    const markerData = this.markers.get(id);
    if (markerData) {
      markerData.element.remove();
      this.markers.delete(id);
    }
  }

  clearAll() {
    this.markers.forEach(({ element }) => element.remove());
    this.markers.clear();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.markers.forEach(({ element }) => {
      if (visible) {
        element.classList.remove('hidden');
      } else {
        element.classList.add('hidden');
      }
    });
  }

  updatePositions(feedbackItems: FeedbackItem[]) {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    feedbackItems.forEach(item => {
      const markerData = this.markers.get(item.id);
      if (!markerData) return;

      let rect = item.element.boundingRect;
      try {
        const currentElement = document.querySelector(item.element.selector);
        if (currentElement) {
          rect = currentElement.getBoundingClientRect();
        }
      } catch (e) {
        // Ignore selector errors, keep original rect
      }

      markerData.element.style.top = `${rect.top + scrollTop - 14}px`;
      markerData.element.style.left = `${rect.left + scrollLeft + rect.width / 2 - 14}px`;
    });
  }

  updateSettings(settings: ExtensionSettings) {
    this.settings = settings;
    this.injectStyles();
  }
}
