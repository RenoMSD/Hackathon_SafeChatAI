import type { AiParsed } from '@safechat/core/ai';
import type { RiskLevel, ScamStage, Signal } from '@safechat/core/types';
import { RISK_LEVEL_ORDER } from '@safechat/core/types';
import type { GatewayConfig } from './config';
import { containsPromptLeak, maskPii, truncateChars } from './text';
import { calibrateSignals, dropBenignWarnings, dropRuleDuplicates, isDangerousType, normalizeSignals } from './taxonomy';

const STAGES: ScamStage[] = ['S0', 'S1', 'S2', 'S3', 'S4'];

export interface GuardInput {
  parsed: AiParsed;
  currentLevel: RiskLevel;
  clientStage?: ScamStage;
  clientSummary: string;
  /** Loại tín hiệu bộ luật đã báo; AI trùng loại sẽ bị bỏ để không tính điểm hai lần. */
  ruleHintTypes?: string[];
  cfg: Pick<GatewayConfig, 'aiMaxSignals' | 'summaryMaxChars'>;
}

export interface GuardResult {
  signals: Signal[];
  summary: string;
  uncertainties: string[];
  rejected: number;
  downgradeReason?: string;
  detectedStage?: ScamStage;
  promptLeakSuspected: boolean;
}

function hasDanger(signals: Signal[], currentLevel: RiskLevel): boolean {
  if (RISK_LEVEL_ORDER[currentLevel] >= RISK_LEVEL_ORDER.high) return true;
  return signals.some(
    (s) => s.severity === 'high' || s.severity === 'critical' || isDangerousType(s.type) || s.direct_danger,
  );
}

function stageIndex(stage: ScamStage): number {
  return STAGES.indexOf(stage);
}

function clampStage(detected: string | undefined, clientStage: ScamStage | undefined, signals: Signal[]): ScamStage | undefined {
  if (!detected || !/^S[0-4]$/.test(detected)) return undefined;
  const next = detected as ScamStage;
  if (!clientStage) return next;
  const from = stageIndex(clientStage);
  const to = stageIndex(next);
  if (to >= from) return next;
  // Có bằng chứng mạnh thì cho lùi tối đa một bước; không có thì giữ nguyên stage client.
  const hasEvidence = signals.some((s) => (s.severity === 'high' || s.severity === 'critical') && s.evidence_message_ids.length > 0);
  if (!hasEvidence) return clientStage;
  return STAGES[Math.max(to, from - 1)] ?? clientStage;
}

export function applyGuards(input: GuardInput): GuardResult {
  const { parsed, currentLevel, clientStage, clientSummary, cfg } = input;
  // Ba lớp hiệu chỉnh: bỏ trùng với bộ luật, hạ mức khi luật còn thấp, bỏ thông báo OTP an toàn.
  const normalized = normalizeSignals(parsed.signals, cfg.aiMaxSignals);
  const deduped = dropRuleDuplicates(normalized, input.ruleHintTypes ?? []);
  const calibrated = calibrateSignals(deduped.signals, currentLevel);
  const benign = dropBenignWarnings(calibrated.signals, currentLevel);
  // AI một mình không được đẩy lên Nghiêm trọng; giữ cùng bất biến với analyze() trong core.
  const lowConfidenceCritical = benign.signals.some((s) => s.severity === 'critical' && (s.confidence ?? 1) < 0.5);
  const signals = benign.signals.map((s) =>
    s.severity === 'critical' ? { ...s, severity: 'high' as const, direct_danger: false } : s,
  );
  const rejected = parsed.rejected + Math.max(0, parsed.signals.length - signals.length);

  const fallbackSummary = maskPii(clientSummary).slice(0, cfg.summaryMaxChars);
  let summary = maskPii(parsed.summary).trim();
  let promptLeakSuspected = false;
  if (!summary) {
    summary = fallbackSummary;
  } else if (containsPromptLeak(summary)) {
    promptLeakSuspected = true;
    summary = fallbackSummary;
  }
  summary = truncateChars(summary, cfg.summaryMaxChars);

  const uncertainties: string[] = [];
  for (const u of parsed.uncertainties) {
    const clean = truncateChars(maskPii(String(u)).trim(), 240);
    if (clean && !uncertainties.includes(clean)) uncertainties.push(clean);
  }
  if (lowConfidenceCritical) {
    uncertainties.push('Có tín hiệu nghiêm trọng nhưng độ tin cậy thấp; cần xác minh độc lập trước khi kết luận.');
  }
  if (deduped.dropped > 0) {
    uncertainties.push('Một số tín hiệu AI trùng với bộ luật đã được bỏ để tránh tính điểm hai lần.');
  }
  if (calibrated.calibrated > 0) {
    uncertainties.push('Tín hiệu AI đã được hạ mức theo mức hiện tại của bộ luật vì chưa có dấu hiệu nguy hiểm trực tiếp.');
  }
  if (benign.dropped > 0) {
    uncertainties.push('Tin nhắn mã OTP kèm lời dặn không chia sẻ được coi là thông báo an toàn, không phải yêu cầu cung cấp mã.');
  }
  if (promptLeakSuspected) uncertainties.push('Phản hồi AI có dấu hiệu lặp lại hướng dẫn hệ thống nên đã được thay bằng tóm tắt an toàn.');
  const dedupedUncertainties = [...new Set(uncertainties)].slice(0, 5);

  let downgradeReason = parsed.downgradeReason ? maskPii(parsed.downgradeReason).slice(0, 200) : undefined;
  if (downgradeReason && hasDanger(signals, currentLevel)) downgradeReason = undefined;

  const detectedStage = clampStage(parsed.detectedStage, clientStage, signals);

  const safeSignals = signals.map((s) => ({
    ...s,
    title: truncateChars(maskPii(s.title), 120),
    explanation: truncateChars(maskPii(s.explanation), 500),
    recommended_action: truncateChars(maskPii(s.recommended_action), 300),
    // Quote phải giữ nguyên văn để client đối chiếu; core đã thay bằng text gốc.
    evidence_quotes: s.evidence_quotes.map((q) => q.slice(0, 220)),
  }));

  return {
    signals: safeSignals,
    summary,
    uncertainties: dedupedUncertainties,
    rejected,
    ...(downgradeReason ? { downgradeReason } : {}),
    ...(detectedStage ? { detectedStage } : {}),
    promptLeakSuspected,
  };
}
