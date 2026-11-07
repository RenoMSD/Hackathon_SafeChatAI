import { describe, expect, it } from 'vitest';
import { buildAiRequest, decideAiRun, maskPii, parseAiResponse, shouldEscalate, type AiPolicyInput } from '@safechat/core/ai';
import { analyze } from '@safechat/core/analyzer';
import type { ChatMessage, Signal } from '@safechat/core/types';

const msgs = (texts: [ChatMessage['sender'], string][]): ChatMessage[] =>
  texts.map(([sender, text], i) => ({ id: `msg-${String(i + 1).padStart(3, '0')}`, seq: i + 1, sender, text }));

const base = (over: Partial<AiPolicyInput> = {}): AiPolicyInput => ({
  now: 100_000,
  messages: msgs([['other', 'a'], ['other', 'b']]),
  lastAiSeq: 0,
  lastAiAt: 0,
  lastLevel: 'low',
  currentLevel: 'low',
  newRuleSignal: false,
  budgetLeft: 10,
  minIntervalMs: 10_000,
  batchSize: 5,
  ...over,
});

describe('decideAiRun — chính sách phân tầng', () => {
  it('không có tin mới của đối phương thì không gọi', () => {
    expect(decideAiRun(base({ lastAiSeq: 2 }))).toMatchObject({ run: false, reason: 'no_new' });
  });
  it('chưa đủ lô và không có thay đổi → chờ', () => {
    expect(decideAiRun(base())).toMatchObject({ run: false, reason: 'waiting_batch' });
  });
  it('đủ N tin mới → gọi mô hình nhỏ', () => {
    const m = msgs(Array.from({ length: 5 }, () => ['other', 'x'] as [ChatMessage['sender'], string]));
    expect(decideAiRun(base({ messages: m }))).toMatchObject({ run: true, tier: 'small' });
  });
  it('mức tăng lên Cao → gọi ngay, dùng mô hình lớn', () => {
    expect(decideAiRun(base({ currentLevel: 'high' }))).toMatchObject({ run: true, tier: 'large' });
  });
  it('tôn trọng khoảng cách tối thiểu và hạn mức', () => {
    expect(decideAiRun(base({ newRuleSignal: true, lastAiAt: 95_000 }))).toMatchObject({ run: false, reason: 'throttle', retryInMs: 5000 });
    expect(decideAiRun(base({ newRuleSignal: true, budgetLeft: 0 }))).toMatchObject({ run: false, reason: 'budget' });
  });
  it('chỉ leo lên mô hình lớn khi mô hình nhỏ thấy dấu hiệu nặng', () => {
    const sig = { severity: 'high' } as Signal;
    expect(shouldEscalate([sig], 5)).toBe(true);
    expect(shouldEscalate([{ severity: 'medium' } as Signal], 5)).toBe(false);
    expect(shouldEscalate([sig], 0)).toBe(false);
  });
});

describe('buildAiRequest — chỉ gửi delta', () => {
  const m = msgs(Array.from({ length: 20 }, (_, i) => ['other', `tin ${i + 1}`] as [ChatMessage['sender'], string]));
  it('gửi tin mới + 4 tin ngữ cảnh, kèm tóm tắt', () => {
    const r = buildAiRequest(m, 15, 'Tóm tắt cũ', []);
    expect(r.sent.map((x) => x.id)).toEqual(['msg-012', 'msg-013', 'msg-014', 'msg-015', 'msg-016', 'msg-017', 'msg-018', 'msg-019', 'msg-020']);
    expect(r.user).toContain('Tóm tắt cũ');
    expect(r.user).toContain('"role":"new"');
    expect(r.upToSeq).toBe(20);
  });
  it('che số điện thoại, số tài khoản, email', () => {
    expect(maskPii('Gọi 0912 345 678 hoặc chuyển STK 1903456789012, mail a.b@x.vn')).toBe('Gọi [SỐ] hoặc chuyển STK [SỐ], mail [EMAIL]');
  });
});

describe('parseAiResponse', () => {
  const m = msgs([
    ['other', 'Chị thương em nên mới giới thiệu, người khác chị không nói đâu'],
    ['self', 'Dạ'],
    ['other', 'Em cứ tin chị, STK 1903456789012 nhé'],
  ]);
  const req = buildAiRequest(m, 0, '', []);
  it('nhận tín hiệu có trích dẫn đúng, thay trích dẫn bằng tin gốc (không che)', () => {
    const content = JSON.stringify({
      signals: [
        {
          type: 'love bombing!',
          category: 'pressure',
          severity: 'medium',
          title: 'Tạo cảm giác đặc biệt',
          explanation: 'x',
          evidence_message_ids: ['msg-003'],
          evidence_quotes: ['STK [SỐ]'],
        },
      ],
      summary: 'Đối phương gửi STK 1903456789012',
    });
    const r = parseAiResponse(content, req, m, 'test');
    expect(r.signals).toHaveLength(1);
    expect(r.signals[0]!.type).toBe('ai_lovebombing');
    expect(r.signals[0]!.evidence_quotes[0]).toContain('1903456789012');
    expect(r.summary).not.toContain('1903456789012');
  });
  it('loại trích dẫn bịa, tin của người dùng, category lạ; chịu được JSON lẫn chữ', () => {
    const content =
      'Đây là kết quả: ' +
      JSON.stringify({
        signals: [
          { type: 'a', category: 'pressure', severity: 'high', title: '', explanation: '', evidence_message_ids: ['msg-001'], evidence_quotes: ['chuyển 10 triệu'] },
          { type: 'b', category: 'pressure', severity: 'high', title: '', explanation: '', evidence_message_ids: ['msg-002'], evidence_quotes: ['Dạ'] },
          { type: 'c', category: 'weird', severity: 'high', title: '', explanation: '', evidence_message_ids: ['msg-001'], evidence_quotes: [] },
        ],
        summary: '',
      });
    const r = parseAiResponse(content, req, m, 'test');
    expect(r.signals).toHaveLength(0);
    expect(r.rejected).toBe(2);
    expect(r.schemaDropped).toBe(1);
  });
  it('AI một mình không đưa lên mức Nghiêm trọng', () => {
    const aiSig: Signal = {
      type: 'ai_x',
      category: 'isolation',
      severity: 'critical',
      title: 't',
      explanation: '',
      evidence_message_ids: ['msg-001'],
      evidence_quotes: ['người khác chị không nói đâu'],
      recommended_action: '',
      source: 'ai',
    };
    const r = analyze(m, { aiSignals: [aiSig] });
    expect(r.risk_level).toBe('high');
    expect(r.safety_priority).toBe(false);
  });
});

describe('phân tích chi tiết', () => {
  it('có bảng đóng góp điểm, lý do và thống kê theo nhóm', () => {
    const r = analyze(msgs([['other', 'Em đóng phí hồ sơ 350k rồi chuyển khoản vào STK chị nhé']]));
    expect(r.score_breakdown.map((b) => b.contribution)).toEqual([60, 6.3]);
    expect(r.score).toBe(66);
    expect(r.level_reason).toContain('25%');
    expect(r.category_counts.finance).toBe(2);
  });
});
