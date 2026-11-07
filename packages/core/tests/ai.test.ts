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
  currentLevel: 'low',
  budgetLeft: 10,
  minIntervalMs: 10_000,
  batchSize: 5,
  lastMessageAt: 95_000,
  idleFlushMs: 60_000,
  ...over,
});

describe('decideAiRun — chính sách phân tầng', () => {
  it('không có tin mới của đối phương thì không gọi', () => {
    expect(decideAiRun(base({ lastAiSeq: 2 }))).toMatchObject({ run: false, reason: 'no_new' });
  });
  const five = () => msgs(Array.from({ length: 5 }, () => ['other', 'x'] as [ChatMessage['sender'], string]));
  it('chưa đủ 5 tin mới → chờ, kể cả khi luật đã báo Nghiêm trọng', () => {
    expect(decideAiRun(base())).toMatchObject({ run: false, reason: 'waiting_batch' });
    expect(decideAiRun(base({ currentLevel: 'critical' }))).toMatchObject({ run: false, reason: 'waiting_batch' });
  });
  it('đủ N tin mới → gọi mô hình nhỏ', () => {
    expect(decideAiRun(base({ messages: five() }))).toMatchObject({ run: true, tier: 'small', reason: 'Đủ 5 tin mới' });
  });
  it('đủ N tin mới và luật đã báo Cao → dùng mô hình lớn', () => {
    expect(decideAiRun(base({ messages: five(), currentLevel: 'high' }))).toMatchObject({ run: true, tier: 'large' });
  });
  it('chỉ đếm tin của đối phương, không đếm tin của người dùng', () => {
    const m = msgs([['other', 'a'], ['self', 'b'], ['other', 'c'], ['self', 'd'], ['other', 'e'], ['self', 'f']]);
    expect(decideAiRun(base({ messages: m }))).toMatchObject({ run: false, reason: 'waiting_batch' });
  });
  it('đếm lại từ đầu sau mỗi lần gọi', () => {
    expect(decideAiRun(base({ messages: five(), lastAiSeq: 1 }))).toMatchObject({ run: false, reason: 'waiting_batch' });
  });
  it('tôn trọng khoảng cách tối thiểu và hạn mức', () => {
    expect(decideAiRun(base({ messages: five(), lastAiAt: 95_000 }))).toMatchObject({ run: false, reason: 'throttle', retryInMs: 5000 });
    expect(decideAiRun(base({ messages: five(), budgetLeft: 0 }))).toMatchObject({ run: false, reason: 'budget' });
  });
  it('chưa đủ lô thì không báo hết lượt', () => {
    expect(decideAiRun(base({ budgetLeft: 0 }))).toMatchObject({ run: false, reason: 'waiting_batch' });
  });
  it('chưa đủ lô: báo thời gian còn phải chờ', () => {
    expect(decideAiRun(base())).toEqual({ run: false, reason: 'waiting_batch', retryInMs: 55_000 });
  });
  it('hội thoại dừng đủ 60 giây → gọi nốt tin lẻ', () => {
    expect(decideAiRun(base({ lastMessageAt: 40_000 }))).toMatchObject({ run: true, tier: 'small', reason: 'Hội thoại dừng 60 giây' });
    expect(decideAiRun(base({ lastMessageAt: 40_000, currentLevel: 'high' }))).toMatchObject({ run: true, tier: 'large' });
  });
  it('gọi nốt vẫn tôn trọng hạn mức và khoảng cách tối thiểu', () => {
    expect(decideAiRun(base({ lastMessageAt: 40_000, budgetLeft: 0 }))).toMatchObject({ run: false, reason: 'budget' });
    expect(decideAiRun(base({ lastMessageAt: 40_000, lastAiAt: 95_000 }))).toMatchObject({ run: false, reason: 'throttle' });
  });
  it('không có tin mới của đối phương thì dừng bao lâu cũng không gọi', () => {
    expect(decideAiRun(base({ lastAiSeq: 2, lastMessageAt: 0 }))).toMatchObject({ run: false, reason: 'no_new' });
  });
  it('idleFlushMs = 0 thì chỉ gọi khi đủ lô', () => {
    expect(decideAiRun(base({ lastMessageAt: 0, idleFlushMs: 0 }))).toEqual({ run: false, reason: 'waiting_batch' });
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
