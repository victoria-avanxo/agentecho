// Uses e.code (physical key) rather than e.key so combos like Option+Shift+E
// still match on macOS, where that combo is a dead key and never produces "E" in e.key.
function mainKeyFromCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function formatHotkeyFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  parts.push(mainKeyFromCode(e.code));

  return parts.join('+');
}

export function eventMatchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  if (!hotkey) return false;

  const parts = hotkey.split('+');
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  if (e.ctrlKey !== modifiers.includes('Ctrl')) return false;
  if (e.altKey !== modifiers.includes('Alt')) return false;
  if (e.shiftKey !== modifiers.includes('Shift')) return false;
  if (e.metaKey !== modifiers.includes('Meta')) return false;

  return mainKeyFromCode(e.code) === mainKey;
}
