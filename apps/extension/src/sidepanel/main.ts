// Side panel: giới thiệu & đồng ý → phiên theo dõi → tổng quan / bằng chứng / bản nháp / cài đặt → kết thúc.
// Nội dung chat chỉ được đưa vào DOM qua textContent (không dùng innerHTML) để tránh XSS.
import { createSnapshot, describeSnapshot, parseSnapshot, serializeSnapshot, SnapshotError } from '@safechat/core/context-manager';
import { exportHtml, exportJson, type ExportScope } from '@safechat/core/export';
import {
  CATEGORY_LABEL,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_ORDER,
  SEVERITY_LABEL,
  STAGE_LABEL,
  type AnalysisResult,
  type RiskLevel,
  type ScamStage,
  type Signal,
  type SignalCategory,
  type UserMark,
} from '@safechat/core/types';
import {
  DEFAULT_SETTINGS,
  probeThreads,
  SESSION_KEY,
  SETTINGS_KEY,
  signalKey,
  USAGE_KEY,
  type PanelRequest,
  type ProbeResult,
  type Session,
  type Settings,
  type StopResult,
} from '../shared/protocol';
import { gatewayOriginPattern, normalizeGatewayUrl } from '../background/gateway';
import { downloadNano, nanoStatus, runNano, type NanoStatus } from './nano';

type View = 'overview' | 'analysis' | 'evidence' | 'draft' | 'settings';

const STAGES: ScamStage[] = ['S0', 'S1', 'S2', 'S3', 'S4'];
const SVG_NS = 'http://www.w3.org/2000/svg';

// Biến lưu trạng thái đồng hồ SVG để nội suy mượt 60fps mà không tạo lại phần tử
let displayedScore = 0;
let scoreAnimFrame = 0;
let gaugeDomCache: {
  root: HTMLElement;
  arc: SVGElement;
  pctEl: HTMLElement;
  capEl: HTMLElement;
  badgeEl: HTMLElement;
  arcLen: number;
} | null = null;

let tiersDomCache: {
  root: HTMLElement;
  rows: Record<RiskLevel, { rowEl: HTMLElement; segs: HTMLElement[] }>;
} | null = null;

const state: {
  session: Session | null;
  settings: Settings;
  probe: ProbeResult | null;
  tabId: number | null;
  consent: boolean;
  view: View;
  notice: { kind: 'ok' | 'err'; text: string } | null;
  nano: NanoStatus | null;
  nanoProgress: number | null;
  usageToday: number;
  /** Cuộc trò chuyện người dùng chọn khi đang mở nhiều khung chat. */
  chosenThread: string | null;
  /** File bản nháp đã chọn để tiếp tục (Context Manager). */
  resume: { text: string; info: ReturnType<typeof describeSnapshot> } | { error: string } | null;
  /** Trạng thái mở rộng hộp gợi ý nhanh trên màn hình LIVE. */
  adviceExpanded: boolean;
} = {
  session: null,
  settings: DEFAULT_SETTINGS,
  probe: null,
  tabId: null,
  consent: false,
  view: 'overview',
  notice: null,
  nano: null,
  nanoProgress: null,
  usageToday: 0,
  chosenThread: null,
  resume: null,
  adviceExpanded: true,
};

/** Cuộc trò chuyện sẽ theo dõi: cuộc duy nhất đang mở, hoặc cuộc người dùng đã chọn trong danh sách. */
function targetThread() {
  const list = probeThreads(state.probe);
  if (list.length === 1) return list[0]!;
  return list.find((t) => t.threadId === state.chosenThread) ?? null;
}

function threadPicker(): Node | false {
  const p = state.probe;
  if (p === null) return h('p', { class: 'muted' }, 'Đang kiểm tra trang…');
  if (!p.supported) return h('p', { class: 'err' }, p.reason ?? 'Trang này chưa được hỗ trợ.');
  const list = probeThreads(p);
  const tag = h('span', { class: 'tag' }, p.platform === 'mock' ? 'Giả lập' : 'Messenger');
  if (list.length === 1) return h('p', { style: 'margin:4px 0' }, h('b', {}, list[0]!.threadLabel), tag);
  return h(
    'div',
    {},
    h('p', { class: 'small' }, `Đang mở ${list.length} khung chat. Chọn đúng một người cần kiểm tra — chỉ cuộc được chọn mới được đọc nội dung:`),
    ...list.map((t) =>
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'radio',
          name: 'thread',
          checked: state.chosenThread === t.threadId,
          onchange: () => {
            state.chosenThread = t.threadId;
            render();
          },
        }),
        h('span', {}, t.threadLabel),
      ),
    ),
  );
}

// ---------- tiện ích DOM & SVG an toàn (không dùng innerHTML) ----------
type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | boolean | ((e: Event) => void)>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: SVGElement[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

// ---------- Đồ họa SVG Mascot Mèo Tuxedo & Đồng hồ Vòng cung ----------
function mascotHeroSvg(): SVGElement {
  return svg(
    'svg',
    { viewBox: '0 0 110 110', width: 90, height: 90, 'aria-hidden': 'true' },
    // Đuôi mèo
    svg('path', { d: 'M18 76 C8 68, 8 52, 18 48', stroke: '#1e2433', 'stroke-width': 8, 'stroke-linecap': 'round', fill: 'none' }),
    // Thân mèo tuxedo
    svg('ellipse', { cx: 48, cy: 74, rx: 24, ry: 22, fill: '#1e2433' }),
    svg('ellipse', { cx: 48, cy: 76, rx: 14, ry: 16, fill: '#ffffff' }),
    // Tai trái & phải
    svg('polygon', { points: '24,42 20,16 40,28', fill: '#1e2433' }),
    svg('polygon', { points: '25,38 23,21 37,29', fill: '#fda4af' }),
    svg('polygon', { points: '72,42 76,16 56,28', fill: '#1e2433' }),
    svg('polygon', { points: '71,38 73,21 59,29', fill: '#fda4af' }),
    // Đầu mèo
    svg('ellipse', { cx: 48, cy: 44, rx: 26, ry: 22, fill: '#1e2433' }),
    // Mảng trắng mặt tuxedo
    svg('path', { d: 'M48 34 L34 56 Q48 64 62 56 Z', fill: '#ffffff' }),
    // Mắt vàng hổ phách
    svg('circle', { cx: 37, cy: 41, r: 5.5, fill: '#facc15', class: 'mascot-eye' }),
    svg('circle', { cx: 37, cy: 41, r: 2.8, fill: '#111827', class: 'mascot-eye' }),
    svg('circle', { cx: 35.5, cy: 39.5, r: 1.2, fill: '#ffffff' }),
    svg('circle', { cx: 59, cy: 41, r: 5.5, fill: '#facc15', class: 'mascot-eye' }),
    svg('circle', { cx: 59, cy: 41, r: 2.8, fill: '#111827', class: 'mascot-eye' }),
    svg('circle', { cx: 57.5, cy: 39.5, r: 1.2, fill: '#ffffff' }),
    // Mũi hồng & miệng
    svg('ellipse', { cx: 48, cy: 48, rx: 3, ry: 2.2, fill: '#fb7185' }),
    svg('path', { d: 'M44 52 Q48 55 48 51 Q48 55 52 52', stroke: '#374151', 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }),
    // Khiên bảo vệ xanh dương bên phải
    svg('path', {
      d: 'M72 48 L96 54 L96 72 C96 86 84 96 72 100 C60 96 48 86 48 72 L48 54 Z',
      fill: '#2563eb',
      stroke: '#eff6ff',
      'stroke-width': 3,
    }),
    svg('path', { d: 'M65 73 L71 79 L82 66', stroke: '#ffffff', 'stroke-width': 3.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    // Chân trắng
    svg('ellipse', { cx: 34, cy: 93, rx: 7, ry: 5, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1 }),
    svg('ellipse', { cx: 54, cy: 68, rx: 6, ry: 4.5, fill: '#ffffff' }),
  );
}

function peekingCatSvg(): SVGElement {
  return svg(
    'svg',
    { viewBox: '0 0 120 68', class: 'peeking-cat-svg', 'aria-hidden': 'true' },
    // Tai trái & phải
    svg('polygon', { points: '28,38 22,10 46,24', fill: '#1e2433' }),
    svg('polygon', { points: '30,35 26,15 43,25', fill: '#fda4af' }),
    svg('polygon', { points: '92,38 98,10 74,24', fill: '#1e2433' }),
    svg('polygon', { points: '90,35 94,15 77,25', fill: '#fda4af' }),
    // Đầu mèo lấp ló
    svg('ellipse', { cx: 60, cy: 46, rx: 34, ry: 25, fill: '#1e2433' }),
    svg('path', { d: 'M60 32 L42 58 Q60 66 78 58 Z', fill: '#ffffff' }),
    // Mắt
    svg('circle', { cx: 46, cy: 43, r: 6, fill: '#facc15', class: 'mascot-eye' }),
    svg('circle', { cx: 46, cy: 43, r: 3.2, fill: '#111827', class: 'mascot-eye' }),
    svg('circle', { cx: 44.5, cy: 41, r: 1.4, fill: '#ffffff' }),
    svg('circle', { cx: 74, cy: 43, r: 6, fill: '#facc15', class: 'mascot-eye' }),
    svg('circle', { cx: 74, cy: 43, r: 3.2, fill: '#111827', class: 'mascot-eye' }),
    svg('circle', { cx: 72.5, cy: 41, r: 1.4, fill: '#ffffff' }),
    // Mũi
    svg('ellipse', { cx: 60, cy: 50, rx: 3.2, ry: 2.3, fill: '#fb7185' }),
    // Hai bàn chân trắng bám mép khung
    svg('ellipse', { cx: 30, cy: 60, rx: 11, ry: 6.5, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.2 }),
    svg('ellipse', { cx: 90, cy: 60, rx: 11, ry: 6.5, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.2 }),
  );
}

const LEVEL_STROKE: Record<RiskLevel, string> = {
  low: '#16a34a',
  attention: '#3b82f6',
  high: '#f59e0b',
  critical: '#dc2626',
};

const LEVEL_BADGE_TEXT: Record<RiskLevel, string> = {
  low: '✓ Chưa thấy dấu hiệu rõ',
  attention: 'ℹ️ Cần chú ý xác minh',
  high: '⚠️ Có dấu hiệu rủi ro',
  critical: '🚨 Rủi ro rất cao',
};

function updateGaugeNode(targetScore: number, level: RiskLevel): HTMLElement {
  const r = 46;
  const circum = 2 * Math.PI * r;
  const arcLen = (240 / 360) * circum;
  const clamped = Math.max(0, Math.min(100, targetScore));

  if (!gaugeDomCache) {
    const startOffset = arcLen - (displayedScore / 100) * arcLen;
    const track = svg('circle', {
      cx: 63,
      cy: 58,
      r,
      class: 'gauge-track',
      'stroke-dasharray': `${arcLen} ${circum}`,
      transform: 'rotate(150 63 58)',
    });
    const arc = svg('circle', {
      cx: 63,
      cy: 58,
      r,
      class: 'gauge-arc',
      stroke: LEVEL_STROKE[level],
      'stroke-dasharray': `${arcLen} ${circum}`,
      'stroke-dashoffset': String(startOffset),
      transform: 'rotate(150 63 58)',
    });
    const pctEl = h('div', { class: 'gauge-pct' }, `${Math.round(displayedScore)}%`);
    const capEl = h('div', { class: 'gauge-caption' }, `${RISK_LEVEL_LABEL[level]} (${clamped}/100)`);
    const badgeEl = h('div', { class: `risk-pill-badge ${level}` }, LEVEL_BADGE_TEXT[level]);
    const root = h(
      'div',
      { class: 'gauge-panel' },
      h(
        'div',
        { class: 'gauge-wrap' },
        svg('svg', { viewBox: '0 0 126 112', class: 'gauge-svg', 'aria-hidden': 'true' }, track, arc),
        h('div', { class: 'gauge-center' }, pctEl, capEl),
      ),
      badgeEl,
    );
    gaugeDomCache = { root, arc, pctEl, capEl, badgeEl, arcLen };
  }

  const { root, arc, pctEl, capEl, badgeEl } = gaugeDomCache;
  const endOffset = arcLen - (clamped / 100) * arcLen;

  arc.setAttribute('stroke', LEVEL_STROKE[level]);
  capEl.textContent = `${RISK_LEVEL_LABEL[level]} (${clamped}/100)`;
  badgeEl.className = `risk-pill-badge ${level}`;
  badgeEl.textContent = LEVEL_BADGE_TEXT[level];

  requestAnimationFrame(() => {
    arc.setAttribute('stroke-dashoffset', String(endOffset));
  });

  cancelAnimationFrame(scoreAnimFrame);
  const fromVal = displayedScore;
  if (Math.abs(clamped - fromVal) < 0.5) {
    displayedScore = clamped;
    pctEl.textContent = `${clamped}%`;
    return root;
  }

  const startTime = performance.now();
  const durationMs = 580;
  const tick = (now: number) => {
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    displayedScore = fromVal + (clamped - fromVal) * eased;
    pctEl.textContent = `${Math.round(displayedScore)}%`;
    if (t < 1) {
      scoreAnimFrame = requestAnimationFrame(tick);
    } else {
      displayedScore = clamped;
      pctEl.textContent = `${clamped}%`;
    }
  };
  scoreAnimFrame = requestAnimationFrame(tick);
  return root;
}

function tierSegmentsFor(r: AnalysisResult, rowLevel: RiskLevel): number {
  const curOrder = RISK_LEVEL_ORDER[r.risk_level];
  const rowOrder = RISK_LEVEL_ORDER[rowLevel];
  if (rowLevel === r.risk_level) {
    if (rowLevel === 'critical') return 4;
    if (rowLevel === 'high') return r.score >= 80 ? 4 : 3;
    if (rowLevel === 'attention') return r.score >= 45 ? 3 : 2;
    return r.score > 0 ? 2 : 1;
  }
  if (rowOrder < curOrder) {
    return rowLevel === 'low' ? 1 : 2;
  }
  return 0;
}

function updateTiersNode(r: AnalysisResult): HTMLElement {
  const rowDefs: { level: RiskLevel; label: string }[] = [
    { level: 'critical', label: 'Rất cao' },
    { level: 'high', label: 'Cao' },
    { level: 'attention', label: 'Trung bình' },
    { level: 'low', label: 'Thấp' },
  ];

  if (!tiersDomCache) {
    const rows = {} as Record<RiskLevel, { rowEl: HTMLElement; segs: HTMLElement[] }>;
    const children: HTMLElement[] = [];
    for (const { level, label } of rowDefs) {
      const segs = [0, 1, 2, 3].map((i) =>
        h('span', {
          class: `seg ${level}`,
          style: `transition-delay:${i * 55}ms`,
        }),
      );
      const rowEl = h(
        'div',
        { class: `tier-row ${level}` },
        h('div', { class: 'tier-label-wrap' }, h('span', { class: `tier-dot ${level}` }), h('span', {}, label)),
        h('div', { class: 'tier-segs' }, ...segs),
      );
      rows[level] = { rowEl, segs };
      children.push(rowEl);
    }
    const root = h('div', { class: 'tiers-panel', 'aria-label': 'Thang 4 mức rủi ro' }, ...children);
    tiersDomCache = { root, rows };
  }

  for (const { level } of rowDefs) {
    const entry = tiersDomCache.rows[level];
    const active = r.risk_level === level;
    const litCount = tierSegmentsFor(r, level);
    entry.rowEl.className = `tier-row ${level}${active ? ' active' : ''}`;
    entry.segs.forEach((segEl, idx) => {
      segEl.className = `seg ${level}${idx < litCount ? ' on' : ''}`;
    });
  }

  return tiersDomCache.root;
}

function send<T = { ok: boolean; reason?: string }>(req: PanelRequest): Promise<T> {
  return chrome.runtime.sendMessage(req) as Promise<T>;
}

function setNotice(kind: 'ok' | 'err', text: string) {
  state.notice = { kind, text };
  render();
}

function download(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function duration(from: number): string {
  const m = Math.floor((Date.now() - from) / 60000);
  return m < 1 ? 'dưới 1 phút' : m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

// ---------- màn hình giới thiệu & đồng ý (Khối 1: Launcher Card + Quyền riêng tư) ----------
function introView(): Node {
  const canStart = state.consent && !!targetThread();
  return h(
    'div',
    {},
    // Khối 1: Launcher Hero Card theo đúng thiết kế Mockup
    h(
      'section',
      { class: 'card launcher-card' },
      h(
        'div',
        { class: 'launcher-top' },
        h('div', { class: 'mascot-hero-wrap' }, mascotHeroSvg()),
        h(
          'div',
          { class: 'launcher-info' },
          h(
            'div',
            { class: 'launcher-title-row' },
            h('span', { class: 'launcher-title' }, 'SafeChat AI'),
            h(
              'button',
              {
                class: 'icon-btn',
                title: 'Mở cài đặt AI & hạn mức',
                onclick: () => {
                  document.getElementById('settings-section')?.scrollIntoView({ behavior: 'smooth' });
                },
              },
              '⚙',
            ),
          ),
          h('div', { class: 'launcher-sub' }, 'Bảo vệ bạn khỏi lừa đảo trực tuyến'),
          h(
            'div',
            { class: 'row', style: 'margin-top:8px' },
            h(
              'button',
              {
                class: 'primary start-btn-pill',
                disabled: !canStart,
                onclick: async () => {
                  if (state.tabId === null) return;
                  const r = await send({ kind: 'start', tabId: state.tabId, threadId: targetThread()?.threadId });
                  if (!r.ok) setNotice('err', r.reason ?? 'Không bắt đầu được.');
                  else state.notice = null;
                },
              },
              '▶ Bắt đầu theo dõi',
            ),
            h('button', { onclick: () => void refreshProbe() }, 'Kiểm tra lại'),
          ),
        ),
      ),
      h(
        'div',
        { class: 'launcher-thread-box' },
        h('div', { class: 'muted small', style: 'font-weight:600;margin-bottom:4px' }, 'Cuộc trò chuyện hiện tại:'),
        threadPicker(),
        h(
          'label',
          { class: 'check', style: 'margin-top:8px' },
          h('input', {
            type: 'checkbox',
            checked: state.consent,
            onchange: (e: Event) => {
              state.consent = (e.target as HTMLInputElement).checked;
              render();
            },
          }),
          h('span', { class: 'small' }, 'Tôi hiểu và đồng ý cho SafeChat AI đọc văn bản của riêng cuộc trò chuyện đang mở.'),
        ),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Trước khi bắt đầu'),
      h(
        'p',
        { class: 'small' },
        'SafeChat AI chỉ theo dõi cuộc trò chuyện bạn chọn, trong phạm vi nội dung Messenger đang hiển thị mà extension đọc được. Bản nháp được giữ tạm trong bộ nhớ trình duyệt để phân tích và tự mất khi đóng trình duyệt.',
      ),
      h(
        'ul',
        { class: 'small' },
        h('li', {}, 'Đọc: văn bản tin nhắn của cuộc trò chuyện đang mở.'),
        h('li', {}, 'Không đọc: các cuộc trò chuyện khác, ảnh, file, tin thoại; không tự gửi tin nhắn.'),
        h(
          'li',
          {},
          'Nhận biết dấu hiệu của các kịch bản lừa đảo qua tin nhắn: việc làm/nhiệm vụ, đầu tư, vay online, mạo danh cơ quan hoặc người quen, link/ứng dụng độc hại, quà nước ngoài, "thu hồi tiền", dụ dỗ/cô lập. Không bao phủ cuộc gọi, SMS hay bưu kiện.',
        ),
        h('li', {}, `Giới hạn: tối đa ${state.settings.maxMessages} tin gần nhất; có thể bỏ sót khi Messenger tải từng phần.`),
        h('li', {}, aiDisclosure()),
        h('li', {}, 'Khung cảnh báo nổi trên trang chỉ hiện sau khi bạn bấm \"Bắt đầu theo dõi\", và chỉ hiển thị mức và điểm, không chứa nội dung chat.'),
        h('li', {}, 'Bạn có thể tạm dừng, xuất báo cáo, hoặc dừng và xóa phiên bất cứ lúc nào.'),
      ),
    ),
    resumeCard(),
    settingsCard(),
  );
}

// ---------- Context Manager: tiếp tục từ bản nháp ----------
function resumeCard(): Node {
  const r = state.resume;
  const info = r && 'info' in r ? r.info : null;
  const target = targetThread();
  const labelDiffers = !!(info && target?.threadLabel && info.label && target.threadLabel !== info.label);
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Tiếp tục từ bản nháp'),
    h(
      'p',
      { class: 'muted small' },
      'Chọn file phiên (.json) đã lưu bằng nút "Lưu phiên để tiếp tục". Bản nháp, bằng chứng, tóm tắt AI và trạng thái cảnh báo sẽ được khôi phục; kết quả được tính lại, tin mới trên màn hình được nối tiếp không trùng lặp.',
    ),
    h('input', {
      type: 'file',
      accept: '.json,application/json',
      'aria-label': 'Chọn file phiên đã lưu',
      onchange: async (e: Event) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (!f) return;
        const text = await f.text();
        try {
          state.resume = { text, info: describeSnapshot(parseSnapshot(text)) };
        } catch (err) {
          state.resume = { error: err instanceof SnapshotError ? err.message : 'Không đọc được file.' };
        }
        render();
      },
    }),
    r && 'error' in r && h('p', { class: 'err small' }, r.error),
    info &&
    h(
      'div',
      { style: 'margin-top:8px' },
      h(
        'ul',
        { class: 'small' },
        h('li', {}, `Cuộc trò chuyện: ${info.label || '(không tên)'}`),
        h('li', {}, `Lưu lúc: ${new Date(info.savedAt).toLocaleString('vi-VN')}`),
        h('li', {}, `${info.messages} tin · mức cao nhất: ${RISK_LEVEL_LABEL[info.maxLevel]} · ${info.aiSignals} tín hiệu AI`),
      ),
      labelDiffers &&
      h(
        'p',
        { class: 'banner small' },
        `Chat đang chọn là "${target!.threadLabel}", khác với chat trong file. Chỉ tiếp tục nếu đây đúng là cùng một cuộc trò chuyện — dữ liệu hai cuộc khác nhau sẽ bị trộn lẫn.`,
      ),
      h(
        'button',
        {
          class: 'primary',
          disabled: !state.consent || !target,
          onclick: async () => {
            if (state.tabId === null || !(r && 'text' in r)) return;
            if (labelDiffers && !confirm('Tên cuộc trò chuyện khác với file. Vẫn tiếp tục?')) return;
            const res = await send({ kind: 'resume_snapshot', tabId: state.tabId, snapshot: r.text, threadId: target?.threadId });
            if (!res.ok) setNotice('err', res.reason ?? 'Không tiếp tục được.');
            else {
              state.resume = null;
              state.notice = null;
            }
          },
        },
        'Tiếp tục phiên này',
      ),
      (!state.consent || !target) && h('p', { class: 'muted small' }, 'Cần tích đồng ý ở trên và mở (chọn) đúng cuộc trò chuyện.'),
    ),
  );
}

// ---------- Khối 2 & 3: Phiên đang chạy (Peeking Cat + SafeChat AI LIVE + Risk Dashboard) ----------
function sessionHeader(s: Session): Node {
  const label =
    s.status === 'tracking'
      ? s.waiting
        ? 'Đang chờ mở lại khung chat'
        : 'Đang theo dõi tin nhắn...'
      : s.pauseReason === 'tab_closed'
        ? 'Tạm dừng — tab đã đóng'
        : s.pauseReason === 'thread_changed'
          ? 'Tạm dừng — đã chuyển chat'
          : s.pauseReason === 'page_unsupported'
            ? 'Tạm dừng — rời trang chat'
            : 'Tạm dừng';
  return h(
    'div',
    { class: 'live-stage-wrapper' },
    // Khối 2: Chú mèo lấp ló ở viền trên + Viên thuốc trạng thái
    h(
      'div',
      { class: 'peeking-bar' },
      peekingCatSvg(),
      h('div', { class: 'tracking-pill' }, h('span', { class: `dot ${s.status}` }), label),
    ),
    // Khối 3: Bảng SafeChat AI LIVE
    h(
      'section',
      { class: 'live-widget' },
      h(
        'div',
        { class: 'live-header' },
        h(
          'div',
          { class: 'live-brand' },
          h('span', { 'aria-hidden': 'true' }, '🛡️'),
          h('span', {}, 'SafeChat AI'),
          h('span', { class: `live-badge${s.status !== 'tracking' ? ' paused' : ''}` }, s.status === 'tracking' ? 'LIVE' : 'PAUSED'),
        ),
        h(
          'div',
          { class: 'row' },
          s.status === 'tracking'
            ? h('button', { class: 'small', title: 'Tạm dừng theo dõi', onclick: () => void send({ kind: 'pause' }) }, '— Tạm dừng')
            : h(
              'button',
              {
                class: 'small primary',
                onclick: async () => {
                  const r = await send({ kind: 'resume' });
                  if (!r.ok) setNotice('err', r.reason ?? 'Không tiếp tục được.');
                },
              },
              '▶ Tiếp tục',
            ),
          h('button', { class: 'danger small', title: 'Dừng và xóa phiên', onclick: () => void stopAndClear() }, '✕ Dừng & xóa'),
        ),
      ),
      h(
        'div',
        { class: 'session-meta' },
        h('div', {}, h('b', {}, s.threadLabel), s.platform === 'mock' && h('span', { class: 'tag' }, 'Giả lập')),
        h('span', {}, `${s.transcript.messages.length}/${s.maxMessages} tin · ${duration(s.startedAt)}`),
      ),
      s.resumedFrom &&
      h('div', { class: 'muted small', style: 'margin-top:4px' }, `Tiếp tục từ bản nháp lưu lúc ${new Date(s.resumedFrom.savedAt).toLocaleString('vi-VN')}`),
      s.status === 'tracking' &&
      s.waiting &&
      h(
        'div',
        { class: 'banner small', style: 'margin-top:8px' },
        `Khung chat với "${s.threadLabel}" đang đóng. Phiên và bản nháp vẫn được giữ; mở lại đúng khung chat này để đọc tiếp. Không đọc các cuộc trò chuyện khác. Tin đến lúc khung đóng có thể bị bỏ sót.`,
      ),
      s.status === 'tracking' &&
      s.readerError &&
      h('div', { class: 'banner small err', style: 'margin-top:8px' }, `Bộ đọc tạm ngừng: ${s.readerError}`),
      s.pendingThread &&
      h(
        'div',
        { class: 'banner', style: 'margin-top:8px' },
        h('div', {}, `Bạn đã chuyển sang cuộc trò chuyện khác (${s.pendingThread.threadLabel || 'không rõ tên'}). Dữ liệu hai cuộc trò chuyện không được trộn lẫn.`),
        h(
          'div',
          { class: 'row', style: 'margin-top:6px' },
          h(
            'button',
            {
              onclick: async () => {
                if (!confirm('Xóa phiên hiện tại và bắt đầu theo dõi cuộc trò chuyện mới?')) return;
                const r = await send({ kind: 'switch_to_pending' });
                if (!r.ok) setNotice('err', r.reason ?? 'Không đổi được cuộc trò chuyện.');
              },
            },
            'Xóa phiên này & theo dõi chat mới',
          ),
        ),
        h('div', { class: 'muted small' }, 'Hoặc quay lại cuộc trò chuyện cũ rồi bấm "Tiếp tục".'),
      ),
      // Gắn trực tiếp Cụm Đo lường Rủi ro Kép (Vòng cung % + 4 Thanh phân cấp) vào trong bảng LIVE
      riskCard(s),
    ),
  );
}

function riskCard(s: Session): Node {
  const r = s.result;
  if (!r) return h('div', { class: 'reason-box' }, 'Chưa có kết quả.');
  const latest = [...r.signals].sort(
    (a, b) => Math.max(...b.evidence_message_ids.map(seqOf)) - Math.max(...a.evidence_message_ids.map(seqOf)),
  )[0];
  return h(
    'div',
    { class: `risk ${r.risk_level}`, style: 'border-left:0;margin-top:4px' },
    // Cụm 2 cột chuẩn theo thiết kế: Trái (Đồng hồ vòng cung %) - Phải (4 Thanh mức độ Rất cao / Cao / Trung bình / Thấp)
    h('div', { class: 'risk-dashboard' }, updateGaugeNode(r.score, r.risk_level), updateTiersNode(r)),
    // Hộp giải thích ngắn gọn bên dưới
    h(
      'div',
      { class: `reason-box${s.ai.status === 'running' ? ' ai-shimmer' : ''}` },
      h(
        'div',
        { class: 'row', style: 'justify-content:space-between' },
        h('span', { class: 'level' }, `Mức cảnh báo: ${RISK_LEVEL_LABEL[r.risk_level]}`),
        h('span', { class: 'muted small' }, `Điểm dấu hiệu ${r.score}/100`),
      ),
      h('div', { class: `meter`, style: `color:var(--${r.risk_level})` }, h('span', { style: `width:${r.score}%` })),
      r.stability_note && h('div', { class: 'hold small', role: 'status' }, r.stability_note),
      r.raw_level &&
      r.raw_level !== r.risk_level &&
      h('div', { class: 'muted small' }, `Mức tính theo tin mới nhất: ${RISK_LEVEL_LABEL[r.raw_level]}`),
      s.stability &&
      RISK_LEVEL_ORDER[s.stability.maxLevel] > RISK_LEVEL_ORDER[r.risk_level] &&
      h('div', { class: 'small' }, h('b', {}, 'Mức cao nhất trong phiên: '), RISK_LEVEL_LABEL[s.stability.maxLevel]),
      h('div', { class: 'small', style: 'margin-top:4px' }, h('span', { class: 'muted' }, 'Vì sao: '), r.level_reason),
      latest && h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Tín hiệu mới nhất: '), latest.title),
      h('div', { class: 'muted small', style: 'margin-top:3px' }, aiStatusText(s)),
    ),
  );
}

const PROVIDER_LABEL = { nano: 'Gemini Nano trên máy', gateway: 'Máy chủ SafeChat' } as const;

function aiStatusText(s: Session): string {
  const ai = s.ai;
  const via = ai.lastProvider
    ? `${PROVIDER_LABEL[ai.lastProvider]}${ai.lastProvider === 'gateway' && ai.lastModel ? ` (${ai.lastModel})` : ''}`
    : '';
  switch (ai.status) {
    case 'off':
      return 'Phân tích bằng bộ quy tắc trên máy (AI đang tắt).';
    case 'idle':
      return 'Quy tắc trên máy; AI sẽ chạy khi có tín hiệu mới hoặc đủ số tin mới.';
    case 'running':
      return `Đang phân tích AI${ai.pending ? ' trên máy' : ''}…`;
    case 'ok':
      return `Quy tắc + AI (${via}), ${ai.calls} lượt trong phiên.${ai.error ? ` ${ai.error}.` : ''}`;
    case 'error':
      return `Chưa phân tích được bằng AI: ${ai.error ?? 'lỗi'}. Kết quả quy tắc vẫn giữ nguyên.`;
  }
}

function aiDisclosure(): string {
  const st = state.settings;
  const parts: string[] = [];
  if (st.nanoEnabled) parts.push('AI trên máy (Gemini Nano) — dữ liệu không rời máy');
  if (st.gatewayEnabled && st.gatewayUrl)
    parts.push('Máy chủ SafeChat — chỉ gửi tin mới kèm vài tin ngữ cảnh và bản tóm tắt, đã che số điện thoại, số tài khoản, email');
  return parts.length
    ? `Phân tích AI đang BẬT: ${parts.join('; ')}.`
    : 'Phân tích chạy hoàn toàn trên máy bằng bộ quy tắc. AI đang tắt.';
}

// ---------- tab Phân tích chi tiết ----------
function analysisView(s: Session): Node {
  const r = s.result;
  if (!r) return h('section', { class: 'card' }, 'Chưa có kết quả.');
  const counts = Object.entries(r.category_counts) as [SignalCategory, number][];
  const maxCount = Math.max(1, ...counts.map(([, n]) => n));
  const ai = s.ai;
  const reached = new Map(r.stages_reached.map((x) => [x.stage, x.first_message_id]));
  return h(
    'div',
    {},
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Tiến trình kịch bản'),
      h(
        'ol',
        { class: 'stages' },
        ...STAGES.map((st) =>
          h(
            'li',
            { class: `stage${reached.has(st) ? ' on' : ''}${r.stage === st ? ' current' : ''}` },
            h('b', {}, st),
            ` ${STAGE_LABEL[st]}`,
            reached.has(st) && h('span', { class: 'muted small' }, ` · từ ${reached.get(st)}`),
          ),
        ),
      ),
      h(
        'p',
        { class: 'muted small' },
        'Suy ra từ các tín hiệu đã phát hiện, dựa theo các giai đoạn thường gặp của kịch bản lừa đảo. Đi qua nhiều giai đoạn được cộng tối đa 15 điểm.',
      ),
      ai.detectedStage && h('p', { class: 'small' }, `AI đánh giá giai đoạn: ${ai.detectedStage}`),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Cách tính điểm'),
      h('p', { class: 'small' }, r.level_reason),
      r.score_breakdown.length === 0
        ? h('p', { class: 'muted small' }, 'Chưa có tín hiệu.')
        : h(
          'table',
          { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Tín hiệu'), h('th', {}, 'Mức'), h('th', { class: 'num' }, 'Điểm'))),
          h(
            'tbody',
            {},
            ...r.score_breakdown.map((b) =>
              h(
                'tr',
                {},
                h('td', {}, b.title),
                h('td', {}, SEVERITY_LABEL[b.severity]),
                h('td', { class: 'num' }, `${b.base_points}${b.weight < 1 ? ' × 25%' : ''} = ${b.contribution}`),
              ),
            ),
          ),
        ),
      h(
        'p',
        { class: 'muted small' },
        'Quy ước: Thấp 10 · Trung bình 25 · Cao 60 · Nghiêm trọng 100. Tín hiệu nguy hiểm trực tiếp đưa thẳng lên mức Nghiêm trọng. Điểm tối đa 99 nếu không có tín hiệu nghiêm trọng.',
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Theo nhóm dấu hiệu'),
      counts.length === 0
        ? h('p', { class: 'muted small' }, 'Chưa có.')
        : h(
          'div',
          { class: 'bars' },
          ...counts.map(([c, n]) =>
            h(
              'div',
              { class: 'bar' },
              h('span', { class: 'bar-label' }, CATEGORY_LABEL[c]),
              h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: `width:${(n / maxCount) * 100}%` })),
              h('span', { class: 'bar-num' }, String(n)),
            ),
          ),
        ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Diễn biến theo thời gian'),
      s.timeline.length === 0
        ? h('p', { class: 'muted small' }, 'Chưa có thay đổi.')
        : h(
          'ol',
          { class: 'timeline' },
          ...[...s.timeline].reverse().map((t) =>
            h(
              'li',
              { class: `tl ${t.level}` },
              h('div', {}, h('b', {}, `${RISK_LEVEL_LABEL[t.level]} · ${t.score}`), h('span', { class: 'muted small' }, ` sau ${t.messageId}`)),
              t.newSignals.length > 0 && h('div', { class: 'small' }, `+ ${t.newSignals.join(', ')}`),
              t.note && h('div', { class: 'muted small' }, t.note),
            ),
          ),
        ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Phân tích AI'),
      h('p', { class: 'small' }, aiStatusText(s)),
      ai.status !== 'off' &&
      h(
        'ul',
        { class: 'small' },
        h('li', {}, `Lượt gọi trong phiên: ${ai.calls}`),
        h('li', {}, `Lượt AI qua máy chủ hôm nay: ${state.usageToday}/${state.settings.dailyBudget}`),
        ai.lastReason && h('li', {}, `Lần gọi gần nhất vì: ${ai.lastReason}`),
        h('li', {}, `Đã phân tích đến: ${ai.lastSeq ? `msg-${String(ai.lastSeq).padStart(3, '0')}` : 'chưa'}`),
      ),
      ai.summary && h('div', {}, h('div', { class: 'muted small' }, 'Tóm tắt do AI viết (đã che dữ liệu cá nhân):'), h('blockquote', {}, ai.summary)),
    ),
  );
}

function seqOf(id: string): number {
  return Number(id.replace(/\D/g, '')) || 0;
}

function safetyCard(s: Session): Node | null {
  const a = s.result?.advice;
  if (!s.result?.safety_priority || !a) return null;
  return h(
    'section',
    { class: 'card safety', role: 'alert' },
    h('h2', {}, '🚨 Ưu tiên an toàn của bạn'),
    h('p', {}, a.safety_message ?? ''),
    h('ul', {}, ...(a.support_resources ?? []).map((x) => h('li', {}, x))),
    h('p', { class: 'muted small' }, 'Ở mức này SafeChat AI không gợi ý câu hỏi thăm dò để tránh bạn tiếp tục tương tác nguy hiểm.'),
  );
}

function saveSnapshotFile(s: Session) {
  if (
    !confirm(
      `File sẽ chứa toàn bộ ${s.transcript.messages.length} tin trong bản nháp và được lưu vào máy bạn. Hãy giữ file ở nơi an toàn; SafeChat AI không giữ bản sao. Tiếp tục?`,
    )
  )
    return;
  const snap = createSnapshot({
    threadLabel: s.threadLabel,
    platform: s.platform,
    startedAt: s.resumedFrom?.startedAt ?? s.startedAt,
    maxMessages: s.maxMessages,
    transcript: s.transcript,
    ai: {
      summary: s.ai.summary,
      signals: s.ai.signals,
      uncertainties: s.ai.uncertainties,
      lastSeq: s.ai.lastSeq,
      calls: s.ai.calls,
      downgrade: s.ai.downgrade,
    },
    marks: s.marks,
    timeline: s.timeline,
    stability: s.stability,
  });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  download(`safechat-phien-${stamp}.json`, 'application/json', serializeSnapshot(snap));
}

// ---------- Khối 4 & 5: Hộp Gợi ý làm rõ ý định (Blue Card) + Hộp Giới hạn quét & Tải ngay (Amber Card) ----------
function adviceCard(s: Session): Node | null {
  const a = s.result?.advice;
  if (!a) return null;
  const msgPct = Math.min(100, Math.round((s.transcript.messages.length / Math.max(1, s.maxMessages)) * 100));
  const aiPct = state.settings.gatewayEnabled ? Math.min(100, Math.round((state.usageToday / Math.max(1, state.settings.dailyBudget)) * 100)) : 0;
  const usagePct = Math.max(msgPct, aiPct);
  const nearLimit = usagePct >= 80;

  return h(
    'div',
    { style: 'display:flex;flex-direction:column;gap:10px' },
    // Khối 4: Hộp Gợi ý để làm rõ ý định (màu xanh pastel như ảnh thiết kế)
    h(
      'section',
      { class: 'advice-hero-card' },
      h(
        'div',
        {
          class: 'advice-hero-header',
          onclick: () => {
            state.adviceExpanded = !state.adviceExpanded;
            render();
          },
        },
        h('div', { class: 'advice-hero-title' }, h('span', { class: 'advice-bulb' }, '💡'), h('span', {}, 'Gợi ý để làm rõ ý định')),
        h('span', { class: `chevron${state.adviceExpanded ? ' open' : ''}` }, '›'),
      ),
      h(
        'ul',
        { class: 'small', style: 'margin-top:8px' },
        ...a.actions.slice(0, state.adviceExpanded ? 6 : 2).map((x) => h('li', {}, x)),
      ),
      state.adviceExpanded &&
      a.questions.length > 0 &&
      h(
        'div',
        { style: 'margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)' },
        h('div', { class: 'small', style: 'font-weight:700;margin-bottom:4px' }, 'Câu hỏi bạn có thể tự gửi:'),
        h('p', { class: 'muted small', style: 'margin:0 0 6px' }, 'SafeChat AI không tự gửi tin. Hãy sao chép và tự quyết định có gửi hay không.'),
        ...a.questions.map((q) =>
          h(
            'div',
            { class: 'q' },
            h('span', { class: 'small' }, q),
            h(
              'button',
              {
                class: 'link',
                onclick: async () => {
                  await navigator.clipboard.writeText(q);
                  setNotice('ok', 'Đã sao chép câu hỏi.');
                },
              },
              'Sao chép',
            ),
          ),
        ),
      ),
    ),
    // Khối 5: Hộp Giới hạn quét & Nút Tải ngay (màu vàng cam như ảnh thiết kế)
    h(
      'section',
      { class: 'quota-card' },
      h(
        'div',
        { class: 'quota-left' },
        h('span', { class: 'quota-icon', 'aria-hidden': 'true' }, '🕒'),
        h(
          'div',
          {},
          h(
            'div',
            { class: 'quota-title' },
            nearLimit ? `Gần đến giới hạn quét (${usagePct}%)` : `Bộ nhớ phiên (${s.transcript.messages.length}/${s.maxMessages} tin · ${usagePct}%)`,
          ),
          h(
            'div',
            { class: 'quota-desc' },
            nearLimit
              ? 'Vui lòng tải bản lưu thông tin và khởi động lại để tiếp tục sử dụng.'
              : 'Tải bản lưu phiên (.json) bất cứ lúc nào để bảo toàn bằng chứng và khôi phục về sau.',
          ),
        ),
      ),
      h(
        'button',
        {
          class: 'cta-orange',
          onclick: () => saveSnapshotFile(s),
        },
        '⬇ Tải ngay',
      ),
    ),
    (s.result?.uncertainties.length ?? 0) > 0 &&
    h('section', { class: 'card' }, h('h2', {}, 'Chưa đủ thông tin'), h('ul', {}, ...s.result!.uncertainties.map((u) => h('li', {}, u)))),
  );
}

const MARKS: [UserMark, string][] = [
  ['verified', 'Đã xác minh'],
  ['not_relevant', 'Không liên quan'],
  ['review', 'Cần xem lại'],
];

function signalCard(s: Session, sig: Signal): Node {
  const key = signalKey(sig);
  const mark = s.marks[key];
  return h(
    'article',
    { class: `sig ${sig.severity}${mark === 'not_relevant' ? ' dim' : ''}` },
    h(
      'h3',
      {},
      sig.title,
      h('span', { class: 'tag' }, sig.source === 'ai' ? 'AI' : sig.source === 'ledger' ? 'Đối chiếu' : 'Quy tắc'),
      sig.ref && h('span', { class: 'tag' }, sig.ref),
      sig.confidence !== undefined && h('span', { class: 'tag' }, `độ chắc ${Math.round(sig.confidence * 100)}%`),
      sig.mitigation && h('span', { class: 'tag ok' }, 'Đã hạ mức theo ngữ cảnh'),
    ),
    h('div', { class: 'small' }, sig.explanation),
    ...sig.evidence_message_ids.map((id, i) =>
      h(
        'blockquote',
        {},
        h('span', { class: 'mid' }, sig.type === 'possible_contradiction' ? (i === 0 ? `Trước (${id})` : `Sau (${id})`) : id),
        sig.evidence_quotes[i] ?? '',
      ),
    ),
    h('div', { class: 'small' }, h('b', {}, 'Nên làm: '), sig.recommended_action),
    h(
      'div',
      { class: 'marks' },
      ...MARKS.map(([m, label]) =>
        h(
          'button',
          {
            'aria-pressed': mark === m ? 'true' : 'false',
            onclick: () => void send({ kind: 'mark', key, mark: mark === m ? null : m }),
          },
          label,
        ),
      ),
    ),
  );
}

function evidenceView(s: Session): Node {
  const sigs = s.result?.signals ?? [];
  const ledger = s.result?.claims ?? [];
  return h(
    'div',
    {},
    h(
      'section',
      { class: 'card' },
      h('h2', {}, `Tín hiệu và bằng chứng (${sigs.length})`),
      h('p', { class: 'muted small' }, 'Đánh dấu chỉ để bạn ghi chú khi xem lại và đưa vào báo cáo; không làm thay đổi điểm.'),
      sigs.length === 0 ? h('p', {}, 'Chưa thấy dấu hiệu rõ trong phần đã đọc.') : null,
      ...sigs.map((x) => signalCard(s, x)),
    ),
    ledger.length > 0 &&
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Sổ đối chiếu phát biểu'),
      h(
        'ul',
        {},
        ...ledger.map((c) =>
          h(
            'li',
            {},
            `${c.claim_text} — ${c.source_message_id} `,
            h(
              'span',
              { class: 'tag' },
              { unverified: 'chưa xác minh', consistent: 'nhất quán', possible_contradiction: 'chưa nhất quán', explained: 'đã đính chính' }[c.status],
            ),
          ),
        ),
      ),
    ),
  );
}

function draftView(s: Session): Node {
  const flagged = new Set(s.result?.signals.flatMap((x) => x.evidence_message_ids) ?? []);
  const who = { self: 'Bạn', other: 'Đối phương', unknown: 'Chưa rõ người gửi' } as const;
  const doExport = (fmt: 'html' | 'json', scope: ExportScope) => {
    const what = scope === 'full' ? `toàn bộ ${s.transcript.messages.length} tin trong bản nháp` : 'chỉ cảnh báo và tin nhắn làm bằng chứng';
    if (!confirm(`File sẽ chứa ${what} cùng kết quả phân tích, và được lưu vào máy bạn. SafeChat AI không giữ bản sao file này. Tiếp tục?`)) return;
    const input = {
      threadLabel: s.threadLabel,
      startedAt: s.startedAt,
      exportedAt: Date.now(),
      messages: s.transcript.messages,
      result: s.result,
      marks: s.marks,
      scope,
      aiUsed: s.ai.calls > 0,
    };
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    if (fmt === 'html') download(`safechat-bao-cao-${stamp}.html`, 'text/html', exportHtml(input));
    else download(`safechat-bao-cao-${stamp}.json`, 'application/json', exportJson(input));
  };
  return h(
    'div',
    {},
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Xuất báo cáo'),
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => doExport('html', 'full') }, 'HTML — toàn bộ'),
        h('button', { onclick: () => doExport('html', 'alerts_only') }, 'HTML — chỉ cảnh báo'),
        h('button', { onclick: () => doExport('json', 'full') }, 'JSON'),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Lưu phiên để tiếp tục'),
      h(
        'p',
        { class: 'muted small' },
        'Lưu toàn bộ bản nháp, bằng chứng, tóm tắt AI và trạng thái cảnh báo vào một file trên máy bạn. Khi mở lại trình duyệt, dùng "Tiếp tục từ bản nháp" ở màn hình bắt đầu.',
      ),
      h(
        'button',
        {
          onclick: () => saveSnapshotFile(s),
        },
        'Lưu phiên (.json)',
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, `Bản nháp tạm (${s.transcript.messages.length} tin)`),
      s.transcript.messages.length === 0 ? h('p', { class: 'muted' }, 'Chưa có tin nhắn nào được ghi nhận.') : null,
      ...s.transcript.messages.map((m) =>
        h(
          'div',
          { class: `msg ${m.sender}${flagged.has(m.id) ? ' flag' : ''}` },
          h('div', { class: 'who' }, `${m.id} · ${who[m.sender]}`),
          m.text,
        ),
      ),
    ),
  );
}

function settingsCard(): Node {
  const st = state.settings;
  const save = async (next: Settings) => {
    state.settings = next;
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    if (state.session) await send({ kind: 'reanalyze' });
    render();
  };
  return h(
    'section',
    { class: 'card', id: 'settings-section' },
    h('h2', {}, 'Cài đặt'),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'max' }, 'Số tin tối đa giữ trong bản nháp (áp dụng cho phiên mới)'),
      h('input', {
        id: 'max',
        type: 'number',
        min: '20',
        max: '300',
        value: String(st.maxMessages),
        onchange: (e: Event) => {
          const v = Math.max(20, Math.min(300, Number((e.target as HTMLInputElement).value) || 300));
          void save({ ...st, maxMessages: v });
        },
      }),
    ),
    // ----- Tầng 1: AI trên máy -----
    h('h3', { style: 'margin-top:12px' }, '1. AI trên máy — Gemini Nano (ưu tiên)'),
    h(
      'p',
      { class: 'muted small' },
      'Chạy ngay trong Chrome, dữ liệu không rời máy, không tốn phí hay hạn mức. Cần Chrome máy tính (Windows/macOS/Linux), khoảng 22 GB trống và GPU trên 4 GB hoặc 16 GB RAM. Chỉ chạy khi side panel đang mở. Tiếng Việt chưa được hỗ trợ chính thức nên đây là chế độ thử nghiệm.',
    ),
    nanoControls(st, save),
    // ----- Tầng 2: Máy chủ SafeChat -----
    h('h3', { style: 'margin-top:12px' }, '2. Máy chủ SafeChat — dự phòng / khi đóng side panel'),
    h(
      'p',
      { class: 'muted small' },
      'Không cần khóa API. Chỉ gửi tin MỚI kèm vài tin ngữ cảnh và bản tóm tắt do AI viết, đã che số điện thoại, số tài khoản, email, tới máy chủ SafeChat. Máy chủ giữ khóa mô hình, extension không giữ. \"Dừng và xóa\" xóa dữ liệu phiên trên máy này nhưng không thu hồi được dữ liệu đã gửi tới máy chủ. Bạn có thể tắt bất cứ lúc nào.',
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'gw' }, 'Địa chỉ máy chủ SafeChat (HTTPS)'),
      h('input', {
        id: 'gw',
        type: 'url',
        placeholder: 'https://…',
        value: st.gatewayUrl,
        autocomplete: 'off',
        onchange: (e: Event) => void save({ ...st, gatewayUrl: (e.target as HTMLInputElement).value.trim() }),
      }),
    ),
    h(
      'div',
      { class: 'row' },
      st.gatewayEnabled
        ? h('button', { onclick: () => void save({ ...st, gatewayEnabled: false }) }, 'Tắt máy chủ SafeChat')
        : h(
          'button',
          {
            disabled: !st.gatewayUrl,
            onclick: async () => {
              const url = normalizeGatewayUrl(st.gatewayUrl);
              if (!url) return setNotice('err', 'Địa chỉ máy chủ không hợp lệ (cần dạng https://…).');
              if (!confirm('Bật máy chủ SafeChat: tin nhắn mới (đã che dữ liệu cá nhân) và bản tóm tắt sẽ được gửi tới máy chủ SafeChat. Bạn đồng ý?')) return;
              const granted = await chrome.permissions.request({ origins: [gatewayOriginPattern(url)] });
              if (!granted) return setNotice('err', 'Chưa được cấp quyền truy cập máy chủ SafeChat.');
              await save({ ...st, gatewayUrl: url, gatewayEnabled: true });
            },
          },
          'Bật máy chủ SafeChat',
        ),
      h('span', { class: st.gatewayEnabled ? 'ok small' : 'muted small' }, st.gatewayEnabled ? 'Đang bật' : 'Đang tắt'),
    ),
    // ----- Tiết kiệm lượt gọi -----
    h('h3', { style: 'margin-top:12px' }, 'Tiết kiệm lượt gọi AI'),
    h(
      'div',
      { class: 'grid3' },
      numField('budget', 'Lượt AI/ngày', st.dailyBudget, 10, 5000, (v) => save({ ...st, dailyBudget: v })),
      numField('batch', 'Gọi khi đủ N tin mới', st.batchSize, 1, 50, (v) => save({ ...st, batchSize: v })),
      numField('gap', 'Cách nhau tối thiểu (giây)', st.minIntervalSec, 3, 600, (v) => save({ ...st, minIntervalSec: v })),
    ),
    h('p', { class: 'muted small' }, `Đã dùng hôm nay: ${state.usageToday}/${st.dailyBudget} lượt qua máy chủ SafeChat. AI cũng chạy ngay khi mức cảnh báo tăng hoặc có loại tín hiệu mới.`),
  );
}

function numField(id: string, label: string, value: number, min: number, max: number, onSave: (v: number) => void): Node {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    h('input', {
      id,
      type: 'number',
      min: String(min),
      max: String(max),
      value: String(value),
      onchange: (e: Event) => onSave(Math.max(min, Math.min(max, Number((e.target as HTMLInputElement).value) || value))),
    }),
  );
}

function nanoControls(st: Settings, save: (s: Settings) => Promise<void>): Node {
  const n = state.nano;
  if (!n) return h('p', { class: 'muted small' }, 'Đang kiểm tra khả năng của trình duyệt…');
  if (!n.supported || !n.lang)
    return h('p', { class: 'small err' }, 'Trình duyệt/máy này chưa hỗ trợ Prompt API (Gemini Nano). Có thể dùng máy chủ SafeChat thay thế.');
  const label: Record<string, string> = {
    available: 'Mô hình đã sẵn sàng',
    downloadable: 'Cần tải mô hình (một lần, vài GB)',
    downloading: 'Đang tải mô hình…',
    unavailable: 'Không khả dụng',
  };
  return h(
    'div',
    {},
    h(
      'p',
      { class: 'small' },
      `${label[n.availability]}${n.experimental ? ' · chạy chế độ thử nghiệm (vi chưa hỗ trợ, dùng en)' : ''}`,
      state.nanoProgress !== null && ` · ${Math.round(state.nanoProgress * 100)}%`,
    ),
    h(
      'div',
      { class: 'row' },
      st.nanoEnabled
        ? h('button', { onclick: () => void save({ ...st, nanoEnabled: false }).then(heartbeat) }, 'Tắt AI trên máy')
        : h(
          'button',
          {
            onclick: async () => {
              try {
                if (n.availability !== 'available') {
                  state.nanoProgress = 0;
                  render();
                  await downloadNano(n.lang!, (p) => {
                    state.nanoProgress = p;
                    render();
                  });
                  state.nanoProgress = null;
                  state.nano = await nanoStatus();
                }
                await save({ ...st, nanoEnabled: true });
                await heartbeat();
              } catch (e) {
                state.nanoProgress = null;
                setNotice('err', `Không bật được AI trên máy: ${(e as Error).message}`);
              }
            },
          },
          n.availability === 'available' ? 'Bật AI trên máy' : 'Tải mô hình & bật',
        ),
      h('span', { class: st.nanoEnabled ? 'ok small' : 'muted small' }, st.nanoEnabled ? 'Đang bật' : 'Đang tắt'),
    ),
  );
}

// ---------- chạy Gemini Nano khi background yêu cầu ----------
let nanoBusy: string | null = null;

async function heartbeat() {
  const ready = state.settings.nanoEnabled && state.nano?.availability === 'available' && !!state.nano.lang;
  await send({ kind: 'panel_status', nanoReady: ready }).catch(() => { });
}

async function servePendingNano(s: Session | null) {
  const p = s?.ai.pending;
  if (!p || nanoBusy === p.id || !state.nano?.lang) return;
  nanoBusy = p.id;
  try {
    const content = await runNano(p.request, state.nano.lang);
    await send({ kind: 'ai_result', id: p.id, ok: true, content });
  } catch (e) {
    await send({ kind: 'ai_result', id: p.id, ok: false, error: (e as Error).message || 'lỗi không rõ' });
  } finally {
    nanoBusy = null;
  }
}

async function refreshUsage() {
  const r = (await chrome.storage.local.get(USAGE_KEY))[USAGE_KEY] as { date: string; count: number } | undefined;
  state.usageToday = r && r.date === new Date().toISOString().slice(0, 10) ? r.count : 0;
}

async function stopAndClear() {
  if (
    !confirm(
      'Dừng theo dõi và xóa: bản nháp tin nhắn, kết quả phân tích, đánh dấu của bạn và trạng thái phiên do extension quản lý. File bạn đã tải về không bị ảnh hưởng. Tiếp tục?',
    )
  )
    return;
  const r = await send<StopResult>({ kind: 'stop_and_clear' });
  state.consent = false;
  state.view = 'overview';
  displayedScore = 0;
  gaugeDomCache = null;
  tiersDomCache = null;
  if (r.ok)
    setNotice(
      'ok',
      'Phiên đã dừng và dữ liệu phiên do extension quản lý đã được xóa. File bạn đã tải về vẫn nằm trên thiết bị và do bạn tự quản lý. Dữ liệu đã gửi đến dịch vụ bên ngoài (nếu có) chịu chính sách của dịch vụ đó.',
    );
  else setNotice('err', `Chưa xóa được hoàn toàn (còn: ${r.remainingKeys.join(', ')}). Hãy thử lại.`);
}

// ---------- render ----------
function render() {
  const app = document.getElementById('app')!;
  const s = state.session;
  const nodes: Child[] = [];
  if (state.notice) nodes.push(h('div', { class: `card ${state.notice.kind}`, role: 'status' }, state.notice.text));

  if (!s) {
    gaugeDomCache = null;
    tiersDomCache = null;
    nodes.push(introView());
  } else {
    nodes.push(sessionHeader(s), safetyCard(s));
    const tabs: [View, string][] = [
      ['overview', 'Gợi ý'],
      ['analysis', 'Phân tích'],
      ['evidence', `Bằng chứng (${s.result?.signals.length ?? 0})`],
      ['draft', 'Bản nháp'],
      ['settings', 'Cài đặt'],
    ];
    nodes.push(
      h(
        'nav',
        { class: 'tabs', role: 'tablist' },
        ...tabs.map(([v, label]) =>
          h(
            'button',
            {
              role: 'tab',
              'aria-selected': state.view === v ? 'true' : 'false',
              onclick: () => {
                state.view = v;
                render();
              },
            },
            label,
          ),
        ),
      ),
    );
    nodes.push(
      state.view === 'overview'
        ? adviceCard(s)
        : state.view === 'analysis'
          ? analysisView(s)
          : state.view === 'evidence'
            ? evidenceView(s)
            : state.view === 'draft'
              ? draftView(s)
              : settingsCard(),
    );
  }
  app.replaceChildren(...nodes.filter((n): n is Node | string => !!n));
}

async function refreshProbe() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab?.id ?? null;
  state.probe = null;
  render();
  state.probe = state.tabId === null ? { supported: false, reason: 'Không có tab đang mở.' } : await send<ProbeResult>({ kind: 'probe', tabId: state.tabId });
  render();
}

async function init() {
  const [sess, sett] = await Promise.all([chrome.storage.session.get(SESSION_KEY), chrome.storage.local.get(SETTINGS_KEY)]);
  state.session = (sess[SESSION_KEY] as Session | undefined) ?? null;
  state.settings = { ...DEFAULT_SETTINGS, ...((sett[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {}) };
  for (const k of ['groqEnabled', 'groqApiKey', 'groqSmallModel', 'groqLargeModel']) delete (state.settings as unknown as Record<string, unknown>)[k];
  await refreshUsage();
  render();
  await refreshProbe();
  state.nano = await nanoStatus();
  render();
  await heartbeat();
  void servePendingNano(state.session);
  // Báo background định kỳ rằng side panel còn mở và Nano có sẵn sàng không
  setInterval(() => void heartbeat(), 20_000);
  chrome.storage.local.onChanged.addListener((changes) => {
    if (USAGE_KEY in changes) void refreshUsage().then(render);
  });

  chrome.storage.session.onChanged.addListener((changes) => {
    if (!(SESSION_KEY in changes)) return;
    state.session = (changes[SESSION_KEY]?.newValue as Session | undefined) ?? null;
    void servePendingNano(state.session);
    // Không render lại khi người dùng đang gõ trong ô nhập (tránh mất nội dung đang gõ)
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type !== 'checkbox') {
      active.addEventListener('blur', () => render(), { once: true });
      return;
    }
    render();
  });
  chrome.tabs.onActivated.addListener(() => void (!state.session && refreshProbe()));
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.status === 'complete' && !state.session) void refreshProbe();
  });
  // cập nhật thời lượng phiên
  setInterval(() => state.session && render(), 60_000);
}

void init();