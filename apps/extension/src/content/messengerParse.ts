// Phần thuần (không DOM) của adapter Messenger — tách riêng để test bằng Vitest.
import type { Sender } from '@safechat/core/types';

/** Tiền tố nhãn ô soạn tin của khung chat: "Viết cho Mạnh Hùng" → "Mạnh Hùng". */
const COMPOSER_PREFIX = /^(?:viết cho|nhắn tin cho|gửi tin nhắn cho|write to|message)\s+/i;

export function labelFromComposer(aria: string | null | undefined): string | null {
  const s = aria?.trim();
  if (!s || !COMPOSER_PREFIX.test(s)) return null;
  const name = s.replace(COMPOSER_PREFIX, '').trim();
  return name || null;
}

/** Nhãn nút phần đầu khung chat (đã đối chiếu DOM thật). */
export const HEADER_BUTTON_LABELS = ['Cài đặt đoạn chat', 'Chat settings'];

const FB_HOSTS = new Set(['www.facebook.com', 'web.facebook.com', 'facebook.com', 'www.messenger.com', 'messenger.com']);

/** ID số của người kia từ link hồ sơ ở phần đầu khung chat: /<số>/ hoặc /profile.php?id=<số>. */
export function peerIdFromHref(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href, 'https://www.facebook.com');
  } catch {
    return null;
  }
  if (!FB_HOSTS.has(u.hostname)) return null;
  const m = /^\/(\d+)\/?$/.exec(u.pathname);
  if (m) return m[1]!;
  if (u.pathname === '/profile.php') return /^\d+$/.exec(u.searchParams.get('id') ?? '')?.[0] ?? null;
  return null;
}

/**
 * Mã tin của Messenger có dạng "<id người kia>@msgr.<…>". Mọi tin đọc được phải khớp người đã chọn —
 * một tin lệch là dấu hiệu bộ đọc đang nhìn nhầm vùng → dừng đọc (không đọc nhầm cuộc khác).
 */
export function messageIdMatchesPeer(messageId: string | undefined, peer: string): boolean {
  return !!messageId && messageId.length <= 180 && messageId.startsWith(`${peer}@msgr.`);
}

/**
 * Người gửi theo aria-label của tin, dạng "Lúc Thứ Sáu 20:29ch, Bạn: Kkk" / "At 8:29 PM, You: …".
 *  1. Chắc nhất: ngay sau "<người gửi>: " là đúng phần đầu nội dung tin (tránh nhầm khi nội dung chứa "Bạn:").
 *  2. Không thấy nội dung trong nhãn: dựa vào tiền tố "Lúc …, Bạn:".
 * Không khớp → null (dùng vị trí trái/phải thay thế).
 */
export function senderFromAria(aria: string | null | undefined, text: string): Sender | null {
  if (!aria) return null;
  const a = aria.replace(/\s+/g, ' ');
  const head = text.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (head) {
    if (a.includes(`, Bạn: ${head}`) || a.includes(`, You: ${head}`)) return 'self';
    if (a.includes(`: ${head}`)) return 'other';
  }
  if (/^(?:Lúc\s+[^,]+,\s*Bạn:|At\s+[^,]+,\s*You:)/i.test(a)) return 'self';
  if (/^(?:Lúc|At)\s+[^,]+,\s*[^:]+:/i.test(a)) return 'other';
  return null;
}

/** Tin của chính người dùng nằm lệch phải trong danh sách tin; quá sát giữa thì 'unknown'. */
export function senderFromPosition(bubble: { left: number; width: number }, list: { left: number; width: number }): Sender {
  if (list.width === 0 || bubble.width === 0) return 'unknown';
  const center = bubble.left + bubble.width / 2;
  const mid = list.left + list.width / 2;
  const margin = list.width * 0.05;
  if (center > mid + margin) return 'self';
  if (center < mid - margin) return 'other';
  return 'unknown';
}
