import type { ShareAnalysisResponse } from '@safechat/contracts';

export type ScanSource = 'share' | 'manual';

export interface HistoryEntry {
  id: string;
  /** Nội dung đã quét, lưu cục bộ trên thiết bị. */
  text: string;
  source: ScanSource;
  /** ISO 8601. */
  createdAt: string;
  analysis: ShareAnalysisResponse;
}

export const HISTORY_LIMIT = 5;
export const HISTORY_STORAGE_KEY = '@safechat/history/v1';
