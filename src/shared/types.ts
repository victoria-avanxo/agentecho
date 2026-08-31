export type FeedbackKind = 'comment' | 'text-edit';

export interface FeedbackItem {
  id: string;
  index: number;
  comment: string;
  timestamp: number;
  url: string;
  category?: 'bug' | 'improvement' | 'question' | 'design';
  element: ElementInfo;
  /** Defaults to 'comment' when absent (feedback saved before text edits existed). */
  kind?: FeedbackKind;
  /** Only present when kind === 'text-edit'. */
  textEdit?: TextEditInfo;
}

/**
 * A literal copy change made inline on the page. Only text is captured -
 * styles, classes and markup are never part of a text edit.
 */
export interface TextEditInfo {
  originalText: string;
  newText: string;
}

export interface ElementInfo {
  selector: string;
  tagName: string;
  id?: string;
  classes: string[];
  textContent?: string;
  dataAttributes: Record<string, string>;
  component?: ComponentInfo;
  boundingRect: DOMRect;
  screenshot?: string;
}

export interface ComponentInfo {
  framework: 'react' | 'angular' | 'vue' | 'svelte' | 'unknown';
  name: string;
  props?: Record<string, unknown>;
  filePath?: string;
}

export interface ExtensionSettings {
  markerColor: string;
  outputDetail: 'minimal' | 'standard' | 'comprehensive';
  clearAfterCopy: boolean;
  blockInteractions: boolean;
  theme: 'light' | 'dark' | 'auto';
}

export type OverlayMode = 'comment' | 'text';

export interface ExtensionState {
  isActive: boolean;
  isPaused: boolean;
  markersVisible: boolean;
  currentUrl: string;
  mode?: OverlayMode;
}

export type Message =
  | { type: 'TOGGLE_EXTENSION'; tabId?: number }
  | { type: 'GET_STATE'; tabId?: number }
  | { type: 'SET_STATE'; tabId?: number; state: Partial<ExtensionState> }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: Partial<ExtensionSettings> }
  | { type: 'GET_FEEDBACK'; url: string }
  | { type: 'SAVE_FEEDBACK'; url: string; feedback: FeedbackItem[] }
  | { type: 'ACTIVATE_OVERLAY' }
  | { type: 'DEACTIVATE_OVERLAY' }
  | { type: 'ADD_FEEDBACK'; item: FeedbackItem }
  | { type: 'REMOVE_FEEDBACK'; id: string }
  | { type: 'UPDATE_FEEDBACK'; id: string; updates: Partial<FeedbackItem> }
  | { type: 'COPY_FEEDBACK'; url: string }
  | { type: 'CLEAR_FEEDBACK' }
  | { type: 'TOGGLE_MARKERS' }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'SET_MODE'; mode: OverlayMode }
  | { type: 'REVERT_TEXT_EDIT'; id: string };

export const DEFAULT_SETTINGS: ExtensionSettings = {
  markerColor: '#ef4444',
  outputDetail: 'standard',
  clearAfterCopy: false,
  blockInteractions: false,
  theme: 'auto',
};
