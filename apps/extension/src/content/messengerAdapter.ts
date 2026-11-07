// Adapter cho khung chat popup Messenger trên facebook.com.
// DOM của Messenger KHÔNG ổn định và có thể đổi bất cứ lúc nào — TẤT CẢ selector nằm ở đây.
// Cấu trúc đã dò trên giao diện thật (11/2026, dev/dom-probe.js):
//   khung: [button aria-label="Cài đặt đoạn chat"] › h2 (tên) · a[aria-label=<tên>][href=/<id>/]
//   tin:   div[role=log] › … › div[data-message-id="<id>@msgr.…"][aria-label="Lúc …, Bạn: …"] › … div[dir=auto]
// Phạm vi: mã cuộc = ID số của người kia trong link phần đầu; mọi mã tin phải bắt đầu bằng "<id>@msgr."
// (lệch → dừng đọc). Không dùng tên làm khóa. Chat nhóm/không có link hồ sơ: chưa hỗ trợ (không đoán).
import type { ObservedMessage } from '@safechat/core/transcript';
import type { ThreadInfo } from '../shared/protocol';
import type { ChatAdapter } from './adapter';
import {
  HEADER_BUTTON_LABELS,
  labelFromComposer,
  messageIdMatchesPeer,
  peerIdFromHref,
  senderFromAria,
  senderFromPosition,
} from './messengerParse';

const SELECTORS = {
  log: '[role="log"]',
  message: '[data-message-id]',
  text: '[dir="auto"]',
  /** Phần tử chứa chữ không thuộc nội dung tin: nút (vd. "Nhập, bản sao trợ năng"), tiêu đề, phần ẩn, ô soạn. */
  notText: '[role="button"],[contenteditable="true"],h2,[aria-hidden="true"]',
  composer: '[role="textbox"][contenteditable="true"]',
};
const MAX_ROWS = 300;
const MAX_TEXT = 4000;

interface Thread extends ThreadInfo {
  peer: string;
  log: HTMLElement;
}

function visible(el: HTMLElement): boolean {
  if (!el.isConnected || el.getClientRects().length === 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

/** Tìm nút phần đầu khung, duyệt cây con của `root` nhưng KHÔNG đi vào vùng tin (không đụng nội dung). */
function findHeader(root: Element, log: Element): Element | undefined {
  const pending = [...root.children];
  while (pending.length) {
    const node = pending.shift()!;
    if (node === log) continue;
    if (node.getAttribute('role') === 'button' && HEADER_BUTTON_LABELS.includes(node.getAttribute('aria-label') ?? '')) return node;
    pending.push(...node.children);
  }
  return undefined;
}

/** Mọi khung chat đang hiển thị xác minh được (chỉ đọc phần đầu khung + link hồ sơ). */
function threads(): Thread[] {
  const out: Thread[] = [];
  for (const log of document.querySelectorAll<HTMLElement>(`${SELECTORS.log}[aria-label]`)) {
    if (!visible(log)) continue;
    let root = log.parentElement;
    for (let depth = 0; root && depth < 12; depth++, root = root.parentElement) {
      if (root.querySelectorAll(SELECTORS.log).length !== 1) break; // đã lan sang khung khác
      const header = findHeader(root, log);
      if (!header) continue;
      const name =
        header.querySelector('h2')?.textContent?.trim() ||
        labelFromComposer(root.querySelector(SELECTORS.composer)?.getAttribute('aria-label')) ||
        '';
      const ids = new Set(
        [...root.querySelectorAll<HTMLAnchorElement>('a[aria-label][href]')]
          .filter((a) => !log.contains(a) && a.getAttribute('aria-label') === name)
          .map((a) => peerIdFromHref(a.getAttribute('href') ?? ''))
          .filter((x): x is string => !!x),
      );
      if (name && ids.size === 1) {
        const peer = [...ids][0]!;
        out.push({ threadId: `messenger:${peer}`, threadLabel: name, peer, log });
      }
      break;
    }
  }
  return out;
}

/** Đúng một khung khớp mã đã chọn (hai khung cùng mã → không đọc). */
function selected(threadId: string): Thread | undefined {
  const m = threads().filter((t) => t.threadId === threadId);
  return m.length === 1 ? m[0] : undefined;
}

export const messengerAdapter: ChatAdapter = {
  platform: 'messenger',
  keepsSelection: true,

  listThreads() {
    return threads().map(({ threadId, threadLabel }) => ({ threadId, threadLabel }));
  },

  whyNotDetected() {
    const logs = [...document.querySelectorAll<HTMLElement>(SELECTORS.log)].filter(visible).length;
    if (logs > 0)
      return 'Thấy khung chat nhưng chưa xác minh được người đang trò chuyện (chat nhóm hoặc giao diện khác chưa được hỗ trợ).';
    return 'Chưa thấy khung chat nào đang mở. Hãy mở khung chat (không thu nhỏ) với người cần kiểm tra.';
  },

  readMessages(threadId) {
    const t = selected(threadId);
    if (!t) return { messages: [] };
    const rows = [...t.log.querySelectorAll<HTMLElement>(SELECTORS.message)]
      .filter((r) => !r.parentElement?.closest(SELECTORS.message))
      .slice(-MAX_ROWS);
    // Kiểm tra TẤT CẢ mã tin trước khi lấy bất kỳ chữ nào
    if (rows.some((r) => !messageIdMatchesPeer(r.dataset.messageId, t.peer)))
      return { messages: [], error: 'Mã tin nhắn không khớp người đã chọn — đã ngừng đọc để tránh đọc nhầm cuộc khác.' };
    const listRect = t.log.getBoundingClientRect();
    const out: ObservedMessage[] = [];
    for (const row of rows) {
      const els = [...row.querySelectorAll<HTMLElement>(SELECTORS.text)].filter(
        (n) => !n.querySelector(SELECTORS.text) && !n.closest(SELECTORS.notText),
      );
      const parts = els.map((n) => (n.innerText ?? n.textContent ?? '').trim()).filter(Boolean);
      if (parts.length === 0) continue; // ảnh, sticker, voice… chưa hỗ trợ
      const text = parts.join(' ');
      if (text.length > MAX_TEXT) continue;
      const sender =
        senderFromAria(row.getAttribute('aria-label'), parts[parts.length - 1]!) ??
        senderFromPosition(els[els.length - 1]!.getBoundingClientRect(), listRect);
      out.push({ sender, text, domId: row.dataset.messageId });
    }
    return { messages: out };
  },

  observeRoot(threadId) {
    return selected(threadId)?.log ?? null;
  },
};
