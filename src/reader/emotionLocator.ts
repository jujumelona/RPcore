import type { ReaderContextSnapshot } from '../store/readerContextStore';
import type { StoredWebNovel, WNEmotions } from '../utils/webNovelStorage';

export interface ReaderEmotionSnapshot {
  paragraphId: number | null;
  paragraphText?: string;
  emotions: Record<number, WNEmotions>;
}

const EMPTY_EMOTION_SLOT = Object.freeze({}) as Record<number, WNEmotions>;

export function resolveReaderContextParagraphId(
  snapshot: ReaderContextSnapshot | null | undefined,
  fallbackParagraphId: number | null = null,
): number | null {
  if (typeof snapshot?.paragraphId === 'number') {
    return snapshot.paragraphId;
  }

  if (typeof snapshot?.locator?.paragraphId === 'number') {
    return snapshot.locator.paragraphId;
  }

  return typeof fallbackParagraphId === 'number' ? fallbackParagraphId : null;
}

export function resolveStoredNovelEmotionSnapshot(
  novel: StoredWebNovel | null | undefined,
  snapshot: ReaderContextSnapshot | null | undefined,
  fallbackParagraphId: number | null = null,
): ReaderEmotionSnapshot {
  if (!novel) {
    return {
      paragraphId: null,
      paragraphText: snapshot?.paragraphText,
      emotions: EMPTY_EMOTION_SLOT,
    };
  }

  const paragraphId = resolveReaderContextParagraphId(snapshot, fallbackParagraphId);
  const emotionParagraphId = paragraphId ?? -1;
  const slot = novel.prefixEmotions?.[emotionParagraphId] ?? novel.prefixEmotions?.[-1];
  const paragraphText = snapshot?.paragraphText
    ?? novel.paragraphs.find(paragraph => paragraph.id === paragraphId)?.text;

  return {
    paragraphId,
    paragraphText,
    emotions: slot ?? EMPTY_EMOTION_SLOT,
  };
}
