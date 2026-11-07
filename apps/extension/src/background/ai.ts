// Điều phối AI phân tầng:
//   quy tắc (luôn chạy, miễn phí)
//   → Gemini Nano trên máy (nếu bật và side panel báo sẵn sàng; không tốn hạn mức, dữ liệu không rời máy)
//   → Groq: mô hình nhỏ (8B) mặc định, chỉ leo lên mô hình lớn (70B) khi đã có dấu hiệu đáng kể.
// Chỉ gửi DELTA (tin mới + vài tin ngữ cảnh + tóm tắt cuộn), giới hạn số lượt/ngày.
import {
  buildAiRequest,
  decideAiRun,
  mergeAiSignals,
  parseAiResponse,
  shouldEscalate,
  type AiParsed,
  type AiRequest,
  type AiTier,
} from '@safechat/core/ai';
import type { RiskLevel } from '@safechat/core/types';
import { USAGE_KEY, type AiProvider, type Session, type Settings } from '../shared/protocol';
import { callGroq, GroqError } from './groq';
import { recompute, serial, updateBadge } from './runtime';
import { loadSession, loadSettings, saveSession } from './store';

const NANO_TIMEOUT_MS = 60_000;
const PANEL_FRESH_MS = 45_000;

let panelNano = { ready: false, at: 0 };
let nanoFailedUntil = 0;
let groqBackoffUntil = 0;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function setPanelNanoStatus(ready: boolean) {
  panelNano = { ready, at: Date.now() };
  if (ready) kickAi(500);
}

export function kickAi(delayMs = 0) {
  clearTimeout(timer);
  timer = setTimeout(() => void step(), delayMs);
}

export function cancelAi() {
  clearTimeout(timer);
  timer = undefined;
}

// ---------- hạn mức theo ngày ----------
const today = () => new Date().toISOString().slice(0, 10);

async function usedToday(): Promise<number> {
  const r = (await chrome.storage.local.get(USAGE_KEY))[USAGE_KEY] as { date: string; count: number } | undefined;
  return r && r.date === today() ? r.count : 0;
}

async function addUsage(n: number) {
  await chrome.storage.local.set({ [USAGE_KEY]: { date: today(), count: (await usedToday()) + n } });
}

async function chooseProvider(settings: Settings): Promise<AiProvider | null> {
  const now = Date.now();
  if (settings.nanoEnabled && panelNano.ready && now - panelNano.at < PANEL_FRESH_MS && now > nanoFailedUntil) return 'nano';
  if (settings.groqEnabled && settings.groqApiKey && now > groqBackoffUntil) {
    const granted = await chrome.permissions.contains({ origins: ['https://api.groq.com/*'] });
    if (granted) return 'groq';
  }
  return null;
}

function anyAiConfigured(settings: Settings) {
  return settings.nanoEnabled || (settings.groqEnabled && !!settings.groqApiKey);
}

// ---------- một bước điều phối ----------
async function step() {
  if (running) return;
  const settings = await loadSettings();
  const s = await loadSession();
  if (!s || s.status !== 'tracking' || !s.result) return;

  if (!anyAiConfigured(settings)) {
    if (s.ai.status !== 'off') await serial(async () => setStatus('off'));
    return;
  }

  if (s.ai.pending) {
    if (Date.now() - s.ai.pending.createdAt < NANO_TIMEOUT_MS) return; // side panel đang xử lý
    nanoFailedUntil = Date.now() + 5 * 60_000;
    await serial(async () => {
      const cur = await loadSession();
      if (cur) {
        cur.ai.pending = undefined;
        await saveSession(cur);
      }
    });
  }

  const provider = await chooseProvider(settings);
  if (!provider) {
    if (s.ai.status === 'off') await serial(async () => setStatus('idle'));
    return;
  }

  const budget = provider === 'groq' ? settings.dailyBudget - (await usedToday()) : Number.POSITIVE_INFINITY;
  const ruleSignals = s.result.signals.filter((x) => x.source !== 'ai');
  const ruleTypes = ruleSignals.map((x) => x.type);
  const decision = decideAiRun({
    now: Date.now(),
    messages: s.transcript.messages,
    lastAiSeq: s.ai.lastSeq,
    lastAiAt: s.ai.lastAt,
    lastLevel: s.ai.lastLevel,
    currentLevel: s.result.risk_level,
    newRuleSignal: ruleTypes.some((t) => !s.ai.lastRuleTypes.includes(t)),
    budgetLeft: budget,
    minIntervalMs: settings.minIntervalSec * 1000,
    batchSize: settings.batchSize,
  });

  if (!decision.run) {
    if (decision.reason === 'throttle') kickAi(decision.retryInMs ?? 2000);
    if (decision.reason === 'budget')
      await serial(async () => setStatus('error', `Đã dùng hết ${settings.dailyBudget} lượt AI hôm nay; vẫn phân tích bằng quy tắc.`));
    if (s.ai.status === 'off') await serial(async () => setStatus('idle'));
    return;
  }

  const request = buildAiRequest(s.transcript.messages, s.ai.lastSeq, s.ai.summary, ruleSignals);
  const meta = { startedAt: s.startedAt, level: s.result.level_before_ai, ruleTypes, reason: decision.reason };

  if (provider === 'nano') {
    await serial(async () => {
      const cur = await loadSession();
      if (!cur || cur.startedAt !== meta.startedAt) return;
      cur.ai.pending = { id: crypto.randomUUID(), tier: decision.tier, request, createdAt: Date.now() };
      cur.ai.status = 'running';
      cur.ai.lastReason = decision.reason;
      await saveSession(cur);
    });
    return; // side panel nhận yêu cầu qua storage.onChanged và trả lời bằng ai_result
  }

  running = true;
  await serial(async () => setStatus('running'));
  try {
    const parsed = await runGroq(request, decision.tier, settings, budget);
    await applyResult(meta, request, parsed.result, 'groq', parsed.tier);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof GroqError && e.status === 429) groqBackoffUntil = Date.now() + 60_000;
    await serial(async () => {
      const cur = await loadSession();
      if (!cur || cur.startedAt !== meta.startedAt) return;
      cur.ai.status = 'error';
      cur.ai.error = msg;
      cur.ai.lastAt = Date.now();
      recompute(cur); // giữ nguyên kết quả quy tắc, KHÔNG hạ mức
      await saveSession(cur);
    });
  } finally {
    running = false;
  }
  kickAi(1000); // có thể đã có tin mới trong lúc chờ
}

async function runGroq(
  request: AiRequest,
  tier: AiTier,
  settings: Settings,
  budget: number,
): Promise<{ result: AiParsed; tier: AiTier }> {
  const original = (await loadSession())?.transcript.messages ?? [];
  const model = tier === 'large' ? settings.groqLargeModel : settings.groqSmallModel;
  const first = parseAiResponse(await callGroq(request, settings.groqApiKey, model), request, original, `Groq ${model}`);
  await addUsage(1);
  if (tier === 'small' && shouldEscalate(first.signals, budget - 1)) {
    // Mô hình nhỏ thấy dấu hiệu nặng → nhờ mô hình lớn xác nhận/phân tích kỹ
    const large = settings.groqLargeModel;
    const second = parseAiResponse(await callGroq(request, settings.groqApiKey, large), request, original, `Groq ${large}`);
    await addUsage(1);
    return {
      tier: 'large',
      result: {
        signals: mergeAiSignals(first.signals, second.signals),
        summary: second.summary || first.summary,
        uncertainties: second.uncertainties,
        rejected: first.rejected + second.rejected,
        // Hạ mức chỉ khi mô hình lớn (đánh giá sau cùng) cũng đề nghị
        downgradeReason: second.downgradeReason,
        detectedStage: second.detectedStage ?? first.detectedStage,
      },
    };
  }
  return { result: first, tier };
}

async function applyResult(
  meta: { startedAt: number; level: RiskLevel; ruleTypes: string[]; reason: string },
  request: AiRequest,
  parsed: AiParsed,
  provider: AiProvider,
  tier: AiTier,
) {
  await serial(async () => {
    const cur = await loadSession();
    if (!cur || cur.startedAt !== meta.startedAt) return; // phiên đã bị xóa/đổi
    cur.ai.signals = mergeAiSignals(cur.ai.signals, parsed.signals);
    if (parsed.summary) cur.ai.summary = parsed.summary;
    cur.ai.uncertainties = parsed.uncertainties;
    cur.ai.downgrade = parsed.downgradeReason ? { reason: parsed.downgradeReason, fromLevel: meta.level } : undefined;
    cur.ai.detectedStage = parsed.detectedStage;
    cur.ai.lastSeq = request.upToSeq;
    cur.ai.lastAt = Date.now();
    cur.ai.lastLevel = meta.level;
    cur.ai.lastRuleTypes = meta.ruleTypes;
    cur.ai.calls++;
    cur.ai.status = 'ok';
    cur.ai.error = parsed.rejected ? `Đã loại ${parsed.rejected} tín hiệu AI có trích dẫn không khớp tin gốc` : undefined;
    cur.ai.lastProvider = provider;
    cur.ai.lastTier = tier;
    cur.ai.lastReason = meta.reason;
    cur.ai.pending = undefined;
    recompute(cur);
    await saveSession(cur);
    await updateBadge(cur);
  });
}

async function setStatus(status: Session['ai']['status'], error?: string) {
  const cur = await loadSession();
  if (!cur || (cur.ai.status === status && cur.ai.error === error)) return;
  cur.ai.status = status;
  cur.ai.error = error;
  recompute(cur);
  await saveSession(cur);
}

/** Side panel trả kết quả chạy Gemini Nano. */
export async function handleNanoResult(id: string, ok: boolean, payload: string) {
  const s = await loadSession();
  const pending = s?.ai.pending;
  if (!s || !pending || pending.id !== id) return;
  if (!ok) {
    nanoFailedUntil = Date.now() + 5 * 60_000;
    await serial(async () => {
      const cur = await loadSession();
      if (!cur) return;
      cur.ai.pending = undefined;
      cur.ai.status = 'error';
      cur.ai.error = `AI trên máy lỗi: ${payload}. Chuyển sang dự phòng nếu có.`;
      recompute(cur);
      await saveSession(cur);
    });
    kickAi(500);
    return;
  }
  try {
    const parsed = parseAiResponse(payload, pending.request, s.transcript.messages, 'Gemini Nano trên máy');
    await applyResult(
      {
        startedAt: s.startedAt,
        level: s.result?.level_before_ai ?? 'low',
        ruleTypes: s.result?.signals.filter((x) => x.source !== 'ai').map((x) => x.type) ?? [],
        reason: s.ai.lastReason ?? '',
      },
      pending.request,
      parsed,
      'nano',
      pending.tier,
    );
  } catch (e) {
    await handleNanoResult(id, false, (e as Error).message);
    return;
  }
  kickAi(1000);
}
