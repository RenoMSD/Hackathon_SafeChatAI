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
let probeOverride: unknown = null;

fake.onTab(TAB, (msg) => {
  const m = msg as { kind: string };
  contentCalls.push(m.kind);
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

  it('Groq phân tầng: gọi mô hình lớn khi mức Cao, chỉ gửi delta, kết quả hợp lệ được gộp', async () => {
    const calls: { model: string; user: string }[] = [];
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      calls.push({ model: body.model, user: body.messages[1].content });
      const content = JSON.stringify({
        signals: [
          {
            type: 'vague_task',
            category: 'job_terms',
            severity: 'medium',
            title: 'Mô tả công việc mơ hồ',
            explanation: 'Không nói rõ việc phải làm.',
            evidence_message_ids: ['msg-002'],
            evidence_quotes: ['đóng phí kích hoạt'],
          },
        ],
        summary: 'Tuyển dụng, có yêu cầu phí.',
      });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    (fake.chrome.permissions as { contains: () => Promise<boolean> }).contains = async () => true;
    await fake.chrome.storage.local.set({
      safechat_settings: { groqEnabled: true, groqApiKey: 'test-key', minIntervalSec: 3, batchSize: 5, dailyBudget: 50 },
    });
    thread = { threadId: 'mock:ai', threadLabel: 'AI' };
    await fake.panel({ kind: 'stop_and_clear' });
    await fake.panel({ kind: 'start', tabId: TAB });
    await fake.content(TAB, {
      kind: 'cs_messages',
      threadId: 'mock:ai',
      batch: [
        { sender: 'other', text: 'Bên chị hoàn toàn miễn phí, không thu phí gì đâu em.' },
        { sender: 'other', text: 'Giờ em đóng phí kích hoạt 500k, gọi 0912 345 678 nhé.' },
      ],
    });
    await new Promise((r) => setTimeout(r, 800));
    expect(calls).toHaveLength(0); // mới 2 tin: luật đã cảnh báo, AI chờ đủ 5 tin
    expect((await session())!.result?.risk_level).toBe('high');
    await fake.content(TAB, {
      kind: 'cs_messages',
      threadId: 'mock:ai',
      batch: [
        { sender: 'other', text: 'Em đóng sớm để giữ chỗ nha.' },
        { sender: 'other', text: 'Việc nhẹ, làm ở nhà thôi.' },
        { sender: 'other', text: 'Chị chờ em phản hồi.' },
      ],
    });
    await new Promise((r) => setTimeout(r, 800));
    const s = (await session())!;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe('llama-3.3-70b-versatile'); // mức Cao → mô hình lớn
    expect(calls[0]!.user).toContain('[SỐ]');
    expect(calls[0]!.user).not.toContain('0912 345 678');
    expect(s.ai.status).toBe('ok');
    expect(s.ai.summary).toBe('Tuyển dụng, có yêu cầu phí.');
    expect(s.result?.signals.map((x) => x.type)).toContain('ai_vague_task');
    expect(s.timeline.length).toBeGreaterThan(0);
    const usage = (await fake.chrome.storage.local.get('safechat_ai_usage')) as Record<string, { count: number }>;
    expect(usage.safechat_ai_usage?.count).toBe(1);
  });

  it('chưa đủ 5 tin: đặt alarm, đến giờ thì gọi nốt tin lẻ; dừng phiên thì bỏ alarm', async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const calls: string[] = [];
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body).messages[1].content);
      const content = JSON.stringify({ signals: [], summary: 'Đã đọc tin lẻ.' });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await fake.chrome.storage.local.set({
      safechat_settings: { groqEnabled: true, groqApiKey: 'test-key', minIntervalSec: 3, batchSize: 5, idleFlushSec: 1, dailyBudget: 50 },
    });
    thread = { threadId: 'mock:idle', threadLabel: 'Tin lẻ' };
    await fake.panel({ kind: 'stop_and_clear' });
    await fake.panel({ kind: 'start', tabId: TAB });
    await fake.content(TAB, { kind: 'cs_messages', threadId: 'mock:idle', batch: [{ sender: 'other', text: 'Em rảnh không?' }] });
    await wait(500);
    expect(calls).toHaveLength(0);
    expect(fake.alarms.has('safechat_ai_idle')).toBe(true);

    await wait(700); // đã qua 1 giây kể từ tin cuối
    fake.fireAlarm('safechat_ai_idle');
    await wait(300);
    expect(calls).toHaveLength(1);
    expect((await session())!.ai.lastReason).toBe('Hội thoại dừng 1 giây');

    await fake.content(TAB, { kind: 'cs_messages', threadId: 'mock:idle', batch: [{ sender: 'other', text: 'Em rảnh không?' }, { sender: 'other', text: 'Trả lời chị nhé' }] });
    await wait(500);
    expect(fake.alarms.has('safechat_ai_idle')).toBe(true);
    await fake.panel({ kind: 'stop_and_clear' });
    expect(fake.alarms.has('safechat_ai_idle')).toBe(false);
  });

  it('Groq lỗi liên tục: dừng sau 3 lần, thử lại khi có tin mới hoặc đổi cài đặt, phản hồi đọc lỗi vẫn tính lượt', async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'không phải json' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await fake.chrome.storage.local.set({
      safechat_settings: { groqEnabled: true, groqApiKey: 'test-key', minIntervalSec: 0.01, batchSize: 5, dailyBudget: 50 },
      safechat_ai_usage: { date: new Date().toISOString().slice(0, 10), count: 0 },
    });
    thread = { threadId: 'mock:fail', threadLabel: 'Lỗi' };
    await fake.panel({ kind: 'stop_and_clear' });
    await fake.panel({ kind: 'start', tabId: TAB });
    const batch = ['một', 'hai', 'ba', 'bốn', 'năm'].map((w) => ({ sender: 'other', text: `Tin số ${w}` }));
    await fake.content(TAB, { kind: 'cs_messages', threadId: 'mock:fail', batch });
    await wait(4000); // đủ thời gian cho nhiều hơn 3 lần nếu không dừng
    expect(calls).toBe(3);
    let s = (await session())!;
    expect(s.ai.status).toBe('error');
    expect(s.ai.error).toContain('Đã tạm dừng AI');
    expect(s.result?.risk_level).toBeDefined(); // luật vẫn có kết quả
    const usage = async () => ((await fake.chrome.storage.local.get('safechat_ai_usage')) as Record<string, { count: number }>).safechat_ai_usage?.count;
    expect(await usage()).toBe(3);

    await fake.content(TAB, { kind: 'cs_messages', threadId: 'mock:fail', batch: [...batch, { sender: 'other', text: 'Tin số sáu' }] });
    await wait(1500);
    expect(calls).toBe(4); // tin mới: thử đúng 1 lần rồi dừng tiếp

    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ signals: [], summary: 'Đã ổn.' }) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await fake.panel({ kind: 'reanalyze' });
    await wait(600);
    expect(calls).toBe(5);
    s = (await session())!;
    expect(s.ai.status).toBe('ok');
    expect(s.ai.failures).toBeUndefined();
    expect(s.ai.gaveUpAtSeq).toBeUndefined();
  }, 15_000);

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
