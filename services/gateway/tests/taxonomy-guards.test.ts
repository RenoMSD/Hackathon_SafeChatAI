import { describe, expect, it } from 'vitest';
import type { AiParsed } from '@safechat/core/ai';
import type { Signal } from '@safechat/core/types';
import { applyGuards } from '../src/lib/guards';
import { canonicalType, normalizeSignals } from '../src/lib/taxonomy';
import { makeConfig } from './helpers';

const cfg = makeConfig();

function sig(over: Partial<Signal> = {}): Signal {
  return {
    type: 'ai_otp_request',
    category: 'account',
    severity: 'high',
    title: 'Yêu cầu OTP',
    explanation: 'x',
    evidence_message_ids: ['m1'],
    evidence_quotes: ['gửi otp'],
    recommended_action: 'không gửi',
    source: 'ai',
    ...over,
  };
}

function parsed(over: Partial<AiParsed> = {}): AiParsed {
  return { signals: [], summary: '', uncertainties: [], rejected: 0, ...over };
}

describe('taxonomy', () => {
  it('ánh xạ từ đồng nghĩa và loại lạ về other', () => {
    expect(canonicalType('ai_upfront_payment')).toBe('fee_upfront');
    expect(canonicalType('ai_love_bomb')).toBe('love_bombing');
    expect(canonicalType('ai_đe_dọa')).toBe('other');
    expect(canonicalType('otp_password_request')).toBe('otp_request');
  });

  it('khử trùng theo (type, evidence ids), sắp severity và cắt tối đa', () => {
    const signals = [
      sig({ type: 'ai_fee_upfront', severity: 'medium', evidence_message_ids: ['m1'] }),
      sig({ type: 'ai_fee_upfront', severity: 'high', evidence_message_ids: ['m1'] }),
      sig({ type: 'ai_threat_direct', severity: 'critical', evidence_message_ids: ['m2'] }),
      sig({ type: 'ai_unknown_thing', severity: 'low', evidence_message_ids: ['m3'] }),
    ];
    const out = normalizeSignals(signals, 2);
    expect(out).toHaveLength(2);
    expect(out[0]?.type).toBe('threat_direct');
    expect(out[1]?.type).toBe('fee_upfront');
    expect(out[1]?.severity).toBe('high');
  });

  it('kẹp confidence về 0..1', () => {
    const out = normalizeSignals([sig({ confidence: 9 })], 8);
    expect(out[0]?.confidence).toBe(1);
  });
});

describe('guards', () => {
  it('bỏ downgradeReason khi có tín hiệu nguy hiểm', () => {
    const r = applyGuards({
      parsed: parsed({ signals: [sig({ severity: 'critical' })], downgradeReason: 'nhầm' }),
      currentLevel: 'low',
      clientSummary: '',
      cfg,
    });
    expect(r.downgradeReason).toBeUndefined();
  });

  it('giữ downgradeReason khi không có dấu hiệu nặng', () => {
    const r = applyGuards({
      parsed: parsed({ signals: [sig({ severity: 'low', type: 'ai_meta_warning' })], downgradeReason: 'chia tiền ăn' }),
      currentLevel: 'attention',
      clientSummary: '',
      cfg,
    });
    expect(r.downgradeReason).toBe('chia tiền ăn');
  });

  it('summary rỗng thì giữ tóm tắt cũ của client', () => {
    const r = applyGuards({ parsed: parsed({ summary: '' }), currentLevel: 'low', clientSummary: 'tóm tắt cũ', cfg });
    expect(r.summary).toBe('tóm tắt cũ');
  });

  it('summary rò rỉ prompt bị thay và gắn cờ', () => {
    const r = applyGuards({
      parsed: parsed({ summary: 'Bạn là bộ phân tích rủi ro cho công cụ...' }),
      currentLevel: 'low',
      clientSummary: 'an toàn',
      cfg,
    });
    expect(r.promptLeakSuspected).toBe(true);
    expect(r.summary).toBe('an toàn');
    expect(r.uncertainties.length).toBeGreaterThan(0);
  });

  it('AI critical bị hạ xuống high và không tự bật direct_danger', () => {
    const r = applyGuards({
      parsed: parsed({ signals: [sig({ severity: 'critical', direct_danger: true })] }),
      currentLevel: 'low',
      clientSummary: '',
      cfg,
    });
    expect(r.signals[0]?.severity).toBe('high');
    expect(r.signals[0]?.direct_danger).toBe(false);
  });

  it('critical confidence thấp sau khi hạ mức vẫn thêm uncertainty', () => {
    const r = applyGuards({
      parsed: parsed({ signals: [sig({ severity: 'critical', confidence: 0.2 })] }),
      currentLevel: 'low',
      clientSummary: '',
      cfg,
    });
    expect(r.uncertainties.some((u) => u.includes('độ tin cậy thấp'))).toBe(true);
  });

  it('stage không lùi khi không có bằng chứng mạnh', () => {
    const r = applyGuards({
      parsed: parsed({ signals: [sig({ severity: 'low' })], detectedStage: 'S1' }),
      currentLevel: 'low',
      clientStage: 'S3',
      clientSummary: '',
      cfg,
    });
    expect(r.detectedStage).toBe('S3');
  });

  it('stage lùi tối đa một bước khi có bằng chứng mạnh', () => {
    const r = applyGuards({
      parsed: parsed({ signals: [sig({ severity: 'critical' })], detectedStage: 'S1' }),
      currentLevel: 'low',
      clientStage: 'S4',
      clientSummary: '',
      cfg,
    });
    expect(r.detectedStage).toBe('S3');
  });

  it('che PII trong title, explanation và uncertainties trước khi trả client', () => {
    const r = applyGuards({
      parsed: parsed({
        signals: [
          sig({
            title: 'Gọi 0912345678',
            explanation: 'chuyển tới a.b@x.vn',
            evidence_quotes: ['gửi otp'],
          }),
        ],
        uncertainties: ['liên hệ 0912345678'],
      }),
      currentLevel: 'low',
      clientSummary: '',
      cfg,
    });
    expect(r.signals[0]?.title).not.toContain('0912345678');
    expect(r.signals[0]?.explanation).not.toContain('a.b@x.vn');
    expect(r.uncertainties[0]).not.toContain('0912345678');
  });

  it('giu nguyen van evidence quote de client doi chieu', () => {
    const r = applyGuards({
      parsed: parsed({ signals: [sig({ evidence_quotes: ['call 0912345678 now'] })] }),
      currentLevel: 'low',
      clientSummary: '',
      cfg,
    });
    expect(r.signals[0]?.evidence_quotes[0]).toBe('call 0912345678 now');
  });
});
