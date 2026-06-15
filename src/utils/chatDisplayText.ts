import { applyUserNameStr } from '../store/userProfileStore';

function resolveUiUserName(userName?: string): string {
  const trimmed = typeof userName === 'string' ? userName.trim() : '';
  return trimmed || 'You';
}

function trimRepeatedSuffix(text: string): string {
  if (text.length < 80) return text;

  const maxPatternLength = Math.min(120, Math.floor(text.length / 3));
  for (let len = maxPatternLength; len >= 4; len--) {
    const phrase = text.slice(-len);
    if (phrase.trim().length < 2) continue;

    let repeats = 1;
    let cursor = text.length - len;
    while (cursor - len >= 0 && text.slice(cursor - len, cursor) === phrase) {
      repeats += 1;
      cursor -= len;
    }

    const minRepeats =
      len >= 40 ? 3 :
      len >= 16 ? 4 :
      5;

    if (repeats < minRepeats) continue;

    const keptRepeats = len >= 40 ? 1 : 2;
    const keepFrom = text.length - (len * repeats);
    return `${text.slice(0, keepFrom)}${phrase.repeat(keptRepeats)}…`;
  }

  return text;
}

function trimRepeatedLineRuns(text: string): string {
  const lines = text.split('\n');
  if (lines.length < 3) return text;

  const trimmedLines = [...lines];
  for (let size = Math.min(3, Math.floor(lines.length / 2)); size >= 1; size--) {
    const phrase = lines.slice(-size).join('\n').trim();
    if (phrase.length < 8) continue;

    let repeats = 1;
    let cursor = lines.length - size;
    while (cursor - size >= 0 && lines.slice(cursor - size, cursor).join('\n').trim() === phrase) {
      repeats += 1;
      cursor -= size;
    }

    if (repeats < 3) continue;

    const keepRepeats = 1;
    const keepFrom = lines.length - (size * repeats);
    return [...trimmedLines.slice(0, keepFrom), ...lines.slice(-size * keepRepeats), '…'].join('\n');
  }

  return text;
}

function trimUiRepeatArtifacts(text: string): string {
  const trimmedLines = trimRepeatedLineRuns(text);
  return trimRepeatedSuffix(trimmedLines);
}

export function formatChatTextForDisplay(text: string, userName?: string): string {
  if (!text) return text;
  return trimUiRepeatArtifacts(applyUserNameStr(text, resolveUiUserName(userName)));
}
