// src/components/messageBubble/hooks/useProgressiveContent.ts
import { useState, useEffect, useRef } from 'react';
import { PROGRESSIVE_THRESHOLD, PROGRESSIVE_INITIAL } from '../constants';

export function useProgressiveContent(content: string, isStreaming?: boolean): string {
  const [revealed, setRevealed] = useState(() =>
    content.length > PROGRESSIVE_THRESHOLD && !isStreaming
      ? content.slice(0, PROGRESSIVE_INITIAL)
      : content,
  );

  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  useEffect(() => {
    let cancelled = false;

    if (isStreamingRef.current) {
      setRevealed(content);
      return;
    }
    if (content.length <= PROGRESSIVE_THRESHOLD) {
      setRevealed(content);
      return;
    }
    setRevealed(content.slice(0, PROGRESSIVE_INITIAL));
    const id = requestAnimationFrame(() => {
      // [수정] 언마운트 후 setState 방지
      if (!cancelled) setRevealed(content);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [content]);

  return revealed;
}
