import type { ExtensionSettings, OverlayMode } from '../../shared/types';

const TOOLBAR_STYLES = `
  .agentecho-toolbar {
    position: fixed;
    top: 16px;
    left: calc(100vw - 320px);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: #1f2937;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 2147483646;
    pointer-events: all;
    cursor: move;
    user-select: none;
  }

  .agentecho-toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: #374151;
    color: #f9fafb;
    cursor: pointer;
    transition: all 0.15s ease-out;
  }

  .agentecho-toolbar-btn:hover {
    background: #4b5563;
  }

  .agentecho-toolbar-btn:active {
    transform: scale(0.95);
  }

  .agentecho-toolbar-btn svg {
    width: 18px;
    height: 18px;
  }

  .agentecho-toolbar-btn.active {
    background: #3b82f6;
  }

  .agentecho-toolbar-btn.text-mode.active {
    background: #f59e0b;
  }

  .agentecho-toolbar-label {
    color: #f9fafb;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    padding: 0 8px;
  }

  .agentecho-toolbar-divider {
    width: 1px;
    height: 24px;
    background: #4b5563;
  }
`;

const ICONS = {
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  // exit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>`,
};

export class Toolbar {
  private element: HTMLElement;
  private isPaused = false;
  private markersVisible = true;
  private mode: OverlayMode = 'comment';
  private textBtn!: HTMLButtonElement;

  onPauseToggle?: () => void;
  onMarkersToggle?: () => void;
  onModeToggle?: (mode: OverlayMode) => void;
  onCopy?: () => void;
  onClear?: () => void;
  onExit?: () => void;

  constructor(shadowRoot: ShadowRoot, _settings: ExtensionSettings) {
    const style = document.createElement('style');
    style.textContent = TOOLBAR_STYLES;
    shadowRoot.appendChild(style);

    this.element = this.createToolbar();
    shadowRoot.appendChild(this.element);

    this.setupDragListeners();
  }

  private setupDragListeners() {
    let isDragging = false;
    let currentX: number;
    let currentY: number;
    let initialX: number;
    let initialY: number;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e: MouseEvent) => {
      // Don't start dragging if clicking a button
      if ((e.target as HTMLElement).closest('button')) return;

      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      if (e.target === this.element) {
        isDragging = true;
      }
    };

    const dragEnd = () => {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
    };

    const drag = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        this.setTranslate(currentX, currentY, this.element);
      }
    };

    this.element.addEventListener('mousedown', dragStart);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', drag);
  }

  private setTranslate(xPos: number, yPos: number, el: HTMLElement) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'agentecho-toolbar';

    const pauseBtn = this.createButton('pause', 'Pause');
    pauseBtn.onclick = () => {
      this.togglePause();
      this.onPauseToggle?.();
    };

    const eyeBtn = this.createButton('eye', 'Toggle markers');
    eyeBtn.classList.add('active');
    eyeBtn.onclick = () => {
      this.toggleMarkers();
      this.onMarkersToggle?.();
    };

    const textBtn = this.createButton('text', 'Inline text edit mode (T)');
    textBtn.classList.add('text-mode');
    textBtn.onclick = () => {
      this.setMode(this.mode === 'text' ? 'comment' : 'text');
      this.onModeToggle?.(this.mode);
    };
    this.textBtn = textBtn;

    const divider1 = document.createElement('div');
    divider1.className = 'agentecho-toolbar-divider';

    const copyBtn = this.createButton('copy', 'Copy to clipboard');
    copyBtn.onclick = () => this.onCopy?.();

    const clearBtn = this.createButton('trash', 'Clear all');
    clearBtn.onclick = () => this.onClear?.();

    const divider2 = document.createElement('div');
    divider2.className = 'agentecho-toolbar-divider';

    // const exitBtn = this.createButton('exit', 'Exit');
    // exitBtn.onclick = () => this.onExit?.();

    toolbar.appendChild(pauseBtn);
    toolbar.appendChild(eyeBtn);
    toolbar.appendChild(textBtn);
    toolbar.appendChild(divider1);
    toolbar.appendChild(copyBtn);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(divider2);
    // toolbar.appendChild(exitBtn);

    return toolbar;
  }

  private createButton(iconKey: keyof typeof ICONS, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'agentecho-toolbar-btn';
    btn.title = title;
    btn.innerHTML = ICONS[iconKey];
    return btn;
  }

  setPaused(paused: boolean) {
    this.isPaused = paused;
    const pauseBtn = this.element.querySelector('.agentecho-toolbar-btn:first-child') as HTMLButtonElement;
    if (pauseBtn) {
      pauseBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
      pauseBtn.title = paused ? 'Resume' : 'Pause';
    }
  }

  setMarkersVisible(visible: boolean) {
    this.markersVisible = visible;
    const eyeBtn = this.element.querySelector('.agentecho-toolbar-btn:nth-child(2)') as HTMLButtonElement;
    if (eyeBtn) {
      eyeBtn.innerHTML = visible ? ICONS.eye : ICONS.eyeOff;
      if (visible) {
        eyeBtn.classList.add('active');
      } else {
        eyeBtn.classList.remove('active');
      }
    }
  }

  setMode(mode: OverlayMode) {
    this.mode = mode;
    if (mode === 'text') {
      this.textBtn.classList.add('active');
    } else {
      this.textBtn.classList.remove('active');
    }
  }

  private togglePause() {
    this.setPaused(!this.isPaused);
  }

  private toggleMarkers() {
    this.setMarkersVisible(!this.markersVisible);
  }

  showCopySuccess() {
    const copyBtn = this.element.querySelector('.agentecho-toolbar-btn:nth-child(5)') as HTMLButtonElement;
    if (copyBtn) {
      const originalIcon = copyBtn.innerHTML;
      copyBtn.innerHTML = ICONS.check;
      copyBtn.style.background = '#22c55e';
      setTimeout(() => {
        copyBtn.innerHTML = originalIcon;
        copyBtn.style.background = '';
      }, 1500);
    }
  }
}
