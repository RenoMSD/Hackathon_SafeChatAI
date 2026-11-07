// Trạng thái phiên và giao thức nhắn tin giữa side panel ⇄ background ⇄ content script.
import type { AiRequest, AiTier } from '@safechat/core/ai';
import type { ObservedMessage, TranscriptState } from '@safechat/core/transcript';
import type { StabilityState } from '@safechat/core/stability';
import type { AnalysisResult, RiskLevel, Signal, UserMark } from '@safechat/core/types';

export type SessionStatus = 'idle' | 'tracking' | 'paused' | 'stopped';
export type PauseReason = 'user' | 'tab_closed' | 'thread_changed' | 'page_unsupported';
export type AiProvider = 'nano' | 'groq';

export interface AiState {
  status: 'off' | 'idle' | 'running' | 'ok' | 'error';
  error?: string;
  /** Tóm tắt cuộn do AI viết (đã che PII), gửi kèm lần sau thay vì cả cuộc trò chuyện. */
  summary: string;
  lastSeq: number;
  lastAt: number;
  lastLevel: RiskLevel;
  /** Các loại tín hiệu quy tắc đã biết ở lần gọi trước. */
  lastRuleTypes: string[];
  signals: Signal[];
  uncertainties: string[];
  /** AI đề nghị hạ 1 bậc, gắn với mức quy tắc lúc AI đánh giá (mức đổi thì hết hiệu lực). */
  downgrade?: { reason: string; fromLevel: RiskLevel };
  detectedStage?: string;
  calls: number;
  lastProvider?: AiProvider;
  lastTier?: AiTier;
  lastReason?: string;
  /** Yêu cầu đang chờ side panel chạy bằng Gemini Nano. */
  pending?: { id: string; tier: AiTier; request: AiRequest; createdAt: number };
}

export interface TimelinePoint {
  seq: number;
  messageId: string;
  level: RiskLevel;
  score: number;
  /** Tín hiệu mới xuất hiện tại thời điểm này. */
  newSignals: string[];
  /** Ghi chú chống dao động (giữ mức / chờ xác nhận). */
  note?: string;
}

export interface Session {
  status: SessionStatus;
  pauseReason?: PauseReason;
  tabId: number;
  threadId: string;
  threadLabel: string;
  platform: 'messenger' | 'mock';
  startedAt: number;
  maxMessages: number;
  transcript: TranscriptState;
  result: AnalysisResult | null;
  ai: AiState;
  /** Diễn biến mức cảnh báo (chỉ ghi khi có thay đổi). */
  timeline: TimelinePoint[];
  /** Trạng thái chống dao động (mức hiển thị, mức cao nhất, chờ xác nhận/hạ). Thiếu ở phiên cũ → khởi tạo lại. */
  stability?: StabilityState;
  /** Phiên được tiếp tục từ file bản nháp (Context Manager). */
  resumedFrom?: { savedAt: string; threadLabel: string; startedAt: number };
  /** Đánh dấu của người dùng theo khóa tín hiệu (type + tin bằng chứng đầu tiên). */
  marks: Record<string, UserMark>;
  /** Thread mới phát hiện khi người dùng chuyển chat (chờ xác nhận). */
  pendingThread?: { threadId: string; threadLabel: string };
  /** Khung chat đã chọn đang đóng/không hiển thị: giữ phiên, chờ mở lại đúng cuộc này. */
  waiting?: boolean;
  /** Bộ đọc từ chối đọc vì không xác minh được phạm vi (vd. mã tin không khớp người đã chọn). */
  readerError?: string;
}

export interface Settings {
  maxMessages: number;
  /** AI trên máy (Chrome Prompt API / Gemini Nano) — chạy trong side panel. */
  nanoEnabled: boolean;
  groqEnabled: boolean;
  groqApiKey: string;
  groqSmallModel: string;
  groqLargeModel: string;
  /** Số lượt gọi AI ngoài tối đa mỗi ngày (giữ chi phí/hạn mức). */
  dailyBudget: number;
  /** Gọi AI định kỳ khi đủ N tin mới của đối phương. */
  batchSize: number;
  minIntervalSec: number;
}

export const DEFAULT_SETTINGS: Settings = {
  maxMessages: 300,
  nanoEnabled: false,
  groqEnabled: false,
  groqApiKey: '',
  groqSmallModel: 'llama-3.1-8b-instant',
  groqLargeModel: 'llama-3.3-70b-versatile',
  dailyBudget: 200,
  batchSize: 5,
  minIntervalSec: 10,
};

export function emptyAiState(): AiState {
  return { status: 'off', summary: '', lastSeq: 0, lastAt: 0, lastLevel: 'low', lastRuleTypes: [], signals: [], uncertainties: [], calls: 0 };
}

export const SESSION_KEY = 'safechat_session';
export const SETTINGS_KEY = 'safechat_settings';
export const USAGE_KEY = 'safechat_ai_usage';

export function signalKey(s: Signal): string {
  return `${s.type}:${s.evidence_message_ids[0] ?? ''}`;
}

export interface ThreadInfo {
  threadId: string;
  threadLabel: string;
}

export interface ProbeResult {
  supported: boolean;
  platform?: Session['platform'];
  /** Có khi chỉ có đúng một cuộc trò chuyện đang mở. */
  threadId?: string;
  threadLabel?: string;
  /** Mọi cuộc trò chuyện đang mở (chỉ tên + mã, không có nội dung tin) để người dùng chọn. */
  threads?: ThreadInfo[];
  reason?: string;
}

/** Danh sách cuộc trò chuyện từ kết quả dò (tương thích kết quả cũ chỉ có threadId). */
export function probeThreads(p: ProbeResult | null | undefined): ThreadInfo[] {
  if (!p?.supported) return [];
  if (p.threads?.length) return p.threads;
  return p.threadId ? [{ threadId: p.threadId, threadLabel: p.threadLabel ?? '' }] : [];
}

/** Side panel → background */
export type PanelRequest =
  | { kind: 'probe'; tabId: number }
  | { kind: 'start'; tabId: number; threadId?: string }
  /** Context Manager: khôi phục phiên từ file ảnh chụp (chuỗi JSON) và gắn vào cuộc chat đang mở ở tab. */
  | { kind: 'resume_snapshot'; tabId: number; snapshot: string; threadId?: string }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'stop_and_clear' }
  | { kind: 'switch_to_pending' }
  | { kind: 'mark'; key: string; mark: UserMark | null }
  | { kind: 'reanalyze' }
  | { kind: 'panel_status'; nanoReady: boolean }
  | { kind: 'ai_result'; id: string; ok: true; content: string }
  | { kind: 'ai_result'; id: string; ok: false; error: string };

export interface StopResult {
  ok: boolean;
  remainingKeys: string[];
}

/** Background → content script */
export type ContentRequest = { kind: 'cs_probe' } | { kind: 'cs_start'; threadId: string } | { kind: 'cs_stop' };

/** Content script → background */
export type ContentEvent =
  | { kind: 'cs_messages'; threadId: string; batch: ObservedMessage[]; error?: string }
  /** Khung chat đã chọn bị đóng (waiting=true) hoặc đã mở lại (false). */
  | { kind: 'cs_thread_waiting'; threadId: string; waiting: boolean }
  | { kind: 'cs_thread_changed'; threadId: string | null; threadLabel: string };
