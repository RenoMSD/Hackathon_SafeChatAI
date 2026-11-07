// Content script: thụ động cho tới khi background gửi cs_start (sau khi người dùng đồng ý).
// Chỉ đọc văn bản tin nhắn của cuộc trò chuyện đã chọn; không gửi tin, không thao tác giao diện.
import type { ContentEvent, ContentRequest, ProbeResult } from '../shared/protocol';
import type { ChatAdapter } from './adapter';
import { initFloatingWidget, type FloatingWidget } from './floatingWidget';
import { messengerAdapter } from './messengerAdapter';
import { mockAdapter } from './mockAdapter';
import { widgetAction, type WidgetAction } from './widgetPolicy';

const DEBOUNCE_MS = 400;
const CHECK_MS = 1000;

function pickAdapter(): ChatAdapter | null {
  if (document.querySelector('[data-safechat-mock-thread]')) return mockAdapter;
  if (/(^|\.)facebook\.com$|(^|\.)messenger\.com$/.test(location.hostname)) return messengerAdapter;
  return null;
}

let observer: MutationObserver | null = null;
let checkTimer: ReturnType<typeof setInterval> | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;
let trackedThread: string | null = null;
let waiting = false;
let widget: FloatingWidget | null = null;

/** Widget chỉ được tạo/gỡ qua đây, theo quyết định thuần của widgetPolicy. */
function applyWidget(a: WidgetAction) {
  if (a.type === 'show') widget = initFloatingWidget(a.badge);
  else if (a.type === 'update') {
    if (widget) widget.update(a.badge);
    else widget = initFloatingWidget(a.badge);
  } else if (a.type === 'hide') {
    widget?.destroy();
    widget = null;
  }
}

function send(ev: ContentEvent) {
  chrome.runtime.sendMessage(ev).catch(() => {
    // Extension bị tải lại/gỡ: dừng hẳn để không chạy mồ côi
    stop();
  });
}

function flush(adapter: ChatAdapter) {
  if (!trackedThread || waiting) return;
  const { messages, error } = adapter.readMessages(trackedThread);
  if (error) send({ kind: 'cs_messages', threadId: trackedThread, batch: [], error });
  else if (messages.length) send({ kind: 'cs_messages', threadId: trackedThread, batch: messages });
}

function checkThread(adapter: ChatAdapter) {
  if (!trackedThread) return;
  const list = adapter.listThreads();
  if (list.some((t) => t.threadId === trackedThread)) {
    if (waiting) {
      waiting = false;
      send({ kind: 'cs_thread_waiting', threadId: trackedThread, waiting: false });
    }
    // Trang có thể thay phần tử gốc khi render lại → gắn lại observer nếu cần
    if (attachObserver(adapter)) flush(adapter);
    return;
  }
  if (adapter.keepsSelection) {
    // Khung chat bị đóng/thu nhỏ: giữ lựa chọn, chờ mở lại đúng cuộc này (không đọc cuộc khác)
    if (!waiting) {
      waiting = true;
      detachObserver();
      send({ kind: 'cs_thread_waiting', threadId: trackedThread, waiting: true });
    }
    return;
  }
  const next = list.length === 1 ? list[0]! : null;
  send({ kind: 'cs_thread_changed', threadId: next?.threadId ?? null, threadLabel: next?.threadLabel ?? '' });
  stop();
}

let observedRoot: Node | null = null;
/** Trả true khi vừa gắn observer vào phần tử gốc mới. */
function attachObserver(adapter: ChatAdapter): boolean {
  const root = trackedThread ? adapter.observeRoot(trackedThread) : null;
  if (!root || root === observedRoot) return false;
  detachObserver();
  observedRoot = root;
  observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => flush(adapter), DEBOUNCE_MS);
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return true;
}

function detachObserver() {
  observer?.disconnect();
  observer = null;
  observedRoot = null;
}

function start(adapter: ChatAdapter, threadId: string) {
  stop();
  trackedThread = threadId;
  attachObserver(adapter);
  checkTimer = setInterval(() => checkThread(adapter), CHECK_MS);
  flush(adapter);
}

function stop() {
  detachObserver();
  clearInterval(checkTimer);
  clearTimeout(debounce);
  trackedThread = null;
  waiting = false;
  applyWidget({ type: 'hide' });
}

function probeLocal(): ProbeResult {
  const adapter = pickAdapter();
  if (!adapter) return { supported: false, reason: 'Trang này chưa được hỗ trợ.' };
  const threads = adapter.listThreads();
  const one = threads.length === 1 ? threads[0]! : null;
  return threads.length
    ? { supported: true, platform: adapter.platform, threads, threadId: one?.threadId, threadLabel: one?.threadLabel }
    : {
      supported: false,
      reason: adapter.whyNotDetected?.() ?? 'Chưa nhận diện chắc chắn cuộc trò chuyện. Hãy mở một đoạn chat cụ thể.',
    };
}

chrome.runtime.onMessage.addListener((req: ContentRequest, _sender, sendResponse) => {
  const adapter = pickAdapter();
  switch (req.kind) {
    case 'cs_probe':
      sendResponse(probeLocal());
      return false;
    case 'cs_start':
      if (adapter) {
        start(adapter, req.threadId);
        applyWidget(widgetAction(req, !!widget));
      }
      sendResponse({ ok: !!adapter });
      return false;
    case 'cs_stop':
      stop();
      sendResponse({ ok: true });
      return false;
    case 'cs_risk_update':
      // Chỉ trên trang được hỗ trợ; widget chỉ hiện khi phiên đang theo dõi
      if (adapter) applyWidget(widgetAction(req, !!widget));
      sendResponse({ ok: true });
      return false;
  }
});

// Không tạo widget khi tải trang. Chỉ báo cho background là đã sẵn sàng: nếu đang có phiên
// theo dõi ở tab này, background gửi lại mức/điểm để khôi phục widget sau khi tải lại trang.
if (pickAdapter()) send({ kind: 'cs_ready' });