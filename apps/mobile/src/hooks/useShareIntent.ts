import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShareIntentContext } from 'expo-share-intent';

export interface SharedContent {
  id: string;
  text: string;
  /** Tên ứng dụng hoặc tiêu đề trang được chia sẻ, nếu có. */
  source: string;
  receivedAt: number;
}

export interface UseShareIntentResult {
  content: SharedContent | null;
  isReady: boolean;
  error: string | null;
  clear: () => void;
}

const FALLBACK_SOURCE = 'Ứng dụng khác';

/**
 * Chuẩn hóa dữ liệu từ native Share Sheet (Android SEND + iOS Share Extension)
 * thành một object duy nhất cho màn hình chính.
 */
export function useShareIntent(): UseShareIntentResult {
  const { hasShareIntent, shareIntent, resetShareIntent, error, isReady } = useShareIntentContext();
  const [content, setContent] = useState<SharedContent | null>(null);
  const counter = useRef(0);

  const text = useMemo(() => {
    const rawText = shareIntent.text?.trim();
    if (rawText && rawText.length > 0) return rawText;

    const webUrl = shareIntent.webUrl?.trim();
    return webUrl && webUrl.length > 0 ? webUrl : '';
  }, [shareIntent.text, shareIntent.webUrl]);

  const source = useMemo(() => {
    const title = shareIntent.meta?.title?.trim();
    return title && title.length > 0 ? title : FALLBACK_SOURCE;
  }, [shareIntent.meta?.title]);

  useEffect(() => {
    if (!hasShareIntent || text.length === 0) return;

    counter.current += 1;
    setContent({
      id: `share-${Date.now()}-${counter.current}`,
      text,
      source,
      receivedAt: Date.now(),
    });
  }, [hasShareIntent, text, source]);

  const clear = useCallback(() => {
    setContent(null);
    resetShareIntent();
  }, [resetShareIntent]);

  return { content, isReady, error, clear };
}
