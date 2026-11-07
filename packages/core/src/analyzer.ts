import { buildAdvice } from './advice';
import { applyContextMitigations, applyVerificationMitigation, entitySignals } from './context';
import { validateEvidence } from './evidence';
import { buildLedger } from './ledger';
import { normalizeForMatch } from './normalize';
import { ALL_RULES, GROUP_WINDOW, groupsSatisfied, matchGroups, matchRule, type Rule } from './rules';
import { isProtectiveWarning } from './rules/warning';
import { levelOf, scoreSignals } from './scoring';
import { deriveStages } from './stages';
import { canonicalSignalType } from './taxonomy';
import type { AnalysisResult, ChatMessage, RiskLevel, Signal } from './types';
import { RISK_LEVEL_LABEL, RISK_LEVEL_ORDER } from './types';

function quote(m: ChatMessage): string {
  const t = m.text.trim();
  return t.length > 220 ? t.slice(0, 217) + '…' : t;
}

function toSignal(rule: Rule, ms: ChatMessage[]): Signal {
  return {
    type: rule.type,
    category: rule.category,
    severity: rule.severity,
    title: rule.title,
    explanation: rule.explanation,
    evidence_message_ids: ms.map((m) => m.id),
    evidence_quotes: ms.map(quote),
    recommended_action: rule.recommended_action,
    source: 'rule',
    direct_danger: rule.direct_danger,
    ref: rule.ref,
  };
}

/**
 * Chạy toàn bộ bộ quy tắc trên tin của đối phương:
 *  - luật `patterns`: mỗi tin khớp là một bằng chứng; gộp cùng loại thành một tín hiệu;
 *  - luật `groups` (ANY_N): trượt cửa sổ GROUP_WINDOW tin; kích hoạt khi đủ nhóm khớp,
 *    bằng chứng là các tin đóng góp nhóm trong các cửa sổ thỏa điều kiện.
 */
export function runRules(messages: ChatMessage[]): Signal[] {
  const others = messages.filter((m) => m.sender !== 'self');
  // Tin đang cảnh báo về lừa đảo, không yêu cầu người nhận làm gì: không dùng làm bằng chứng
  const normalized = others.map((m) => {
    const n = normalizeForMatch(m.text);
    return isProtectiveWarning(n) ? '' : n;
  });
  const out: Signal[] = [];

  for (const rule of ALL_RULES) {
    if (rule.groups) {
      const hits = normalized.map((n) => matchGroups(rule, n));
      const evidence = new Set<number>();
      for (let i = 0; i < others.length; i++) {
        const from = Math.max(0, i - GROUP_WINDOW + 1);
        const union = new Set<number>();
        for (let j = from; j <= i; j++) hits[j]!.forEach((g) => union.add(g));
        if (!groupsSatisfied(rule, union)) continue;
        for (let j = from; j <= i; j++) if (hits[j]!.length) evidence.add(j);
      }
      if (evidence.size) out.push(toSignal(rule, [...evidence].sort((a, b) => a - b).map((j) => others[j]!)));
    } else {
      const ms = others.filter((_, i) => matchRule(rule, normalized[i]!));
      if (ms.length) out.push(toSignal(rule, ms));
    }
  }
  // Trùng nghĩa: giữ tín hiệu cụ thể hơn
  const types = new Set(out.map((s) => s.type));
  return out.filter((s) => {
    if (s.type === 'secrecy_general' && types.has('secrecy_from_family')) return false;
    // R04 đã bao trùm nạp tiền làm nhiệm vụ ở giai đoạn giam tiền
    if (s.type === 'task_deposit' && types.has('task_freeze_extortion')) return false;
    // R06 (nghi tài khoản bị chiếm) cụ thể hơn lời nhờ mượn tiền chung chung
    if (s.type === 'borrow_request' && types.has('account_takeover_borrow')) return false;
    return true;
  });
}

const JOB_CONTEXT = /\b(tuyen|viec|luong|ung tuyen|phong van|cong viec|nhan vien|ctv|cong tac vien|thu nhap)\b/;

function uncertainties(messages: ChatMessage[], signals: Signal[], hasCompany: boolean, hasContract: boolean): string[] {
  const out: string[] = [];
  const others = messages.filter((m) => m.sender !== 'self');
  const jobRelated = others.some((m) => JOB_CONTEXT.test(normalizeForMatch(m.text)));
  if (messages.length < 4) out.push('Mới đọc được ít tin nhắn; kết quả có thể thay đổi khi có thêm nội dung.');
  if (messages.some((m) => m.sender === 'unknown'))
    out.push('Một số tin nhắn chưa xác định được người gửi; quy tắc vẫn được áp dụng cho các tin này.');
  if (jobRelated && !hasCompany) out.push('Chưa thấy tên pháp nhân/đơn vị tuyển dụng rõ ràng trong phần đã đọc.');
  if (jobRelated && !hasContract && !signals.some((s) => s.type === 'no_written_contract'))
    out.push('Chưa thấy đề cập hợp đồng hoặc thư mời nhận việc bằng văn bản.');
  return out;
}

export interface AnalyzeOptions {
  /** Tín hiệu bổ sung từ AI (chưa kiểm tra bằng chứng). */
  aiSignals?: Signal[];
  aiUncertainties?: string[];
  aiStatus?: AnalysisResult['ai_status'];
  aiError?: string;
  /**
   * AI đề nghị hạ 1 bậc (lọc cảnh báo nhầm). Chỉ áp dụng khi mức quy tắc hiện tại vẫn đúng bằng
   * `fromLevel` lúc AI đánh giá (có bằng chứng mới thì đề nghị hết hiệu lực), không bao giờ từ
   * Nghiêm trọng và không khi có tín hiệu nguy hiểm trực tiếp.
   */
  aiDowngrade?: { reason: string; fromLevel: RiskLevel };
}

const LEVEL_CEILING: Record<RiskLevel, number> = { low: 24, attention: 59, high: 99, critical: 100 };
const LOWER: Record<RiskLevel, RiskLevel> = { low: 'low', attention: 'low', high: 'attention', critical: 'critical' };

export function analyze(messages: ChatMessage[], opts: AnalyzeOptions = {}): AnalysisResult {
  const ruleSignals = applyVerificationMitigation(
    applyContextMitigations([...runRules(messages), ...entitySignals(messages)], messages),
    messages,
  );
  const ledger = buildLedger(messages);

  let aiSignals: Signal[] = [];
  if (opts.aiSignals?.length) {
    // So khớp theo loại chuẩn: AI có thể gọi cùng dấu hiệu bằng tên khác (money_transfer ≈ fee_upfront).
    const known = new Set([...ruleSignals, ...ledger.signals].map((s) => canonicalSignalType(s.type)));
    // AI chỉ bổ sung loại tín hiệu mới; bằng chứng phải khớp tin nhắn thật (tin cũ bị cắt khỏi bản nháp → bỏ).
    // AI một mình không được kích hoạt chế độ Nghiêm trọng: mức "critical" của AI được hạ xuống "high".
    aiSignals = validateEvidence(
      opts.aiSignals.filter((s) => !known.has(canonicalSignalType(s.type))),
      messages,
    ).valid.map((s) => (s.severity === 'critical' ? { ...s, severity: 'high' as const, direct_danger: false } : s));
  }

  const signals = [...ruleSignals, ...ledger.signals, ...aiSignals];
  const stages = deriveStages(signals, messages);
  const scored = scoreSignals(signals, stages.bonus);

  let level = scored.level;
  let score = scored.score;
  let levelReason = scored.reason;
  let ai_downgrade: string | undefined;
  const dg = opts.aiDowngrade;
  if (
    dg &&
    dg.reason &&
    dg.fromLevel === level &&
    level !== 'critical' &&
    level !== 'low' &&
    !signals.some((s) => s.direct_danger)
  ) {
    const to = LOWER[level];
    ai_downgrade = `AI đề nghị hạ từ ${RISK_LEVEL_LABEL[level]} xuống ${RISK_LEVEL_LABEL[to]}: ${dg.reason}`;
    levelReason += ` ${ai_downgrade}.`;
    level = to;
    score = Math.min(score, LEVEL_CEILING[to]);
  }
  if (levelOf(score) !== level && RISK_LEVEL_ORDER[levelOf(score)] > RISK_LEVEL_ORDER[level]) score = LEVEL_CEILING[level];
  const severityRank = { critical: 3, high: 2, medium: 1, low: 0 } as const;
  signals.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);

  const category_counts: AnalysisResult['category_counts'] = {};
  for (const s of signals) category_counts[s.category] = (category_counts[s.category] ?? 0) + 1;

  const unc = uncertainties(
    messages,
    signals,
    ledger.claims.some((c) => c.claim_type === 'company'),
    ledger.claims.some((c) => c.claim_type === 'contract'),
  );
  for (const u of opts.aiUncertainties ?? []) if (!unc.includes(u)) unc.push(`${u} (AI)`);

  return {
    risk_level: level,
    score,
    score_breakdown: scored.breakdown,
    level_reason: levelReason,
    category_counts,
    stage: stages.stage,
    stages_reached: stages.stages_reached,
    ai_downgrade,
    level_before_ai: scored.level,
    signals,
    claims: ledger.claims,
    uncertainties: unc.slice(0, 8),
    safety_priority: scored.safety_priority,
    advice: buildAdvice(level, signals, scored.safety_priority),
    analyzed_message_count: messages.length,
    ai_status: opts.aiStatus ?? 'off',
    ai_error: opts.aiError,
  };
}
