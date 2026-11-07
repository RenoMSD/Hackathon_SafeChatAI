import { Platform } from 'react-native';
import {
  SHARE_ANALYSIS_PATH,
  SHARE_TEXT_MAX_LENGTH,
  type ApiErrorCode,
  type ShareAnalysisRequest,
  type ShareAnalysisResponse,
} from '@safechat/contracts';

const REQUEST_TIMEOUT_MS = 15_000;
const EMULATOR_HOST = Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787';

export const GATEWAY_URL = (process.env.EXPO_PUBLIC_GATEWAY_URL?.trim() || EMULATOR_HOST).replace(/\/+$/, '');
export const SHARE_ENDPOINT = `${GATEWAY_URL}${SHARE_ANALYSIS_PATH}`;

export type ShareApiErrorCode = ApiErrorCode | 'NETWORK' | 'INVALID_RESPONSE';

export class ShareApiError extends Error {
  readonly code: ShareApiErrorCode;
  readonly status?: number;

  constructor(message: string, code: ShareApiErrorCode, status?: number) {
    super(message);
    this.name = 'ShareApiError';
    this.code = code;
    this.status = status;
  }

  get isRetryable(): boolean {
    return (
      this.code === 'NETWORK' ||
      this.code === 'TIMEOUT' ||
      this.code === 'MODEL_UNAVAILABLE' ||
      this.status === 429 ||
      (this.status ?? 0) >= 500
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const API_ERROR_CODES: readonly ApiErrorCode[] = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'QUOTA_EXCEEDED',
  'BUDGET_EXCEEDED',
  'MODEL_UNAVAILABLE',
  'TIMEOUT',
  'INTERNAL',
];

function isApiErrorCode(value: string): value is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(value);
}

function parseApiError(payload: unknown): { code: ApiErrorCode; message: string } | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;

  const code = payload.error.code;
  const message = payload.error.message;
  if (typeof code !== 'string' || typeof message !== 'string' || !isApiErrorCode(code)) return null;

  return { code, message };
}

function isShareAnalysisResponse(value: unknown): value is ShareAnalysisResponse {
  if (!isRecord(value)) return false;

  const level = value.riskLevel;
  const recommendation = value.recommendation;
  return (
    typeof value.riskScore === 'number' &&
    Number.isFinite(value.riskScore) &&
    (level === 'low' || level === 'medium' || level === 'high') &&
    typeof value.riskLabel === 'string' &&
    Array.isArray(value.matchedRules) &&
    isRecord(recommendation) &&
    typeof recommendation.headline === 'string' &&
    Array.isArray(recommendation.actions) &&
    typeof value.analyzedAt === 'string'
  );
}

/**
 * Gửi nội dung được chia sẻ tới SafeChat Gateway.
 * Không gửi kèm danh tính; server không lưu nội dung.
 */
export async function analyzeSharedText(input: string, source?: string): Promise<ShareAnalysisResponse> {
  const text = input.trim();
  if (text.length === 0) {
    throw new ShareApiError('Nội dung kiểm tra đang trống.', 'BAD_REQUEST');
  }
  if (text.length > SHARE_TEXT_MAX_LENGTH) {
    throw new ShareApiError(`Nội dung vượt quá ${SHARE_TEXT_MAX_LENGTH} ký tự.`, 'BAD_REQUEST');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const requestBody: ShareAnalysisRequest = source ? { text, source } : { text };

  try {
    const response = await fetch(SHARE_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const apiError = parseApiError(payload);
      throw new ShareApiError(
        apiError?.message ?? `Máy chủ trả về lỗi ${response.status}.`,
        apiError?.code ?? 'INTERNAL',
        response.status,
      );
    }

    if (!isShareAnalysisResponse(payload)) {
      throw new ShareApiError('Phản hồi từ máy chủ không đúng định dạng.', 'INVALID_RESPONSE', response.status);
    }

    return payload;
  } catch (error) {
    if (error instanceof ShareApiError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ShareApiError('Hết thời gian chờ máy chủ phân tích. Hãy thử lại.', 'TIMEOUT');
    }

    throw new ShareApiError(
      'Không kết nối được SafeChat Gateway. Kiểm tra mạng và địa chỉ máy chủ.',
      'NETWORK',
    );
  } finally {
    clearTimeout(timer);
  }
}
