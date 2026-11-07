// Ngữ cảnh hội thoại:
//  1. Tín hiệu từ thực thể (link đáng ngờ, ví crypto, link kênh kín).
//  2. Luật ngữ cảnh GIẢM cảnh báo nhầm: giao dịch đời thường (chia tiền ăn, mua hàng có COD) với số tiền
//     nhỏ được hạ chuyển khoản/đặt cọc xuống mức Thấp — chỉ khi KHÔNG có bất kỳ dấu hiệu rủi ro nào khác
//     và không có ngữ cảnh tuyển dụng/nhiệm vụ (phí việc làm luôn là dấu hiệu chính của đề tài).
import { extractEntities } from './entities';
import { normalizeForMatch, stripDiacritics } from './normalize';
import type { ChatMessage, Signal } from './types';

const quote = (m: ChatMessage) => (m.text.length > 220 ? m.text.slice(0, 217) + '…' : m.text.trim());

export function entitySignals(messages: ChatMessage[]): Signal[] {
  const links: { m: ChatMessage; reason: string; brand: boolean }[] = [];
  const wallets: ChatMessage[] = [];
  const channels: ChatMessage[] = [];
  for (const m of messages) {
    if (m.sender === 'self') continue;
    const e = extractEntities(m.text);
    for (const u of e.suspiciousUrls) links.push({ m, reason: u.reason, brand: u.reason.includes('giống') });
    if (e.cryptoWallets.length) wallets.push(m);
    if (e.channelLinks.length) channels.push(m);
  }
  const out: Signal[] = [];
  const ids = (ms: ChatMessage[]) => [...new Set(ms.map((m) => m.id))];
  const quotes = (ms: ChatMessage[]) => ids(ms).map((id) => quote(ms.find((m) => m.id === id)!));
  if (links.length) {
    const ms = links.map((l) => l.m);
    out.push({
      type: 'suspicious_link',
      category: 'technical',
      severity: links.some((l) => l.brand) ? 'high' : 'medium',
      title: 'Đường link đáng ngờ',
      explanation: `Tin nhắn chứa link có dấu hiệu bất thường: ${[...new Set(links.map((l) => l.reason))].join('; ')}.`,
      evidence_message_ids: ids(ms),
      evidence_quotes: quotes(ms),
      recommended_action: 'Không bấm link, không đăng nhập hay nhập OTP. Tự gõ địa chỉ trang chính thức hoặc dùng ứng dụng chính thức.',
      source: 'rule',
    });
  }
  if (wallets.length)
    out.push({
      type: 'crypto_wallet',
      category: 'investment',
      severity: 'medium',
      title: 'Yêu cầu giao dịch qua ví tiền ảo',
      explanation: 'Có địa chỉ ví tiền ảo (TRC20/USDT). Giao dịch tiền ảo gần như không thể truy hồi khi bị lừa.',
      evidence_message_ids: ids(wallets),
      evidence_quotes: quotes(wallets),
      recommended_action: 'Không chuyển tiền ảo cho người quen qua mạng hoặc "sàn" do người lạ giới thiệu.',
      source: 'rule',
    });
  if (channels.length)
    out.push({
      type: 'channel_migration',
      category: 'technical',
      severity: 'medium',
      title: 'Rủ chuyển sang kênh chat kín',
      explanation: 'Có link mời sang Telegram/Zalo/nhóm kín — nơi khó kiểm chứng và dễ thao túng hơn.',
      evidence_message_ids: ids(channels),
      evidence_quotes: quotes(channels),
      recommended_action: 'Giữ trao đổi ở kênh có thể kiểm chứng; không vào nhóm kín theo lời mời của người lạ.',
      source: 'rule',
    });
  return out;
}

/** Tất cả số tiền (đồng) nhắc tới trong văn bản đã chuẩn hóa. */
export function parseAmounts(n: string): number[] {
  const out: number[] = [];
  for (const m of n.matchAll(/\b(\d+(?:[.,]\d+)?) (trieu|nghin|ty)\b/g)) {
    const v = parseFloat((m[1] ?? '0').replace(',', '.'));
    out.push(v * (m[2] === 'ty' ? 1e9 : m[2] === 'trieu' ? 1e6 : 1e3));
  }
  for (const m of n.matchAll(/\b\d{1,3}(?:[.,]\d{3})+\b/g)) out.push(parseInt(m[0].replace(/[.,]/g, ''), 10));
  return out;
}

const SMALL_AMOUNT = 500_000;
const JOB_CONTEXT = /\b(tuyen|viec lam|cong viec|ung tuyen|nhan viec|luong|cong tac vien|nhiem vu|hoa hong|phong van|trung tuyen)\b/;
const EVERYDAY = /\b(com|an (trua|toi|sang)|tra sua|cafe|ca phe|nhau|bill|tien (an|com|nuoc|xang|dien|nha|phong)|chia (tien|bill)|gop tien|sinh nhat|di cho)\b/;
const SHOP = /\b(shop|cua hang|don (hang|dat)|dat hang|size|ship|shipper|giao hang)\b/;
const SHOP_SAFE = /\b(cod|thanh toan khi nhan|nhan hang\b.{0,15}\b(kiem tra|roi|moi)|kiem tra hang)\b/;
const MITIGABLE = new Set(['money_transfer', 'upfront_fee']);
const RISKY_CATEGORIES = new Set(['isolation', 'impersonation', 'technical', 'investment', 'account', 'contradiction', 'pressure']);

export function applyContextMitigations(signals: Signal[], messages: ChatMessage[]): Signal[] {
  const targets = signals.filter((s) => MITIGABLE.has(s.type));
  if (!targets.length) return signals;
  const others = messages.filter((m) => m.sender !== 'self').map((m) => normalizeForMatch(m.text));
  const all = others.join(' \n ');
  const otherRisk = signals.some(
    (s) => !MITIGABLE.has(s.type) && (s.severity === 'critical' || s.direct_danger || RISKY_CATEGORIES.has(s.category) || s.severity === 'high' || s.category === 'job_terms' || s.category === 'finance'),
  );
  if (otherRisk || JOB_CONTEXT.test(all)) return signals;
  const amounts = others.flatMap(parseAmounts);
  if (!amounts.length || Math.max(...amounts) > SMALL_AMOUNT) return signals;

  let reason: string | null = null;
  if (EVERYDAY.test(all)) reason = 'Ngữ cảnh chia tiền sinh hoạt với số tiền nhỏ';
  else if (SHOP.test(all) && SHOP_SAFE.test(all)) reason = 'Ngữ cảnh mua hàng có kiểm tra hàng/COD, số tiền nhỏ';
  if (!reason) return signals;

  return signals.map((s) =>
    MITIGABLE.has(s.type)
      ? {
          ...s,
          severity: 'low' as const,
          mitigation: reason!,
          // Tiêu đề/lời khuyên gốc nói về phí tuyển dụng — thay bằng nội dung trung lập hợp ngữ cảnh
          title: s.type === 'upfront_fee' ? 'Đặt cọc trong giao dịch thông thường' : 'Chuyển khoản trong giao dịch thông thường',
          explanation: `Có đề nghị chuyển tiền/đặt cọc nhưng thuộc ${reason!.toLowerCase()}, nên được hạ xuống mức Thấp.`,
          recommended_action: 'Kiểm tra đúng người nhận/uy tín cửa hàng; ưu tiên thanh toán khi nhận hàng và không chuyển thêm nếu bị hối thúc.',
        }
      : s,
  );
}

// ---------------------------------------------------------------- người dùng đã tự xác minh
// Ca "người quen mượn tiền": nếu SAU lời nhờ mượn, người dùng đã xác minh người thật (tự nói đã gọi điện/xác nhận,
// hoặc yêu cầu gọi → có cuộc gọi → chính người dùng xác nhận lại), thì hạ các tín hiệu mượn/chuyển tiền:
//   số tiền ≤ 2 triệu → Thấp; lớn hơn → tối đa Cần chú ý (vẫn nhắc kiểm tra tên tài khoản, gọi lại số đã lưu).
// KHÔNG hạ nếu cuộc gọi có dấu hiệu bất thường (mạng lag, hỏng mic, không nghe rõ — kiểu deepfake/giả giọng),
// hoặc có bất kỳ dấu hiệu rủi ro nào khác (nguy hiểm trực tiếp, cô lập, link/app, đầu tư, OTP/giấy tờ, thúc ép…).

const BORROW = new Set(['account_takeover_borrow', 'borrow_request', 'money_transfer']);
const VERIFIED_SAMPLE_LIMIT = 2_000_000;
const SELF_DONE = [
  /\b(da|vua|moi) (goi|goi dien|goi lai|xac minh|xac nhan|hoi lai|gap)\b/,
  /\b(da|vua|moi) (nghe may|bat may|nghe dien thoai|noi chuyen (dien thoai|qua dien thoai|truc tiep)?)\b/,
  /\bnghe (may|giong|dien thoai)\b.{0,20}\b(roi|xong)\b/,
  /\bdung (la )?(may|ban|anh|chi|em|ong|ba|co|chu) (roi|that)\b/,
];
const SELF_ASK = /\b(goi|goi dien|goi dien thoai|goi video|video call)\b.{0,20}\b(cho|lai|xem|di)\b/;
const CALL_EVIDENCE = /\[(cuoc )?(goi|cuoc goi) ?(thoai|video|dien)/;
/** Người dùng tự xác nhận sau cuộc gọi — kẻ gian không giả được tin của người dùng (dòng "[cuộc gọi…]" thì có thể gõ giả). */
const SELF_AFFIRM = /\b(roi|ok|oke|yen tam|dung roi|duoc roi|dung la|gui (so tai khoan|stk))\b/;
const SUSPICIOUS_CALL =
  /\b(mang (yeu|lag|cham)|lag (qua|lam)|hong (mic|loa|camera)|khong (nghe|goi) (may|duoc)|khong nghe ro|song yeu|mat tieng|khong thay mat)\b/;

export function applyVerificationMitigation(signals: Signal[], messages: ChatMessage[]): Signal[] {
  const targets = signals.filter((s) => BORROW.has(s.type) && !s.mitigation);
  if (!targets.some((s) => s.type !== 'money_transfer')) return signals;
  const otherRisk = signals.some(
    (s) =>
      !BORROW.has(s.type) &&
      !s.mitigation &&
      (s.severity === 'critical' || s.direct_danger || RISKY_CATEGORIES.has(s.category) || s.severity === 'high'),
  );
  if (otherRisk) return signals;

  const seqOf = (id: string) => Number(id.replace(/\D/g, '')) || 0;
  const firstBorrowSeq = Math.min(...targets.flatMap((s) => s.evidence_message_ids.map(seqOf)));
  const after = messages.filter((m) => m.seq > firstBorrowSeq);
  if (messages.some((m) => m.sender !== 'self' && SUSPICIOUS_CALL.test(normalizeForMatch(m.text)))) return signals;

  let verified = false;
  let askedAt = Infinity;
  let callAt = Infinity;
  for (const m of after) {
    const n = normalizeForMatch(m.text);
    const rawLower = stripDiacritics(m.text.toLowerCase());
    if (m.sender === 'self') {
      if (SELF_DONE.some((re) => re.test(n))) verified = true;
      if (SELF_ASK.test(n)) askedAt = Math.min(askedAt, m.seq);
      if (m.seq > callAt && SELF_AFFIRM.test(n)) verified = true;
    }
    if (m.seq > askedAt && CALL_EVIDENCE.test(rawLower)) callAt = Math.min(callAt, m.seq);
  }
  if (!verified) return signals;

  const amounts = messages.filter((m) => m.sender !== 'self').flatMap((m) => parseAmounts(normalizeForMatch(m.text)));
  const large = amounts.some((a) => a > VERIFIED_SAMPLE_LIMIT);
  return signals.map((s) =>
    BORROW.has(s.type) && !s.mitigation
      ? {
          ...s,
          severity: large ? ('medium' as const) : ('low' as const),
          mitigation: large ? 'Đã xác minh người thật nhưng số tiền lớn' : 'Người dùng đã xác minh người thật, số tiền nhỏ',
          title: large ? 'Mượn số tiền lớn — đã có bước xác minh' : 'Mượn tiền sau khi đã xác minh người thật',
          explanation: large
            ? 'Bạn đã xác minh người quen qua cuộc gọi, nhưng số tiền lớn: kiểm tra tên chủ tài khoản đúng là người quen và gọi lại số đã lưu (không qua ứng dụng chat) trước khi chuyển.'
            : 'Có lời nhờ mượn/chuyển tiền nhưng bạn đã xác minh người thật qua cuộc gọi và số tiền nhỏ, nên được hạ xuống mức Thấp.',
          recommended_action: 'Chỉ chuyển đúng số tiền đã thỏa thuận vào tài khoản đúng tên người quen; nếu bị hối thúc chuyển thêm, gọi lại số đã lưu.',
        }
      : s,
  );
}
