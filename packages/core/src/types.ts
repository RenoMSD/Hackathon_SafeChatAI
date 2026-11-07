// Kiểu dữ liệu dùng chung giữa core, background, content và side panel.
// core/ là logic thuần: không gọi chrome.* để có thể chạy trong Vitest.

/** self = người dùng; other = đối phương; unknown = adapter không xác định chắc chắn. */
export type Sender = 'self' | 'other' | 'unknown';

export interface ChatMessage {
  /** ID ổn định trong phiên, dạng "msg-001". */
  id: string;
  sender: Sender;
  text: string;
  /** Thứ tự quan sát trong phiên (bắt đầu từ 1). */
  seq: number;
  /** Thời điểm hiển thị nếu đọc được đáng tin cậy từ giao diện. */
  timestamp?: string;
}

export type RiskLevel = 'low' | 'attention' | 'high' | 'critical';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type SignalCategory =
  | 'finance'
  | 'account'
  | 'identity'
  | 'job_terms'
  | 'pressure'
  | 'isolation'
  | 'contradiction'
  | 'impersonation'
  | 'technical'
  | 'investment';

/** Giai đoạn kịch bản lừa đảo (tonghopkichban.md): suy ra từ tín hiệu, chỉ để hiển thị tiến trình + cộng điểm có trần. */
export type ScamStage = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

export type UserMark = 'verified' | 'not_relevant' | 'review';

export interface Signal {
  /** Loại tín hiệu, ví dụ "upfront_fee", "possible_contradiction". */
  type: string;
  category: SignalCategory;
  severity: Severity;
  title: string;
  explanation: string;
  evidence_message_ids: string[];
  /** Trích dẫn nguyên văn từ tin nhắn nguồn (cùng thứ tự với evidence_message_ids). */
  evidence_quotes: string[];
  recommended_action: string;
  source: 'rule' | 'ledger' | 'ai';
  /** Tín hiệu nguy hiểm trực tiếp → ưu tiên an toàn, mức Nghiêm trọng. */
  direct_danger?: boolean;
  /** Mức độ chắc chắn do AI tự đánh giá (0–1); rules không đặt trường này. */
  confidence?: number;
  /** Đã được hạ mức do ngữ cảnh hợp lệ (vd. chia tiền ăn, mua hàng có COD) — lý do hiển thị cho người dùng. */
  mitigation?: string;
  /** Mã luật trong tài liệu kịch bản (vd. R04). */
  ref?: string;
}

export type ClaimType = 'fee' | 'salary' | 'company' | 'location' | 'contract';
export type ClaimStatus = 'unverified' | 'consistent' | 'possible_contradiction' | 'explained';

export interface Claim {
  claim_id: string;
  claim_type: ClaimType;
  /** Nội dung rút gọn trung lập, ví dụ "Không thu phí", "Lương ~8.000.000đ/tháng". */
  claim_text: string;
  /** Giá trị đã chuẩn hóa để so sánh (tên công ty không dấu, số tiền/tháng...). */
  value: string;
  source_message_id: string;
  timestamp?: string;
  status: ClaimStatus;
  related_claim_ids: string[];
  evidence_quotes: string[];
}

export interface Advice {
  actions: string[];
  /** Câu hỏi xác minh trung lập; rỗng khi safety_priority = true. */
  questions: string[];
  safety_message?: string;
  support_resources?: string[];
}

export interface ScoreBreakdownItem {
  type: string;
  title: string;
  severity: Severity;
  base_points: number;
  weight: number;
  contribution: number;
}

export interface AnalysisResult {
  risk_level: RiskLevel;
  /** Điểm dấu hiệu 0–100 — KHÔNG phải xác suất lừa đảo. */
  score: number;
  /** Đóng góp của từng tín hiệu vào điểm. */
  score_breakdown: ScoreBreakdownItem[];
  /** Giải thích bằng lời vì sao ra mức hiện tại. */
  level_reason: string;
  /** Số tín hiệu theo nhóm. */
  category_counts: Partial<Record<SignalCategory, number>>;
  /** Giai đoạn cao nhất đã thấy và các giai đoạn đã đi qua (theo thứ tự). */
  stage: ScamStage;
  stages_reached: { stage: ScamStage; first_message_id: string }[];
  /** AI đã hạ 1 bậc (nếu có) — lý do. */
  ai_downgrade?: string;
  /** Mức trước khi áp dụng đề nghị hạ của AI (dùng để gắn đề nghị với đúng trạng thái). */
  level_before_ai: RiskLevel;
  /** Mức thô do analyze tính, trước lớp chống dao động (core/stability.ts); không đặt nếu chưa qua lớp đó. */
  raw_level?: RiskLevel;
  /** Lý do mức hiển thị đang được giữ/chờ xác nhận (chống dao động). */
  stability_note?: string;
  signals: Signal[];
  claims: Claim[];
  uncertainties: string[];
  safety_priority: boolean;
  advice: Advice;
  analyzed_message_count: number;
  ai_status: 'off' | 'ok' | 'error' | 'pending';
  ai_error?: string;
}

export const CATEGORY_LABEL: Record<SignalCategory, string> = {
  finance: 'Tài chính',
  account: 'Tài khoản & dữ liệu',
  identity: 'Danh tính doanh nghiệp',
  job_terms: 'Điều kiện việc làm',
  pressure: 'Thao túng / áp lực',
  isolation: 'Cô lập / di chuyển',
  contradiction: 'Mâu thuẫn',
  impersonation: 'Mạo danh',
  technical: 'Kỹ thuật / đường link',
  investment: 'Đầu tư',
};

export const STAGE_LABEL: Record<ScamStage, string> = {
  S0: 'Tiếp cận',
  S1: 'Xây dựng lòng tin',
  S2: 'Điều hướng kênh kín',
  S3: 'Kích hoạt bẫy',
  S4: 'Chốt chặn & cưỡng đoạt',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Nghiêm trọng',
};

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  low: 'Thấp',
  attention: 'Cần chú ý',
  high: 'Cao',
  critical: 'Nghiêm trọng',
};

export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  attention: 1,
  high: 2,
  critical: 3,
};
