// Bóc tách thực thể từ văn bản GỐC của tin nhắn (không bỏ dấu): đường link, file .apk, ví crypto,
// số tài khoản, số điện thoại. Dùng để sinh tín hiệu kỹ thuật và làm ngữ cảnh cho luật khác.

export interface Entities {
  urls: string[];
  /** Link rút gọn / tên miền rẻ tiền / tên miền giả cơ quan, thương hiệu. */
  suspiciousUrls: { url: string; reason: string }[];
  /** Link mời sang kênh kín (t.me, zalo.me…). */
  channelLinks: string[];
  apk: boolean;
  cryptoWallets: string[];
  bankAccounts: string[];
  phones: string[];
}

const SHORTENERS = ['bit.ly', 'tinyurl.com', 'cutt.ly', 'shorturl.at', 'rb.gy', 'is.gd', 'goo.gl', 't.ly', 'tiny.cc', 'shorten.asia'];
const CHANNEL_HOSTS = ['t.me', 'telegram.me', 'zalo.me', 'wa.me', 'line.me'];
const CHEAP_TLDS = ['top', 'xyz', 'cc', 'site', 'online', 'club', 'vip', 'icu', 'shop', 'live', 'buzz', 'work', 'click', 'link', 'win', 'bond', 'cfd', 'sbs'];
/** Từ khóa cơ quan/thương hiệu hay bị giả mạo trong tên miền. */
const BRAND_WORDS = [
  'vneid', 'dichvucong', 'etax', 'thue', 'bocongan', 'congan', 'evn', 'baohiem', 'bhxh',
  'vietcombank', 'vcb', 'techcombank', 'mbbank', 'agribank', 'bidv', 'vietinbank', 'tpbank', 'acb', 'sacombank', 'vpbank',
  'shopee', 'lazada', 'tiktok', 'momo', 'zalopay', 'viettel', 'vinaphone', 'mobifone',
];
/** Tên miền chính thức (và tên miền con) — không coi là giả mạo. */
const OFFICIAL_SUFFIXES = [
  'gov.vn', 'vneid.gov.vn', 'vietcombank.com.vn', 'techcombank.com', 'mbbank.com.vn', 'agribank.com.vn', 'bidv.com.vn',
  'vietinbank.vn', 'tpb.vn', 'acb.com.vn', 'sacombank.com.vn', 'vpbank.com.vn', 'shopee.vn', 'lazada.vn', 'tiktok.com',
  'momo.vn', 'zalopay.vn', 'viettel.vn', 'vinaphone.com.vn', 'mobifone.vn', 'evn.com.vn', 'baohiemxahoi.gov.vn',
  'viettel.com.vn', 'vietteltelecom.vn', 'viettelmoney.vn', 'tv360.vn', 'garena.vn',
];
/** Link ứng dụng chính thức trên dịch vụ link động dùng chung (page.link, go.link): chỉ tin đúng host này. */
const OFFICIAL_HOSTS = ['myvt.page.link', 'mymobifone.page.link', 'myviettel.go.link', 'viettelmoney.go.link'];

const URL_RE =
  /\b(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24})(?::\d{2,5})?(?:\/[^\s]*)?/gi;
const KNOWN_TLDS = /\.(?:com|net|org|vn|info|io|me|ly|gl|gd|at|cc|top|xyz|site|online|club|vip|icu|shop|live|buzz|work|click|link|win|bond|cfd|sbs|asia|app|co|in|tk|ml|ga|cf)$/i;

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//i, '').split(/[/:?#]/)[0]!.toLowerCase();
}

function classify(host: string, url: string): string | null {
  if (SHORTENERS.includes(host)) return 'link rút gọn che giấu đích đến';
  const official = OFFICIAL_HOSTS.includes(host) || OFFICIAL_SUFFIXES.some((s) => host === s || host.endsWith('.' + s));
  if (official) return /\.apk(\?|$)/i.test(url) ? 'link tải trực tiếp file .apk' : null;
  // So tên thương hiệu trên phần tên miền đã bỏ đuôi (.vn, .com.vn, .top…) — tránh "agame.vn" bị coi là giống "evn"
  const flat = host.replace(/\.(com|net|org|edu|gov)\.vn$|\.[a-z]+$/, '').replace(/[.-]/g, '');
  const brand = BRAND_WORDS.find((b) => flat.includes(b));
  if (brand) return `tên miền giống "${brand}" nhưng không phải trang chính thức`;
  const tld = host.split('.').pop() ?? '';
  if (CHEAP_TLDS.includes(tld)) return `tên miền đuôi .${tld} thường dùng cho trang tạm/lừa đảo`;
  if (/\.apk(\?|$)/i.test(url)) return 'link tải trực tiếp file .apk';
  return null;
}

export function extractEntities(text: string): Entities {
  const lower = text.toLowerCase();
  const urls: string[] = [];
  const suspiciousUrls: Entities['suspiciousUrls'] = [];
  const channelLinks: string[] = [];
  for (const m of lower.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)]+$/, '');
    const host = hostOf(url);
    // Bỏ qua chuỗi kiểu "1.5", "a.b" không phải tên miền thật, và email
    if (!KNOWN_TLDS.test(host) || /@/.test(lower.slice(Math.max(0, (m.index ?? 0) - 1), m.index))) continue;
    if (/^\d+(\.\d+)+$/.test(host)) continue;
    urls.push(url);
    if (CHANNEL_HOSTS.includes(host)) channelLinks.push(url);
    const reason = classify(host, url);
    if (reason) suspiciousUrls.push({ url, reason });
  }

  const apk = /\.apk\b|\bfile apk\b|\bapk\b/i.test(lower);
  const cryptoWallets = [...text.matchAll(/\bT[A-HJ-NP-Za-km-z1-9]{33}\b/g)].map((m) => m[0]);

  // Số điện thoại VN (0xx / +84) — có thể viết cách quãng
  const phones: string[] = [];
  const bankAccounts: string[] = [];
  for (const m of text.matchAll(/(?<![\d.,])(?:\+?84|0)?\d(?:[ .-]?\d){7,18}(?![\d.,]*\d)/g)) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, '');
    if (/^(?:84|0)(?:3|5|7|8|9)\d{8}$/.test(digits.replace(/^\+/, ''))) phones.push(digits);
    else if (digits.length >= 8 && digits.length <= 19 && !/[.,]\d{3}$/.test(raw)) bankAccounts.push(digits);
  }
  return { urls, suspiciousUrls, channelLinks, apk, cryptoWallets, bankAccounts, phones };
}
