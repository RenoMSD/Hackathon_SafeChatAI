import { beforeAll, describe, expect, it } from 'vitest';
import type { Session } from '../src/shared/protocol';
import { SESSION_KEY } from '../src/shared/protocol';
import { createSnapshot, serializeSnapshot } from '@safechat/core/context-manager';
import { appendObserved, emptyTranscript } from '@safechat/core/transcript';
import { installFakeChrome } from './fakeChrome';

const fake = installFakeChrome();
const TAB = 7;
let thread = { threadId: 'mock:05', threadLabel: 'Chat thử' };
const contentCalls: string[] = [];
const riskMsgs: Record<string, unknown>[] = [];
let probeOverride: unknown = null;

fake.onTab(TAB, (msg) => {
  const m = msg as { kind: string };
  contentCalls.push(m.kind);
  if (m.kind === 'cs_risk_update') riskMsgs.push(msg as Record<string, unknown>);
  if (m.kind === 'cs_probe') return probeOverride ?? { supported: true, platform: 'mock', ...thread };
  return { ok: true };
});

const session = async () =>
  ((await fake.chrome.storage.session.get(SESSION_KEY)) as Record<string, Session>)[SESSION_KEY] ?? null;
const tick = () => new Promise((r) => setTimeout(r, 10));

beforeAll(async () => {
  await import('../src/background/index');
});

describe('background — vòng đời phiên', () => {
  it('chưa bắt đầu thì không lưu gì', async () => {
    await fake.content(TAB, { kind: 'cs_messages', threadId: 'mock:05', batch: [{ sender: 'other', text: 'x' }] });
    await tick();
    expect(await session()).toBeNull();
  });

  it('bắt đầu → nhận tin → phân tích và khử trùng lặp', async () => {
    expect(await fake.panel({ kind: 'start', tabId: TAB })).toMatchObject({ ok: true });
    expect(contentCalls).toContain('cs_start');
    const batch = [
      { sender: 'other', text: 'Bên chị hoàn toàn miễn phí, không thu phí gì của ứng viên đâu em.' },
      { sender: 'other', text: 'Giờ em chỉ cần đóng phí kích hoạt 500k là được nhận việc luôn.' },
    ];
    await fake.content(TAB, { kind: 'cs_messages', threadId: 'mock:05', batch });
    await fake.content(TAB, { kind: 'cs_messages', threadId: 'mock:05', batch }); // DOM render lại
    await tick();
    const s = (await session())!;
    expect(s.status).toBe('tracking');
    expect(s.transcript.messages).toHaveLength(2);
    expect(s.result?.risk_level).toBe('high');
    expect(s.result?.signals.map((x) => x.type)).toContain('possible_contradiction');
    expect(fake.badge.text).toBe('!!');
  });

  it('bỏ qua tin từ tab khác hoặc thread khác', async () => {
    await fake.content(99, { kind: 'cs_messages', threadId: 'mock:05', batch: [{ sender: 'other', text: 'tab khác' }] });
    await fake.content(TAB, { kind: 'cs_messages', threadId: 'mock:xx', batch: [{ sender: 'other', text: 'thread khác' }] });
    await tick();
    expect((await session())!.transcript.messages).toHaveLength(2);
  });

  it('chuyển chat → tạm dừng, không trộn dữ liệu; xác nhận → phiên mới sạch', async () => {
    await fake.content(TAB, { kind: 'cs_thread_changed', threadId: 'mock:09', threadLabel: 'Chat khác' });
    await tick();
    let s = (await session())!;
    expect(s.status).toBe('paused');
    expect(s.pauseReason).toBe('thread_changed');
    expect(s.pendingThread?.threadId).toBe('mock:09');
    // Khi tạm dừng, tin mới không được ghi
    await fake.content(TAB, { kind: 'cs_messages', threadId: 'mock:05', batch: [{ sender: 'other', text: 'tin lúc tạm dừng' }] });
    await tick();
    expect((await session())!.transcript.messages).toHaveLength(2);

    thread = { threadId: 'mock:09', threadLabel: 'Chat khác' };
    expect(await fake.panel({ kind: 'switch_to_pending' })).toMatchObject({ ok: true });
    s = (await session())!;
    expect(s.threadId).toBe('mock:09');
    expect(s.transcript.messages).toHaveLength(0);
    expect(s.status).toBe('tracking');
  });

  it('đóng tab → tạm dừng', async () => {
    fake.closeTab(TAB);
    await tick();
    const s = (await session())!;
    expect(s.status).toBe('paused');
    expect(s.pauseReason).toBe('tab_closed');
  });

  // ---------- gateway ----------
  const GW = 'https://gw.test';
  let tokenSeq = 0;
  type Stats = { devices: number; analyses: number; bodies: Record<string, any>[]; auth: string[] };

  /** Giả lập gateway: /v1/devices cấp token mới; /v1/analyses do từng test quyết định theo lượt gọi thứ n. */
  function mockGateway(analyses: (n: number) => Response): Stats {
    const stats: Stats = { devices: 0, analyses: 0, bodies: [], auth: [] };
    globalThis.fetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
      if (url === `${GW}/v1/devices`) {
        stats.devices++;
        return new Response(
          JSON.stringify({ token: `tok-${++tokenSeq}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
          { status: 200 },
        );
      }
      if (url === `${GW}/v1/analyses`) {
        stats.analyses++;
        stats.bodies.push(JSON.parse(init.body));
        stats.auth.push(init.headers.Authorization ?? '');
        return analyses(stats.analyses);
      }
      throw new Error(`URL ngoài dự kiến: ${url}`);
    }) as unknown as typeof fetch;
    return stats;
  }

  const okResponse = (signals: unknown[], summary = 'Tuyển dụng, có yêu cầu phí.') =>
    new Response(
      JSON.stringify({ signals, summary, uncertainties: [], rejected: 0, usage: { tier: 'large', model: 'test-model' } }),
      { status: 200 },
    );
  const errResponse = (status: number, code: string) =>
    new Response(JSON.stringify({ error: { code, message: 'x' } }), { status });

  const goodSignal = {
    type: 'vague_task',
    category: 'job_terms',
    severity: 'medium',
    title: 'Mô tả công việc mơ hồ',
    explanation: 'Không nói rõ việc phải làm.',
    evidence_message_ids: ['msg-002'],
    evidence_quotes: ['đóng phí kích hoạt'],
  };

  async function startAiSession(id: string) {
    thread = { threadId: id, threadLabel: 'AI' };
    await fake.panel({ kind: 'stop_and_clear' });
    await fake.panel({ kind: 'start', tabId: TAB });
    await fake.content(TAB, {
      kind: 'cs_messages',
      threadId: id,
      batch: [
        { sender: 'other', text: 'Bên chị hoàn toàn miễn phí, không thu phí gì đâu em.' },
        { sender: 'other', text: 'Giờ em đóng phí kích hoạt 500k, gọi 0912 345 678 nhé.' },
      ],
    });
    await new Promise((r) => setTimeout(r, 800));
  }

  it('Gateway: chỉ gửi delta đã che PII kèm token thiết bị; kết quả hợp lệ được gộp', async () => {
    const gw = mockGateway(() => okResponse([goodSignal]));
    (fake.chrome.permissions as { contains: () => Promise<boolean> }).contains = async () => true;
    await fake.chrome.storage.local.set({
      safechat_settings: { gatewayEnabled: true, gatewayUrl: GW, minIntervalSec: 3, batchSize: 5, dailyBudget: 50 },
    });
    riskMsgs.length = 0;
    await startAiSession('mock:ai');
    const s = (await session())!;
    expect(gw.analyses).toBe(1);
    expect(gw.devices).toBe(1);
    expect(gw.auth[0]).toMatch(/^Bearer tok-\d+$/);
    const body = gw.bodies[0]!;
    expect(body.client).toBe('extension');
    expect(body.tier).toBe('large'); // mức Cao → tầng lớn
    const sent = JSON.stringify(body);
    expect(sent).toContain('[SỐ]');
    expect(sent).not.toContain('0912 345 678');
    expect(sent.toLowerCase()).not.toContain('groq');
    expect(s.ai.status).toBe('ok');
    expect(s.ai.lastProvider).toBe('gateway');
    expect(s.ai.lastModel).toBe('test-model');
    expect(s.ai.summary).toBe('Tuyển dụng, có yêu cầu phí.');
    expect(s.result?.signals.some((x) => x.type.includes('vague_task'))).toBe(true);
    expect(s.timeline.length).toBeGreaterThan(0);
    const local = (await fake.chrome.storage.local.get(null)) as Record<string, any>;
    expect(local.safechat_ai_usage?.count).toBe(1);
    expect(local.safechat_device?.baseUrl).toBe(GW);
  });

  it('Widget: background chỉ gửi mức, điểm, trạng thái; không gửi nội dung chat', async () => {
    expect(riskMsgs.length).toBeGreaterThan(0);
    const dump = JSON.stringify(riskMsgs);
    for (const m of riskMsgs) {
      expect(Object.keys(m).sort()).toEqual(['kind', 'risk']);
      expect(Object.keys(m.risk as object).every((k) => ['level', 'score', 'tracking', 'waiting'].includes(k))).toBe(true);
    }
    expect(dump).not.toContain('phí');
    expect(dump).not.toContain('0912');
    expect(dump).not.toContain('Tuyển dụng');
  });

  it('cs_ready: phiên đang theo dõi trên đúng tab → gửi lại mức/điểm; tab khác → không gửi', async () => {
    riskMsgs.length = 0;
    await fake.content(99, { kind: 'cs_ready' });
    await tick();
    expect(riskMsgs).toHaveLength(0);
    await fake.content(TAB, { kind: 'cs_ready' });
    await tick();
    expect(riskMsgs).toHaveLength(1);
    expect((riskMsgs[0]!.risk as { level: string }).level).toBe('high');
  });

  it('Gateway: 401 → cấp lại token thiết bị đúng một lần rồi gọi lại', async () => {
    const gw = mockGateway((n) => (n === 1 ? errResponse(401, 'UNAUTHORIZED') : okResponse([goodSignal])));
    await startAiSession('mock:ai401');
    const s = (await session())!;
    expect(gw.analyses).toBe(2);
    expect(gw.devices).toBe(1);
    expect(gw.auth[1]).not.toBe(gw.auth[0]);
    expect(s.ai.status).toBe('ok');
  });

  it('Gateway: trích dẫn không khớp tin gốc bị loại ở client', async () => {
    mockGateway(() =>
      okResponse([{ ...goodSignal, evidence_message_ids: ['msg-001'], evidence_quotes: ['câu này không hề có trong tin nhắn'] }]),
    );
    await startAiSession('mock:aibad');
    const s = (await session())!;
    expect(s.ai.signals).toHaveLength(0);
    expect(s.ai.error).toContain('Đã loại');
  });

  it('Gateway lỗi → báo lỗi tiếng Việt, mức của bộ quy tắc không bị hạ', async () => {
    mockGateway(() => errResponse(500, 'INTERNAL'));
    await startAiSession('mock:aierr');
    const s = (await session())!;
    expect(s.ai.status).toBe('error');
    expect(s.ai.error).toContain('Bộ quy tắc vẫn tiếp tục chạy');
    expect(s.result?.risk_level).toBe('high');
  });

  it('Cài đặt cũ: khóa Groq bị xóa khỏi storage; tắt gateway thì xóa token thiết bị', async () => {
    await fake.chrome.storage.local.set({
      safechat_settings: { groqEnabled: true, groqApiKey: 'old-key', gatewayEnabled: false, gatewayUrl: '' },
    });
    expect(await fake.panel({ kind: 'reanalyze' })).toMatchObject({ ok: true });
    const local = (await fake.chrome.storage.local.get(null)) as Record<string, any>;
    expect(JSON.stringify(local.safechat_settings)).not.toContain('groq');
    expect(local.safechat_device).toBeUndefined();
  });

  it('dừng và xóa → storage.session trống, xác nhận đã xóa', async () => {
    const r = await fake.panel({ kind: 'stop_and_clear' });
    expect(r).toEqual({ ok: true, remainingKeys: [] });
    expect(Object.keys(fake.chrome.storage.session._dump())).toHaveLength(0);
    expect(contentCalls.at(-1)).toBe('cs_stop');
    expect(fake.badge.text).toBe('');
  });
});

describe('background — Context Manager: tiếp tục từ bản nháp', () => {
  const t = emptyTranscript();
  appendObserved(t, [
    { sender: 'other', text: 'Bên chị hoàn toàn miễn phí, không thu phí gì đâu em.' },
    { sender: 'self', text: 'Dạ vâng' },
    { sender: 'other', text: 'Giờ em đóng phí kích hoạt 500k nhé.' },
  ]);
  const snapshot = serializeSnapshot(
    createSnapshot({
      threadLabel: 'Chat thử',
      platform: 'mock',
      startedAt: 1_700_000_000_000,
      maxMessages: 300,
      transcript: t,
      ai: { summary: 'Có đòi phí sau khi nói miễn phí', signals: [], uncertainties: [], lastSeq: 3, calls: 2 },
      marks: { 'upfront_fee:msg-003': 'review' },
      timeline: [],
      stability: { displayed: 'high', maxLevel: 'high', lastEvalKey: '3:2', recentRaw: ['high'] },
    }),
  );

  it('file hỏng → báo lỗi tiếng Việt, không tạo phiên', async () => {
    const r = (await fake.panel({ kind: 'resume_snapshot', tabId: TAB, snapshot: '{"x":1}' })) as { ok: boolean; reason: string };
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('không phải file phiên');
    expect(await session()).toBeNull();
  });

  it('khôi phục bản nháp, tóm tắt AI, đánh dấu, trạng thái cảnh báo; tính lại kết quả; bắt đầu đọc tab', async () => {
    thread = { threadId: 'mock:resume', threadLabel: 'Chat thử' };
    contentCalls.length = 0;
    expect(await fake.panel({ kind: 'resume_snapshot', tabId: TAB, snapshot })).toMatchObject({ ok: true });
    const s = (await session())!;
    expect(s.status).toBe('tracking');
    expect(s.threadId).toBe('mock:resume');
    expect(s.transcript.messages).toHaveLength(3);
    expect(s.ai.summary).toBe('Có đòi phí sau khi nói miễn phí');
    expect(s.marks).toEqual({ 'upfront_fee:msg-003': 'review' });
    expect(s.resumedFrom?.startedAt).toBe(1_700_000_000_000);
    expect(s.result?.risk_level).toBe('high');
    expect(s.result?.signals.map((x) => x.type)).toContain('possible_contradiction');
    expect(contentCalls).toContain('cs_start');
  });

  it('tin đang hiển thị được nối tiếp không trùng lặp', async () => {
    await fake.content(TAB, {
      kind: 'cs_messages',
      threadId: 'mock:resume',
      batch: [
        { sender: 'self', text: 'Dạ vâng' },
        { sender: 'other', text: 'Giờ em đóng phí kích hoạt 500k nhé.' },
        { sender: 'other', text: 'Chuyển khoản vào STK 0123456789 giúp chị.' },
      ],
    });
    await tick();
    const s = (await session())!;
    expect(s.transcript.messages.map((m) => m.id)).toEqual(['msg-001', 'msg-002', 'msg-003', 'msg-004']);
    await fake.panel({ kind: 'stop_and_clear' });
  });
});


describe('background — nhiều khung chat popup, chờ mở lại, lỗi bộ đọc', () => {
  const A = { threadId: 'messenger:1001', threadLabel: 'Người A' };
  const B = { threadId: 'messenger:1002', threadLabel: 'Người B' };

  it('nhiều khung đang mở: phải chọn; chọn cuộc không có trong danh sách bị từ chối', async () => {
    await fake.panel({ kind: 'stop_and_clear' });
    probeOverride = { supported: true, platform: 'messenger', threads: [A, B] };
    expect(await fake.panel({ kind: 'start', tabId: TAB })).toMatchObject({ ok: false });
    expect(await fake.panel({ kind: 'start', tabId: TAB, threadId: 'messenger:9999' })).toMatchObject({ ok: false });
    expect(await fake.panel({ kind: 'start', tabId: TAB, threadId: B.threadId })).toMatchObject({ ok: true });
    const s = (await session())!;
    expect(s.threadId).toBe(B.threadId);
    expect(s.threadLabel).toBe('Người B');
  });

  it('đóng khung chat → giữ phiên ở trạng thái chờ; mở lại → đọc tiếp', async () => {
    await fake.content(TAB, { kind: 'cs_messages', threadId: B.threadId, batch: [{ sender: 'other', text: 'chào', domId: '1002@msgr.1' }] });
    await fake.content(TAB, { kind: 'cs_thread_waiting', threadId: B.threadId, waiting: true });
    await tick();
    let s = (await session())!;
    expect(s.status).toBe('tracking');
    expect(s.waiting).toBe(true);
    expect(s.transcript.messages).toHaveLength(1);
    await fake.content(TAB, { kind: 'cs_thread_waiting', threadId: B.threadId, waiting: false });
    await fake.content(TAB, { kind: 'cs_messages', threadId: B.threadId, batch: [{ sender: 'other', text: 'chào', domId: '1002@msgr.1' }, { sender: 'other', text: 'tiếp', domId: '1002@msgr.2' }] });
    await tick();
    s = (await session())!;
    expect(s.waiting).toBeUndefined();
    expect(s.transcript.messages.map((m) => m.text)).toEqual(['chào', 'tiếp']);
  });

  it('bộ đọc báo mã tin không khớp → ghi lỗi, không thêm tin; đọc lại bình thường thì xóa lỗi', async () => {
    await fake.content(TAB, { kind: 'cs_messages', threadId: B.threadId, batch: [], error: 'Mã tin nhắn không khớp' });
    await tick();
    let s = (await session())!;
    expect(s.readerError).toContain('không khớp');
    expect(s.transcript.messages).toHaveLength(2);
    await fake.content(TAB, { kind: 'cs_messages', threadId: B.threadId, batch: [{ sender: 'other', text: 'mới', domId: '1002@msgr.3' }] });
    await tick();
    s = (await session())!;
    expect(s.readerError).toBeUndefined();
    expect(s.transcript.messages).toHaveLength(3);
    probeOverride = null;
  });
});