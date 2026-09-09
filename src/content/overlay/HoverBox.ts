const HOVER_BOX_STYLES = `
  .agentecho-hover-box {
    position: absolute;
    border: 2px solid #3b82f6;
    background-color: rgba(59, 130, 246, 0.1);
    pointer-events: none;
    transition: all 0.1s ease-out;
    z-index: 2147483646;
  }
`;

export class HoverBox {
  private element: HTMLElement;
  private currentElement: HTMLElement | null = null;

  constructor(shadowRoot: ShadowRoot) {
    this.element = document.createElement('div');
    this.element.className = 'agentecho-hover-box';

    const style = document.createElement('style');
    style.textContent = HOVER_BOX_STYLES;
    shadowRoot.appendChild(style);
    shadowRoot.appendChild(this.element);
  }

  show(target: HTMLElement) {
    if (this.currentElement === target) return;

    this.currentElement = target;
    this.paint(target.getBoundingClientRect());
  }

  /**
   * Highlight an arbitrary rect - used to outline a single run of text inside
   * an element that also contains inline markup.
   */
  showRect(rect: DOMRect) {
    this.currentElement = null;
    this.paint(rect);
  }

  private paint(rect: DOMRect) {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    this.element.style.top = `${rect.top + scrollTop}px`;
    this.element.style.left = `${rect.left + scrollLeft}px`;
    this.element.style.width = `${rect.width}px`;
    this.element.style.height = `${rect.height}px`;
    this.element.style.display = 'block';
  }

  hide() {
    this.element.style.display = 'none';
    this.currentElement = null;
  }
}
