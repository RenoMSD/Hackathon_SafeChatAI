// Floating Widget nổi trên trang (Shadow DOM cô lập hoàn toàn, không dùng innerHTML, không can thiệp DOM của Messenger).
// Hỗ trợ:
// 1. Khi mới mở Facebook: hiển thị ở góc trên bên phải màn hình (không che vùng chat ở góc dưới phải).
// 2. Kéo thả tự do đến bất kỳ đâu trên màn hình (PointerEvents + giới hạn trong khung nhìn).
// 3. Khi thu gọn hoặc khóa đoạn chat: biến thành Chú Mèo Đen Pixel Art cầm Khiên Pixel bám ngay trên mép đỉnh khung chat
//    với hiệu ứng chuyển động mượt mà và bong bóng gợi ý hiển thị ngay trên đầu mèo.
// 4. Khi bấm vào mèo hoặc "Chi tiết": mở bảng Chi tiết nằm ngay BÊN CẠNH khung chat (ưu tiên bên trái khung chat) để không che tin nhắn.
// 5. Loại bỏ hoàn toàn điểm số dao động (%/100), chỉ hiển thị 4 mức độ trực quan: Bình thường · Cần chú ý · Cao · Nguy hiểm.
import { createSnapshot, serializeSnapshot } from '@safechat/core/context-manager';
import { exportHtml } from '@safechat/core/export';
import {
  RISK_LEVEL_ORDER,
  STAGE_LABEL,
  type AnalysisResult,
  type RiskLevel,
  type ScamStage,
  type Severity,
  type Signal,
  type UserMark,
} from '@safechat/core/types';
import {
  probeThreads,
  SESSION_KEY,
  signalKey,
  type PanelRequest,
  type ProbeResult,
  type Session,
  type ThreadInfo,
} from '../shared/protocol';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STAGES: ScamStage[] = ['S0', 'S1', 'S2', 'S3', 'S4'];
const MARKS: [UserMark, string][] = [
  ['verified', 'Đã xác minh'],
  ['not_relevant', 'Không liên quan'],
  ['review', 'Cần xem lại'],
];

/** 4 mức độ hiển thị thống nhất toàn giao diện (không dùng điểm số dao động). */
const LEVEL_DISPLAY: Record<RiskLevel | Severity, string> = {
  low: 'Bình thường',
  attention: 'Cần chú ý',
  medium: 'Cần chú ý',
  high: 'Cao',
  critical: 'Nguy hiểm',
};

const LEVEL_SUBTITLE: Record<RiskLevel, string> = {
  low: 'Chưa phát hiện dấu hiệu bất thường',
  attention: 'Có chi tiết cần hỏi rõ để xác minh',
  high: 'Phát hiện dấu hiệu rủi ro đáng ngờ',
  critical: 'Cảnh báo nguy hiểm, tuyệt đối cảnh giác',
};

const SHIELD_PIXEL_PALETTE: Record<RiskLevel, { main: string; light: string; dark: string }> = {
  low: { main: '#16a34a', light: '#4ade80', dark: '#14532d' },
  attention: { main: '#2563eb', light: '#60a5fa', dark: '#1e3a8a' },
  high: { main: '#ea580c', light: '#fb923c', dark: '#7c2d12' },
  critical: { main: '#dc2626', light: '#f87171', dark: '#7f1d1d' },
};

type DetailTab = 'overview' | 'evaluate' | 'analysis';
type SessionViewMode = 'mini' | 'detail';

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

const WIDGET_CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483640;
  font: 13px/1.45 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: #161e2e;
}
* { box-sizing: border-box; }

/* Hiệu ứng chuyển động mượt mà cho chú mèo Pixel Art */
@keyframes cat-breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2.5px); }
}
@keyframes cat-blink {
  0%, 43%, 47%, 89%, 93%, 100% { transform: scaleY(1); }
  45%, 91% { transform: scaleY(0.12); }
}
@keyframes cat-ear-left {
  0%, 80%, 100% { transform: rotate(0deg); }
  84% { transform: rotate(-6deg); }
  88% { transform: rotate(2deg); }
}
@keyframes cat-ear-right {
  0%, 56%, 100% { transform: rotate(0deg); }
  60% { transform: rotate(6deg); }
  64% { transform: rotate(-2deg); }
}
@keyframes cat-tail-sway {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(9deg); }
}
@keyframes shield-glow {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-1.5px) scale(1.04); }
}
@keyframes pulse-dot {
  0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.55); }
  70% { box-shadow: 0 0 0 6px rgba(22, 163, 74, 0); }
  100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
}
@keyframes pop-in {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes spotlight-pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.2), 0 12px 32px rgba(37, 99, 235, 0.22); }
  50% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.32), 0 14px 36px rgba(37, 99, 235, 0.34); }
}

.pixel-cat-svg {
  overflow: visible;
  shape-rendering: crispEdges;
  image-rendering: pixelated;
  filter: drop-shadow(0 6px 12px rgba(15, 23, 42, 0.22));
}
.pixel-cat-body {
  animation: cat-breathe 2.8s ease-in-out infinite;
  transform-origin: 12px 13px;
}
.pixel-cat-eyes {
  animation: cat-blink 5.2s ease-in-out infinite;
  transform-origin: 11px 6px;
}
.pixel-ear-l {
  animation: cat-ear-left 4.6s ease-in-out infinite;
  transform-origin: 8px 4px;
}
.pixel-ear-r {
  animation: cat-ear-right 5.4s ease-in-out infinite;
  transform-origin: 16px 4px;
}
.pixel-cat-tail {
  animation: cat-tail-sway 2.4s ease-in-out infinite;
  transform-origin: 16px 13px;
}
.pixel-cat-tail.fast {
  animation-duration: 1.2s;
}
.pixel-cat-shield {
  animation: shield-glow 2.5s ease-in-out infinite;
  transform-origin: 4px 12px;
}

.spotlight-box {
  position: fixed;
  pointer-events: none;
  border: 2.5px solid #2563eb;
  border-radius: 14px;
  background: rgba(37, 99, 235, 0.04);
  animation: spotlight-pulse 1.6s ease-in-out infinite;
  transition: top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease, opacity 160ms ease;
  z-index: 2147483638;
  display: none;
}
.spotlight-tag {
  position: absolute;
  top: -28px;
  left: 8px;
  background: #1d4ed8;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 99px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(29, 78, 216, 0.35);
}

/* Vị trí mặc định khi mới mở Facebook: Góc trên bên phải màn hình */
.widget-pos {
  position: fixed;
  top: 62px;
  right: 18px;
  pointer-events: auto;
  z-index: 2147483640;
  touch-action: none;
  user-select: none;
}
.widget-pos.docked-transition {
  transition: left 180ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.drag-handle {
  cursor: grab;
}
.drag-handle:active {
  cursor: grabbing;
}

/* Chế độ Mèo Đen Pixel Cầm Khiên (khi thu gọn hoặc bám trên đỉnh khung chat) */
.cat-perch-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 328px;
  animation: pop-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.cat-perch-container.compact-orb {
  width: auto;
}

/* Bong bóng gợi ý trên đầu mèo */
.cat-bubble {
  position: relative;
  width: 100%;
  background: #ffffff;
  border: 2px solid #cbd5e1;
  border-radius: 16px;
  padding: 9px 11px;
  box-shadow: 0 14px 28px -6px rgba(15, 23, 42, 0.22), 0 4px 10px -2px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 6px;
}
.cat-bubble::after {
  content: '';
  position: absolute;
  bottom: -9px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 14px;
  height: 14px;
  background: inherit;
  border-right: 2px solid inherit;
  border-bottom: 2px solid inherit;
}
.cat-bubble.low { border-color: #86efac; background: #ffffff; }
.cat-bubble.low::after { border-color: #86efac; background: #ffffff; }
.cat-bubble.attention { border-color: #93c5fd; background: #ffffff; }
.cat-bubble.attention::after { border-color: #93c5fd; background: #ffffff; }
.cat-bubble.high { border-color: #fdba74; background: #fffaf5; }
.cat-bubble.high::after { border-color: #fdba74; background: #fffaf5; }
.cat-bubble.critical { border-color: #fca5a5; background: #fef2f2; }
.cat-bubble.critical::after { border-color: #fca5a5; background: #fef2f2; }

.bubble-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.bubble-thread-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.bubble-thread-name {
  font-weight: 800;
  font-size: 12px;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}
.level-pill {
  padding: 2.5px 9px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  letter-spacing: 0.01em;
  flex-shrink: 0;
}
.level-pill.low { background: #dcfce7; color: #15803d; }
.level-pill.attention { background: #dbeafe; color: #1d4ed8; }
.level-pill.high { background: #ffedd5; color: #c2410c; }
.level-pill.critical { background: #fee2e2; color: #b91c1c; }

.bubble-hint-box {
  font-size: 11.5px;
  color: #1e293b;
  line-height: 1.4;
  background: rgba(241, 245, 249, 0.75);
  border-radius: 10px;
  padding: 6px 9px;
  border-left: 3px solid #64748b;
}
.cat-bubble.low .bubble-hint-box { border-left-color: #16a34a; }
.cat-bubble.attention .bubble-hint-box { border-left-color: #2563eb; background: #eff6ff; }
.cat-bubble.high .bubble-hint-box { border-left-color: #ea580c; background: #ffedd5; }
.cat-bubble.critical .bubble-hint-box { border-left-color: #dc2626; background: #fee2e2; color: #7f1d1d; }

.bubble-question-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed rgba(148, 163, 184, 0.4);
  font-size: 11px;
  color: #0f172a;
}

.bubble-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding-top: 2px;
}
.bubble-actions-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Sân khấu chú mèo Pixel bám mép khung chat */
.cat-stage-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: transparent;
  border: 0;
  padding: 0 8px;
  cursor: grab;
  transition: transform 180ms ease;
}
.cat-stage-btn:hover {
  transform: translateY(-2px) scale(1.04);
}
.cat-stage-btn:active {
  cursor: grabbing;
}
.cat-shield-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 11.5px;
  font-weight: 800;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.18);
  border: 1.5px solid #ffffff;
}
.cat-shield-tag.low { background: #16a34a; color: #ffffff; }
.cat-shield-tag.attention { background: #2563eb; color: #ffffff; }
.cat-shield-tag.high { background: #ea580c; color: #ffffff; }
.cat-shield-tag.critical { background: #dc2626; color: #ffffff; }

/* Khung chính khi mở rộng */
.wrap {
  width: 348px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: pop-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Màn hình 1: Thẻ Mở lên & Quét dò Popup */
.launcher {
  background: #ffffff;
  border: 1px solid #dbeafe;
  border-radius: 18px;
  padding: 13px 14px;
  box-shadow: 0 18px 38px -8px rgba(29, 78, 216, 0.2), 0 4px 12px -2px rgba(22, 30, 46, 0.07);
}
.launcher-drag-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  margin-bottom: 10px;
  border-bottom: 1px dashed #e2e8f0;
  font-size: 11px;
  color: #64748b;
}
.launcher-hero {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.brand-title {
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
}
.sub { font-size: 11.5px; color: #475569; margin: 3px 0 0; line-height: 1.35; }

.btn-scan {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  border: 0;
  border-radius: 10px;
  padding: 9px 14px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 16px -3px rgba(37, 99, 235, 0.45);
  transition: transform 150ms ease, opacity 150ms ease;
}
.btn-scan:hover:not(:disabled) { transform: translateY(-1px); }
.btn-scan:disabled { opacity: 0.6; cursor: wait; }

.scan-results {
  margin-top: 10px;
  padding: 10px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.scan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  font-weight: 700;
  color: #334155;
}
.thread-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 165px;
  overflow-y: auto;
}
.thread-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.thread-card:hover {
  border-color: #60a5fa;
  background: #eff6ff;
}
.thread-card.selected {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}
.thread-name {
  font-weight: 700;
  font-size: 12.5px;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.thread-sub {
  font-size: 10.5px;
  color: #64748b;
}
.btn-lock {
  background: #2563eb;
  color: #ffffff;
  border: 0;
  border-radius: 8px;
  padding: 5px 10px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.btn-lock:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}
.consent-label {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  cursor: pointer;
  font-size: 11.5px;
  color: #475569;
  padding-top: 4px;
  border-top: 1px solid #e2e8f0;
}

.btn-detail {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 7px;
  padding: 4px 8px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 150ms ease;
}
.btn-detail:hover {
  background: #dbeafe;
}
.waiting-switch-box {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-top: 5px;
  border-top: 1px dashed #cbd5e1;
}

.text-btn {
  height: 24px;
  padding: 0 7px;
  border-radius: 6px;
  border: 1px solid #e1e7f0;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.text-btn:hover { background: #e2e8f0; color: #0f172a; }
.text-btn.pin-active { background: #dbeafe; color: #1d4ed8; border-color: #93c5fd; }

.dot { width: 7px; height: 7px; border-radius: 50%; background: #16a34a; animation: pulse-dot 2s infinite; flex-shrink: 0; }
.dot.paused { background: #d97706; animation: none; }

/* Màn hình 3: Bảng Chi Tiết & Đánh Giá (Expanded Detail Modal - 2 dòng header không bao giờ đè chữ) */
.live-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 18px;
  padding: 12px 13px;
  box-shadow: 0 20px 44px -10px rgba(15, 23, 42, 0.24), 0 4px 14px -2px rgba(15, 23, 42, 0.08);
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-height: 82vh;
  overflow-y: auto;
}
.live-head {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e1e7f0;
}
.live-head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.live-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  font-size: 14px;
  min-width: 0;
  flex: 1;
}
.live-thread-name {
  font-weight: 600;
  font-size: 12px;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 145px;
}
.win-btns {
  display: flex;
  gap: 5px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* Thanh Tab trong bảng chi tiết */
.detail-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  background: #f1f5f9;
  padding: 3.5px;
  border-radius: 10px;
}
.tab-btn {
  border: 0;
  background: transparent;
  color: #475569;
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  padding: 5.5px 6px;
  border-radius: 7px;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}
.tab-btn.active {
  background: #ffffff;
  color: #1d4ed8;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
}

.dash-2col {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 8px;
}
.sub-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 9px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.level-status-sub {
  font-size: 10.5px;
  color: #64748b;
  margin-top: 2px;
  line-height: 1.3;
}

.tiers-list { align-items: stretch; justify-content: space-between; gap: 4px; }
.tier-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4.5px 8px;
  border-radius: 99px;
  font-size: 11px;
  color: #475569;
}
.tier-item.active { font-weight: 800; color: #0f172a; }
.tier-item.critical.active { background: #fee2e2; color: #b91c1c; }
.tier-item.high.active { background: #ffedd5; color: #c2410c; }
.tier-item.attention.active { background: #dbeafe; color: #1d4ed8; }
.tier-item.low.active { background: #dcfce7; color: #15803d; }
.tdot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.tdot.critical { background: #dc2626; }
.tdot.high { background: #f59e0b; }
.tdot.attention { background: #3b82f6; }
.tdot.low { background: #16a34a; }
.segs { display: inline-flex; gap: 2.5px; }
.seg { width: 5px; height: 11px; border-radius: 3px; background: #dfe5ef; }
.seg.on.critical { background: #dc2626; }
.seg.on.high { background: #f59e0b; }
.seg.on.attention { background: #3b82f6; }
.seg.on.low { background: #16a34a; }

.reason-strip {
  font-size: 11.5px;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 7px 10px;
}

.safety-alert {
  background: #fef2f2;
  border: 1.5px solid #fca5a5;
  border-radius: 10px;
  padding: 9px 11px;
  color: #991b1b;
  font-size: 11.5px;
}
.safety-alert h4 { margin: 0 0 4px; font-size: 12.5px; color: #dc2626; }
.safety-alert ul { margin: 4px 0 0; padding-left: 16px; }

.advice-box {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 11px;
  padding: 9px 11px;
}
.advice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  color: #1d4ed8;
  font-size: 12px;
  cursor: pointer;
}
.advice-list { margin: 5px 0 0; padding-left: 16px; font-size: 11.5px; color: #1e293b; }
.advice-list li { margin: 2.5px 0; }
.q-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: #ffffff;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  padding: 5px 8px;
  margin-top: 5px;
  font-size: 11px;
}
.btn-copy {
  border: 0;
  background: #dbeafe;
  color: #1d4ed8;
  border-radius: 6px;
  padding: 3px 7px;
  font: inherit;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.quota-box {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 11px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.quota-title { font-size: 11.5px; font-weight: 700; color: #ea580c; }
.quota-sub { font-size: 10.5px; color: #64748b; line-height: 1.3; margin-top: 1px; }
.btn-orange {
  background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%);
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

/* Tab Đánh giá tín hiệu & Bằng chứng */
.sig-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-height: 310px;
  overflow-y: auto;
  padding-right: 2px;
}
.sig-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3.5px solid #3b82f6;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 11.5px;
}
.sig-item.high { border-left-color: #f59e0b; }
.sig-item.critical { border-left-color: #dc2626; }
.sig-item.dim { opacity: 0.55; }
.sig-title {
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.sig-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 99px;
  background: #e2e8f0;
  color: #334155;
}
.sig-quote {
  margin: 5px 0;
  padding: 4px 8px;
  border-left: 2px solid #cbd5e1;
  background: #ffffff;
  border-radius: 4px;
  font-size: 11px;
  color: #334155;
}
.mark-bar {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.mark-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  border-radius: 6px;
  padding: 3px 7px;
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}
.mark-btn.active {
  background: #1d4ed8;
  color: #ffffff;
  border-color: #1d4ed8;
}

/* Tab Phân tích & Tiến trình */
.stage-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stage-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 11px;
  color: #64748b;
}
.stage-pill.on {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1e293b;
}
.stage-pill.current {
  background: #dbeafe;
  border-color: #3b82f6;
  font-weight: 700;
  color: #1d4ed8;
}
.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.mini-table th, .mini-table td {
  padding: 4px 6px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}
.mini-table td.num, .mini-table th.num { text-align: right; }
`;

function px(x: number, y: number, w: number, hgt: number, fill: string): SVGElement {
  return svg('rect', { x, y, width: w, height: hgt, fill });
}

/**
 * Vẽ chú Mèo Tuxedo (Đen - Trắng) Pixel Art cầm Khiên Pixel đổi màu theo 4 mức độ:
 * - Lưới pixel sắc nét (shape-rendering="crispEdges")
 * - Bộ lông đen than (#1e222d) viền đen (#090a0f) kết hợp mảng lông trắng Tuxedo (#ffffff):
 *   + Trán chữ V ngược & mõm trắng, mũi hồng (#fb7185)
 *   + Yếm ngực trắng Tuxedo trước bụng
 *   + Đôi tất chân trắng ở bàn chân bám khung chat & chóp đuôi trắng
 * - Hai tai nhọn viền đen với mảng hồng hình chữ L bên trong (#f9a8ba)
 * - Đôi mắt 2 tầng pixel (trên vàng cam #f59e0b, dưới đen), 2 cặp râu ngang hai bên má
 * - Tay trước cầm chiếc Khiên Pixel đổi màu theo 4 mức độ (.pixel-cat-shield)
 */
function pixelCatShieldSvg(level: RiskLevel, width = 96, height = 66): SVGElement {
  const BK = '#090a0f';
  const DK = '#1e222d';
  const LT = '#343946';
  const PK = '#f9a8ba';
  const NS = '#fb7185';
  const EY = level === 'critical' ? '#fde047' : '#f59e0b';
  const WT = '#ffffff';
  const WS = '#dbe4f0';
  const pal = SHIELD_PIXEL_PALETTE[level];
  const isAlert = level === 'high' || level === 'critical';

  // Đuôi mèo Tuxedo pixel bậc thang bên phải (có chóp đuôi trắng)
  const tailGroup = svg(
    'g',
    { class: `pixel-cat-tail${isAlert ? ' fast' : ''}` },
    // Viền đen bậc thang của đuôi
    px(15, 12, 2, 1, BK),
    px(16, 11, 2, 1, BK),
    px(17, 10, 2, 1, BK),
    px(18, 8, 2, 2, BK),
    px(19, 7, 3, 1, BK),
    px(21, 8, 2, 3, BK),
    px(20, 11, 2, 1, BK),
    px(19, 12, 2, 1, BK),
    px(18, 13, 2, 1, BK),
    px(16, 14, 3, 1, BK),
    // Lõi đuôi đen + chóp đuôi trắng Tuxedo
    px(15, 13, 3, 1, DK),
    px(17, 11, 3, 2, DK),
    px(19, 10, 2, 1, DK),
    px(19, 8, 2, 2, WT),
  );

  // Tai trái pixel (hình chữ L màu hồng bên trong)
  const leftEarGroup = svg(
    'g',
    { class: 'pixel-ear-l' },
    px(6, 1, 3, 1, BK),
    px(5, 2, 1, 2, BK),
    px(9, 2, 1, 2, BK),
    px(6, 2, 1, 2, PK),
    px(7, 3, 1, 1, PK),
    px(7, 2, 2, 1, LT),
    px(8, 3, 1, 1, DK),
  );

  // Tai phải pixel (hình chữ L màu hồng đối xứng)
  const rightEarGroup = svg(
    'g',
    { class: 'pixel-ear-r' },
    px(14, 1, 3, 1, BK),
    px(13, 2, 1, 2, BK),
    px(17, 2, 1, 2, BK),
    px(16, 2, 1, 2, PK),
    px(15, 3, 1, 1, PK),
    px(14, 2, 2, 1, LT),
    px(14, 3, 1, 1, DK),
  );

  // Mắt 2 tầng pixel (vàng cam ở trên, đen ở dưới)
  const eyesGroup = svg(
    'g',
    { class: 'pixel-cat-eyes' },
    // Mắt trái
    px(8, 5, 1, 1, EY),
    px(8, 6, 1, 1, BK),
    // Mắt phải
    px(13, 5, 1, 1, EY),
    px(13, 6, 1, 1, BK),
  );

  // Đầu, mặt nạ Tuxedo trắng, râu ngang & thân mèo yếm trắng
  const bodyGroup = svg(
    'g',
    { class: 'pixel-cat-body' },
    leftEarGroup,
    rightEarGroup,
    // Đỉnh đầu nối giữa 2 tai
    px(10, 3, 3, 1, BK),
    // Khung đầu (x=5..17, y=4..8)
    px(5, 4, 1, 5, BK),
    px(17, 4, 1, 5, BK),
    px(6, 4, 11, 5, DK),
    px(16, 4, 1, 4, LT),
    // Mảng lông trắng Tuxedo hình chữ V ngược ở giữa sống mũi & hai má (y=5..8)
    px(10, 5, 2, 1, WT),
    px(9, 6, 4, 1, WT),
    px(8, 7, 6, 2, WT),
    px(7, 8, 8, 1, WT),
    // Mũi hồng xinh xắn giữa mặt nạ trắng
    px(10, 6, 2, 1, NS),
    // Điểm nhấn miệng nhỏ dưới mũi
    px(10, 7, 2, 1, WS),
    // Hai cặp râu ngang 2 bên má
    px(3, 6, 2, 1, BK),
    px(3, 8, 2, 1, BK),
    px(18, 6, 2, 1, BK),
    px(18, 8, 2, 1, BK),
    eyesGroup,
    // Cằm & cổ
    px(6, 9, 2, 1, BK),
    px(14, 9, 3, 1, BK),
    px(8, 9, 6, 1, WT),
    // Thân mèo Tuxedo ngồi (x=7..16, y=10..15)
    px(7, 10, 1, 5, BK),
    px(8, 10, 6, 5, DK),
    px(14, 10, 1, 2, BK),
    px(15, 12, 1, 1, BK),
    px(14, 12, 1, 3, DK),
    px(15, 13, 1, 2, DK),
    px(16, 14, 1, 1, BK),
    // Yếm ngực trắng Tuxedo (Bib) trước ngực mèo
    px(9, 10, 4, 3, WT),
    px(10, 13, 2, 1, WT),
    px(9, 12, 1, 1, WS),
    px(12, 12, 1, 1, WS),
    // Đôi tất trắng (White Socks) ở hai bàn chân trước bám khung chat
    px(8, 14, 2, 1, WT),
    px(11, 14, 1, 1, WT),
    px(13, 14, 2, 1, WT),
    // Đáy chân viền đen có khe phân tách bàn chân
    px(8, 15, 2, 1, BK),
    px(10, 14, 1, 1, BK),
    px(11, 15, 1, 1, BK),
    px(12, 14, 1, 1, BK),
    px(13, 15, 3, 1, BK),
  );

  // Chiếc Khiên Pixel Art bên tay trái của mèo (x=1..7, y=9..15)
  const shieldGroup = svg(
    'g',
    { class: 'pixel-cat-shield' },
    // Viền đen ngoài của khiên pixel
    px(2, 9, 5, 1, BK),
    px(1, 10, 1, 4, BK),
    px(7, 10, 1, 4, BK),
    px(2, 14, 1, 1, BK),
    px(6, 14, 1, 1, BK),
    px(3, 15, 3, 1, BK),
    // Nền màu của khiên theo 4 mức độ
    px(2, 10, 5, 4, pal.main),
    px(3, 14, 3, 1, pal.main),
    // Viền sáng pixel góc trái trên & bóng đậm góc phải dưới
    px(2, 10, 2, 1, pal.light),
    px(2, 11, 1, 2, pal.light),
    px(6, 11, 1, 3, pal.dark),
    px(5, 14, 1, 1, pal.dark),
    // Biểu tượng trắng ở tâm khiên (dấu chấm than hoặc dấu kiểm pixel)
    isAlert
      ? svg('g', {}, px(4, 10, 1, 2, WT), px(4, 13, 1, 1, WT))
      : svg('g', {}, px(3, 12, 1, 1, WT), px(4, 13, 1, 1, WT), px(5, 11, 1, 2, WT)),
  );

  return svg(
    'svg',
    { viewBox: '0 0 24 17', width, height, class: 'pixel-cat-svg', 'aria-hidden': 'true' },
    svg('ellipse', { cx: 12, cy: 15.6, rx: 9.5, ry: 1.2, fill: 'rgba(15, 23, 42, 0.16)' }),
    tailGroup,
    bodyGroup,
    shieldGroup,
  );
}

function segCountFor(r: AnalysisResult, rowLevel: RiskLevel): number {
  const cur = RISK_LEVEL_ORDER[r.risk_level];
  const row = RISK_LEVEL_ORDER[rowLevel];
  if (rowLevel === r.risk_level) {
    if (rowLevel === 'critical') return 4;
    if (rowLevel === 'high') return 3;
    if (rowLevel === 'attention') return 2;
    return 1;
  }
  return row < cur ? (rowLevel === 'low' ? 1 : 2) : 0;
}

export function initFloatingWidget(
  probeLocal: () => ProbeResult,
  getThreadRect?: (threadId: string) => DOMRect | null,
) {
  if (typeof document === 'undefined' || !document.body) return;
  if (document.getElementById('safechat-ai-overlay-host')) return;

  const host = document.createElement('div');
  host.id = 'safechat-ai-overlay-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = WIDGET_CSS;

  const spotlightTag = h('div', { class: 'spotlight-tag' }, '');
  const spotlightEl = h('div', { class: 'spotlight-box' }, spotlightTag);
  const mount = h('div', { class: 'widget-pos' });

  shadow.append(styleEl, spotlightEl, mount);
  document.body.append(host);

  let session: Session | null = null;
  let minimized = true;
  let consent = true;
  let hasScanned = false;
  let isScanning = false;
  let chosenThreadId: string | null = null;
  let scanNotice = '';
  let lastThreadSignature = '';

  let sessionViewMode: SessionViewMode = 'mini';
  let detailTab: DetailTab = 'overview';
  let dockedToChat = true;
  let freePos: { x: number; y: number } | null = null;
  let isDragging = false;
  let suppressClick = false;
  let copyFeedback = '';

  let expandedAdvice = false;
  let spotlightTimer: ReturnType<typeof setTimeout> | undefined;

  function sendReq<T = { ok: boolean; reason?: string }>(req: PanelRequest): Promise<T> {
    return chrome.runtime.sendMessage(req) as Promise<T>;
  }

  function showSpotlight(threadId: string, label: string, durationMs = 0) {
    clearTimeout(spotlightTimer);
    const rect = getThreadRect?.(threadId);
    if (!rect || rect.width < 20 || rect.height < 20) {
      spotlightEl.style.display = 'none';
      return;
    }
    spotlightTag.textContent = `Khung chat: ${label}`;
    spotlightEl.style.display = 'block';
    spotlightEl.style.left = `${Math.max(2, rect.left - 4)}px`;
    spotlightEl.style.top = `${Math.max(2, rect.top - 4)}px`;
    spotlightEl.style.width = `${rect.width + 8}px`;
    spotlightEl.style.height = `${rect.height + 8}px`;
    if (durationMs > 0) {
      spotlightTimer = setTimeout(() => {
        spotlightEl.style.display = 'none';
      }, durationMs);
    }
  }

  function hideSpotlight() {
    clearTimeout(spotlightTimer);
    spotlightEl.style.display = 'none';
  }

  function clampCoords(x: number, y: number, w: number, hgt: number) {
    const maxX = Math.max(8, window.innerWidth - w - 8);
    const maxY = Math.max(8, window.innerHeight - hgt - 8);
    return {
      x: Math.max(8, Math.min(maxX, x)),
      y: Math.max(8, Math.min(maxY, y)),
    };
  }

  function updateWidgetPosition() {
    if (isDragging) return;
    const rectMount = mount.getBoundingClientRect();
    const w = rectMount.width || (session && sessionViewMode === 'mini' ? 328 : 348);
    const hgt = rectMount.height || (session && sessionViewMode === 'mini' ? 148 : 380);

    if (session && dockedToChat && !session.waiting && getThreadRect) {
      const chatRect = getThreadRect(session.threadId);
      if (chatRect && chatRect.width > 40 && chatRect.height > 40) {
        mount.classList.add('docked-transition');
        if (sessionViewMode === 'mini') {
          const perchEl = mount.querySelector<HTMLElement>('.cat-perch-container');
          const targetW = Math.max(280, Math.min(348, chatRect.width));
          if (perchEl) perchEl.style.width = `${targetW}px`;
          const actualW = perchEl ? targetW : w;
          const idealX = chatRect.left + (chatRect.width - actualW) / 2;
          // Đặt chân mèo bám sát ngay trên mép đỉnh khung chat (chồng nhẹ 6px vào viền trên của khung chat)
          const idealY =
            chatRect.top >= hgt - 6
              ? chatRect.top - hgt + 6
              : Math.max(6, chatRect.top + 4);
          const clamped = clampCoords(idealX, idealY, actualW, hgt);
          mount.style.left = `${clamped.x}px`;
          mount.style.top = `${clamped.y}px`;
          mount.style.right = 'auto';
          mount.style.bottom = 'auto';
          return;
        } else {
          // Khi mở bảng Chi tiết: đặt NGAY BÊN CẠNH khung chat (ưu tiên bên trái khung chat) để không che tin nhắn
          let idealX: number;
          if (chatRect.left >= w + 14) {
            idealX = chatRect.left - w - 12;
          } else if (window.innerWidth - chatRect.right >= w + 14) {
            idealX = chatRect.right + 12;
          } else {
            idealX = Math.max(12, chatRect.left - w * 0.75);
          }
          const idealY = Math.max(62, Math.min(chatRect.bottom - hgt, window.innerHeight - hgt - 12));
          const clamped = clampCoords(idealX, idealY, w, hgt);
          mount.style.left = `${clamped.x}px`;
          mount.style.top = `${clamped.y}px`;
          mount.style.right = 'auto';
          mount.style.bottom = 'auto';
          return;
        }
      }
    }

    mount.classList.remove('docked-transition');
    if (freePos) {
      const clamped = clampCoords(freePos.x, freePos.y, w, hgt);
      mount.style.left = `${clamped.x}px`;
      mount.style.top = `${clamped.y}px`;
      mount.style.right = 'auto';
      mount.style.bottom = 'auto';
    } else {
      // Mặc định khi mới mở Facebook: góc trên bên phải màn hình
      mount.style.top = '62px';
      mount.style.right = '18px';
      mount.style.left = 'auto';
      mount.style.bottom = 'auto';
    }
  }

  mount.addEventListener(
    'click',
    (e) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick = false;
      }
    },
    true,
  );

  function bindDragHandle(el: HTMLElement) {
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target !== el &&
        target.closest('button, input, label, a, select') &&
        !el.classList.contains('cat-stage-btn')
      ) {
        return;
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const box = mount.getBoundingClientRect();
      const origLeft = box.left;
      const origTop = box.top;
      let moved = false;
      const wasDocked = dockedToChat;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > 5) {
          moved = true;
          isDragging = true;
          suppressClick = true;
          dockedToChat = false;
          mount.classList.remove('docked-transition');
        }
        if (moved) {
          const next = clampCoords(origLeft + dx, origTop + dy, box.width, box.height);
          freePos = next;
          mount.style.left = `${next.x}px`;
          mount.style.top = `${next.y}px`;
          mount.style.right = 'auto';
          mount.style.bottom = 'auto';
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (moved) {
          isDragging = false;
          if (wasDocked && session) {
            renderWidget();
          }
          setTimeout(() => {
            suppressClick = false;
          }, 50);
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }

  function downloadSnap(s: Session) {
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
    const url = URL.createObjectURL(new Blob([serializeSnapshot(snap)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `safechat-phien-${stamp}.json` });
    shadow.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function downloadHtmlReport(s: Session) {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const html = exportHtml({
      threadLabel: s.threadLabel,
      startedAt: s.startedAt,
      exportedAt: Date.now(),
      messages: s.transcript.messages,
      result: s.result,
      marks: s.marks,
      scope: 'full',
      aiUsed: s.ai.calls > 0,
    });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = h('a', { href: url, download: `safechat-bao-cao-${stamp}.html` });
    shadow.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function runScan() {
    isScanning = true;
    hasScanned = true;
    scanNotice = '';
    renderWidget();
    setTimeout(() => {
      isScanning = false;
      const fresh = probeLocal();
      const list = probeThreads(fresh);
      if (list.length > 0) {
        if (!chosenThreadId || !list.some((t) => t.threadId === chosenThreadId)) {
          chosenThreadId = list[0]!.threadId;
        }
        const chosen = list.find((t) => t.threadId === chosenThreadId) ?? list[0]!;
        showSpotlight(chosen.threadId, chosen.threadLabel, 1400);
      } else {
        chosenThreadId = null;
        hideSpotlight();
      }
      renderWidget();
    }, 320);
  }

  async function lockThread(t: ThreadInfo) {
    if (!consent) return;
    scanNotice = '';
    chosenThreadId = t.threadId;
    dockedToChat = true;
    sessionViewMode = 'mini';
    showSpotlight(t.threadId, t.threadLabel, 900);
    const res = await sendReq({ kind: 'start', tabId: -1, threadId: t.threadId });
    if (!res?.ok) {
      scanNotice = res?.reason ?? 'Không thể khóa đoạn chat này. Hãy bấm Quét lại.';
      renderWidget();
    }
  }

  async function stopAndScanOthers() {
    await sendReq({ kind: 'stop_and_clear' });
    session = null;
    chosenThreadId = null;
    minimized = false;
    hasScanned = true;
    runScan();
  }

  async function closeToDefaultCat() {
    await sendReq({ kind: 'stop_and_clear' });
    session = null;
    chosenThreadId = null;
    minimized = true;
    hideSpotlight();
    renderWidget();
  }

  function renderOverviewTab(s: Session): Node {
    const r = s.result;
    const lv: RiskLevel = r?.risk_level ?? 'low';

    const tierRows: { level: RiskLevel; label: string }[] = [
      { level: 'critical', label: LEVEL_DISPLAY.critical },
      { level: 'high', label: LEVEL_DISPLAY.high },
      { level: 'attention', label: LEVEL_DISPLAY.attention },
      { level: 'low', label: LEVEL_DISPLAY.low },
    ];

    const usagePct = Math.min(100, Math.round((s.transcript.messages.length / Math.max(1, s.maxMessages)) * 100));
    const actions = r?.advice.actions.slice(0, expandedAdvice ? 5 : 2) ?? [];
    const questions = r?.safety_priority ? [] : (r?.advice.questions.slice(0, expandedAdvice ? 4 : 2) ?? []);

    return h(
      'div',
      { style: 'display:flex;flex-direction:column;gap:8px' },
      h(
        'div',
        { class: 'dash-2col' },
        h(
          'div',
          { class: 'sub-card' },
          pixelCatShieldSvg(lv, 92, 65),
          h('div', { class: `level-pill ${lv}`, style: 'margin-top:4px' }, LEVEL_DISPLAY[lv]),
          h('div', { class: 'level-status-sub' }, LEVEL_SUBTITLE[lv]),
        ),
        h(
          'div',
          { class: 'sub-card tiers-list' },
          ...tierRows.map(({ level, label }) => {
            const lit = r ? segCountFor(r, level) : level === 'low' ? 1 : 0;
            return h(
              'div',
              { class: `tier-item ${level}${lv === level ? ' active' : ''}` },
              h('span', { style: 'display:inline-flex;align-items:center' }, h('span', { class: `tdot ${level}` }), label),
              h(
                'span',
                { class: 'segs' },
                ...[0, 1, 2, 3].map((i) => h('span', { class: `seg ${level}${i < lit ? ' on' : ''}` })),
              ),
            );
          }),
        ),
      ),
      r &&
        h(
          'div',
          { class: 'reason-strip' },
          h('b', {}, `Mức ${LEVEL_DISPLAY[lv]}: `),
          r.level_reason,
          r.stability_note && h('div', { style: 'color:#b45309;margin-top:3px;font-size:10.5px' }, r.stability_note),
        ),
      r?.safety_priority &&
        r.advice.safety_message &&
        h(
          'div',
          { class: 'safety-alert', role: 'alert' },
          h('h4', {}, 'Ưu tiên an toàn của bạn'),
          h('div', {}, r.advice.safety_message),
          (r.advice.support_resources?.length ?? 0) > 0 &&
            h('ul', {}, ...(r.advice.support_resources ?? []).map((item) => h('li', {}, item))),
        ),
      h(
        'div',
        { class: 'advice-box' },
        h(
          'div',
          {
            class: 'advice-head',
            onclick: () => {
              expandedAdvice = !expandedAdvice;
              renderWidget();
            },
          },
          h('span', {}, 'Gợi ý để làm rõ ý định'),
          h('span', {}, expandedAdvice ? 'Thu gọn' : 'Xem thêm'),
        ),
        h(
          'ul',
          { class: 'advice-list' },
          ...actions.map((act) => h('li', {}, act)),
        ),
        ...questions.map((q) =>
          h(
            'div',
            { class: 'q-row' },
            h('span', {}, `"${q}"`),
            h(
              'button',
              {
                class: 'btn-copy',
                onclick: async () => {
                  await navigator.clipboard?.writeText?.(q).catch(() => {});
                  copyFeedback = q;
                  renderWidget();
                  setTimeout(() => {
                    copyFeedback = '';
                    renderWidget();
                  }, 1500);
                },
              },
              copyFeedback === q ? 'Đã chép' : 'Sao chép',
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'quota-box' },
        h(
          'div',
          {},
          h(
            'div',
            { class: 'quota-title' },
            usagePct >= 80
              ? `Gần đến giới hạn bộ nhớ phiên (${s.transcript.messages.length}/${s.maxMessages} tin)`
              : `Đã đọc ${s.transcript.messages.length}/${s.maxMessages} tin nhắn`,
          ),
          h('div', { class: 'quota-sub' }, 'Lưu bản nháp (.json) hoặc xuất báo cáo (.html) để giữ bằng chứng.'),
        ),
        h(
          'div',
          { style: 'display:flex;flex-direction:column;gap:4px' },
          h(
            'button',
            {
              class: 'btn-orange',
              onclick: () => downloadSnap(s),
            },
            'Lưu phiên',
          ),
          h(
            'button',
            {
              class: 'mark-btn',
              style: 'text-align:center',
              onclick: () => downloadHtmlReport(s),
            },
            'Báo cáo HTML',
          ),
        ),
      ),
    );
  }

  function renderEvaluateTab(s: Session): Node {
    const sigs = s.result?.signals ?? [];
    const claims = s.result?.claims ?? [];
    return h(
      'div',
      { class: 'sig-list' },
      h(
        'div',
        { style: 'font-size:11px;color:#475569' },
        'Xem các dấu hiệu phát hiện được và tự đánh giá mức độ phù hợp với ngữ cảnh thực tế của bạn:',
      ),
      sigs.length === 0
        ? h(
            'div',
            { class: 'reason-strip', style: 'text-align:center;padding:16px 10px' },
            'Chưa phát hiện tín hiệu rủi ro nào trong phần tin nhắn đã đọc.',
          )
        : null,
      ...sigs.map((sig: Signal) => {
        const key = signalKey(sig);
        const currentMark = s.marks[key];
        return h(
          'div',
          { class: `sig-item ${sig.severity}${currentMark === 'not_relevant' ? ' dim' : ''}` },
          h(
            'div',
            { class: 'sig-title' },
            h('span', {}, sig.title),
            h(
              'span',
              { class: 'sig-tag' },
              `${LEVEL_DISPLAY[sig.severity]} · ${sig.source === 'ai' ? 'AI' : sig.source === 'ledger' ? 'Đối chiếu' : 'Quy tắc'}`,
            ),
          ),
          h('div', { style: 'margin-top:3px;color:#334155' }, sig.explanation),
          ...sig.evidence_quotes.slice(0, 2).map((q, idx) =>
            h(
              'div',
              { class: 'sig-quote' },
              h('b', {}, `${sig.evidence_message_ids[idx] ?? 'Tin'}: `),
              `"${q}"`,
            ),
          ),
          h('div', { style: 'margin-top:4px;font-size:11px;color:#0f172a' }, h('b', {}, 'Nên làm: '), sig.recommended_action),
          h(
            'div',
            { class: 'mark-bar' },
            ...MARKS.map(([m, label]) =>
              h(
                'button',
                {
                  class: `mark-btn${currentMark === m ? ' active' : ''}`,
                  onclick: () => void sendReq({ kind: 'mark', key, mark: currentMark === m ? null : m }),
                },
                label,
              ),
            ),
          ),
        );
      }),
      claims.length > 0 &&
        h(
          'div',
          { class: 'reason-strip', style: 'margin-top:4px' },
          h('div', { style: 'font-weight:700;margin-bottom:4px' }, 'Sổ đối chiếu phát biểu trước - sau:'),
          ...claims.map((c) =>
            h(
              'div',
              { style: 'font-size:11px;margin:3px 0' },
              `• ${c.claim_text} (${c.source_message_id}) — `,
              h(
                'b',
                {},
                {
                  unverified: 'Chưa xác minh',
                  consistent: 'Nhất quán',
                  possible_contradiction: 'Chưa nhất quán',
                  explained: 'Đã đính chính',
                }[c.status],
              ),
            ),
          ),
        ),
    );
  }

  function renderAnalysisTab(s: Session): Node {
    const r = s.result;
    const reached = new Map((r?.stages_reached ?? []).map((x) => [x.stage, x.first_message_id]));
    return h(
      'div',
      { class: 'sig-list' },
      h('div', { style: 'font-weight:700;font-size:12px;color:#0f172a' }, 'Tiến trình kịch bản (S0 → S4)'),
      h(
        'div',
        { class: 'stage-row' },
        ...STAGES.map((st) =>
          h(
            'div',
            { class: `stage-pill${reached.has(st) ? ' on' : ''}${r?.stage === st ? ' current' : ''}` },
            h('span', {}, `${st} · ${STAGE_LABEL[st]}`),
            h('span', { style: 'font-size:10px' }, reached.has(st) ? `từ ${reached.get(st)}` : r?.stage === st ? 'Hiện tại' : '—'),
          ),
        ),
      ),
      h('div', { style: 'font-weight:700;font-size:12px;color:#0f172a;margin-top:6px' }, 'Tổng hợp dấu hiệu theo mức độ'),
      !r || r.score_breakdown.length === 0
        ? h('div', { class: 'reason-strip' }, 'Chưa ghi nhận dấu hiệu rủi ro nào.')
        : h(
            'table',
            { class: 'mini-table' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Dấu hiệu'), h('th', { class: 'num' }, 'Mức độ'))),
            h(
              'tbody',
              {},
              ...r.score_breakdown.map((b) => {
                const pillClass = b.severity === 'medium' ? 'attention' : b.severity;
                return h(
                  'tr',
                  {},
                  h('td', {}, b.title),
                  h('td', { class: 'num' }, h('span', { class: `level-pill ${pillClass}` }, LEVEL_DISPLAY[b.severity])),
                );
              }),
            ),
          ),
      h(
        'button',
        {
          class: 'btn-detail',
          style: 'width:100%;padding:7px;margin-top:6px;text-align:center',
          onclick: () => void stopAndScanOthers(),
        },
        'Quét và đổi sang đoạn chat khác',
      ),
    );
  }

  function renderWidget() {
    // 1. Mặc định khi mở lên (hoặc thu gọn khi chưa khóa chat): chú mèo Tuxedo Pixel cầm khiên + nút Quét chat
    if (minimized && !session) {
      const openAndScan = () => {
        minimized = false;
        runScan();
      };
      const catBtn = h(
        'button',
        {
          class: 'cat-stage-btn',
          title: 'Kéo để di chuyển · Bấm vào mèo để quét đoạn chat',
          onclick: openAndScan,
        },
        pixelCatShieldSvg('low', 88, 62),
        h('span', { class: 'cat-shield-tag attention' }, 'Quét chat'),
      );
      bindDragHandle(catBtn);

      const orbWrap = h(
        'div',
        { class: 'cat-perch-container compact-orb' },
        h(
          'div',
          {
            class: 'cat-bubble attention',
            style: 'padding:6px 10px;width:auto;max-width:220px;cursor:pointer',
            onclick: openAndScan,
          },
          h('div', { style: 'font-size:11px;font-weight:700;color:#1e293b;text-align:center' }, 'Bấm vào mèo để quét đoạn chat'),
        ),
        catBtn,
      );
      mount.replaceChildren(orbWrap);
      requestAnimationFrame(updateWidgetPosition);
      return;
    }

    // 2. Khi chưa có phiên khóa chat: Màn hình Bắt đầu quét popup trên Facebook (ở góc trên bên phải màn hình)
    if (!session) {
      const liveProbe = probeLocal();
      const threads = probeThreads(liveProbe);
      lastThreadSignature = threads.map((t) => `${t.threadId}:${t.threadLabel}`).join('|');

      if (threads.length > 0 && (!chosenThreadId || !threads.some((t) => t.threadId === chosenThreadId))) {
        chosenThreadId = threads[0]!.threadId;
      }
      const selectedThread = threads.find((t) => t.threadId === chosenThreadId) ?? threads[0] ?? null;

      const dragHeader = h(
        'div',
        { class: 'launcher-drag-bar drag-handle', title: 'Giữ chuột và kéo để di chuyển tới bất kỳ đâu trên màn hình' },
        h('span', {}, 'Giữ kéo để di chuyển tiện ích'),
        h(
          'button',
          {
            class: 'text-btn',
            title: 'Thu gọn thành chú mèo Pixel cầm khiên',
            onclick: () => {
              minimized = true;
              hideSpotlight();
              renderWidget();
            },
          },
          'Thu gọn',
        ),
      );
      bindDragHandle(dragHeader);

      const launcherEl = h(
        'div',
        { class: 'wrap' },
        h(
          'section',
          { class: 'launcher' },
          dragHeader,
          h(
            'div',
            { class: 'launcher-hero' },
            pixelCatShieldSvg('attention', 78, 55),
            h(
              'div',
              { style: 'min-width:0;flex:1' },
              h('div', { class: 'brand-title' }, 'SafeChat AI'),
              h('div', { class: 'sub' }, 'Chọn đoạn chat để chú mèo Pixel cầm khiên bám lên canh gác lừa đảo.'),
            ),
          ),
          h(
            'button',
            {
              class: 'btn-scan',
              disabled: isScanning,
              onclick: () => runScan(),
            },
            isScanning
              ? 'Đang quét dò popup trên màn hình...'
              : hasScanned
                ? `Quét lại popup trên màn hình (${threads.length})`
                : 'Bắt đầu quét popup',
          ),
          scanNotice &&
            h(
              'div',
              { style: 'margin-top:8px;padding:6px 9px;border-radius:8px;background:#fef2f2;color:#dc2626;font-size:11px' },
              scanNotice,
            ),
          h(
            'div',
            { class: 'scan-results' },
            h(
              'div',
              { class: 'scan-head' },
              h(
                'span',
                {},
                threads.length > 0
                  ? `Phát hiện ${threads.length} đoạn chat đang mở:`
                  : hasScanned
                    ? 'Chưa tìm thấy popup đoạn chat'
                    : 'Trạng thái dò khung chat:',
              ),
            ),
            threads.length === 0
              ? h(
                  'div',
                  { style: 'font-size:11.5px;color:#64748b;line-height:1.4' },
                  liveProbe.reason ?? 'Hãy mở một khung chat popup (không thu nhỏ) với người cần kiểm tra rồi bấm "Bắt đầu quét popup".',
                )
              : h(
                  'div',
                  { class: 'thread-list' },
                  ...threads.map((t) => {
                    const isSel = selectedThread?.threadId === t.threadId;
                    return h(
                      'div',
                      {
                        class: `thread-card${isSel ? ' selected' : ''}`,
                        onmouseenter: () => showSpotlight(t.threadId, t.threadLabel),
                        onmouseleave: () => hideSpotlight(),
                        onclick: () => {
                          chosenThreadId = t.threadId;
                          showSpotlight(t.threadId, t.threadLabel, 1000);
                          renderWidget();
                        },
                      },
                      h(
                        'div',
                        { style: 'min-width:0;flex:1' },
                        h('div', { class: 'thread-name' }, t.threadLabel),
                        h('div', { class: 'thread-sub' }, 'Rê chuột để định vị · Bấm Khóa để mèo bám lên chat'),
                      ),
                      h(
                        'button',
                        {
                          class: 'btn-lock',
                          disabled: !consent,
                          onclick: (ev: Event) => {
                            ev.stopPropagation();
                            void lockThread(t);
                          },
                        },
                        'Khóa chat',
                      ),
                    );
                  }),
                ),
            h(
              'label',
              { class: 'consent-label' },
              h('input', {
                type: 'checkbox',
                checked: consent,
                onchange: (e: Event) => {
                  consent = (e.target as HTMLInputElement).checked;
                  renderWidget();
                },
              }),
              h('span', {}, 'Đồng ý cho SafeChat AI đọc văn bản của đoạn chat bạn chọn khóa.'),
            ),
          ),
        ),
      );

      mount.replaceChildren(launcherEl);
      requestAnimationFrame(updateWidgetPosition);
      return;
    }

    // 3. Khi ĐÃ KHÓA đoạn chat & ở chế độ CHÚ MÈO PIXEL CẦM KHIÊN BÁM TRÊN ĐỈNH KHUNG CHAT (sessionViewMode === 'mini')
    const r = session.result;
    const lv: RiskLevel = r?.risk_level ?? 'low';
    const sigCount = r?.signals.length ?? 0;
    const latestSig = r?.signals.at(-1);
    const topAction = r?.advice.actions[0];
    const topQuestion = r?.safety_priority ? undefined : r?.advice.questions[0];

    const otherOpenThreads = probeThreads(probeLocal()).filter((t) => t.threadId !== session?.threadId);

    if (sessionViewMode === 'mini') {
      const suggestionText = session.waiting
        ? `Khung chat "${session.threadLabel}" đã đóng — mở lại hoặc chọn chat khác bên dưới.`
        : session.readerError
          ? session.readerError
          : r?.safety_priority && r.advice.safety_message
            ? r.advice.safety_message
            : latestSig
              ? `${latestSig.title}${topAction ? ` — Gợi ý: ${topAction}` : ''}`
              : topAction && lv !== 'low'
                ? `Gợi ý: ${topAction}`
                : session.scan?.state === 'loading'
          ? `Đang đọc lịch sử, tối đa ${session.scan.target} tin…`
          : `Đang canh gác (${session.transcript.messages.length} tin) · ${LEVEL_SUBTITLE[lv]}`;

      const bubbleHead = h(
        'div',
        {
          class: 'bubble-top drag-handle',
          title: dockedToChat
            ? 'Đang bám trên đỉnh khung chat · Giữ kéo để tách rời tới vị trí bất kỳ'
            : 'Chế độ tự do · Giữ kéo để di chuyển hoặc bấm Ghim để mèo bám lại lên khung chat',
        },
        h(
          'div',
          { class: 'bubble-thread-wrap' },
          h('span', { class: `dot${session.status !== 'tracking' || session.waiting ? ' paused' : ''}` }),
          h('span', { class: 'bubble-thread-name', title: session.threadLabel }, session.threadLabel),
        ),
        h('span', { class: `level-pill ${lv}` }, LEVEL_DISPLAY[lv]),
      );
      bindDragHandle(bubbleHead);

      const catStageBtn = h(
        'button',
        {
          class: 'cat-stage-btn',
          title: 'Bấm vào mèo để mở bảng Chi tiết bên cạnh khung chat · Giữ kéo để di chuyển',
          onclick: () => {
            sessionViewMode = 'detail';
            detailTab = sigCount > 0 ? 'evaluate' : 'overview';
            renderWidget();
          },
        },
        pixelCatShieldSvg(lv, 98, 68),
        h('span', { class: `cat-shield-tag ${lv}` }, LEVEL_DISPLAY[lv]),
      );
      bindDragHandle(catStageBtn);

      const perchWrap = h(
        'section',
        { class: 'cat-perch-container' },
        // Bong bóng gợi ý nằm ngay trên đầu mèo
        h(
          'div',
          { class: `cat-bubble ${lv}` },
          bubbleHead,
          h(
            'div',
            {
              class: 'bubble-hint-box',
              style: 'cursor:pointer',
              title: 'Bấm để mở bảng Chi tiết bên cạnh khung chat',
              onclick: () => {
                sessionViewMode = 'detail';
                detailTab = sigCount > 0 ? 'evaluate' : 'overview';
                renderWidget();
              },
            },
            h('div', {}, suggestionText),
            topQuestion &&
              !session.waiting &&
              h(
                'div',
                {
                  class: 'bubble-question-row',
                  onclick: (ev: Event) => ev.stopPropagation(),
                },
                h('span', { style: 'min-width:0;flex:1' }, `Hỏi thử: "${topQuestion}"`),
                h(
                  'button',
                  {
                    class: 'btn-copy',
                    onclick: async (ev: Event) => {
                      ev.stopPropagation();
                      await navigator.clipboard?.writeText?.(topQuestion).catch(() => {});
                      copyFeedback = topQuestion;
                      renderWidget();
                      setTimeout(() => {
                        copyFeedback = '';
                        renderWidget();
                      }, 1500);
                    },
                  },
                  copyFeedback === topQuestion ? 'Đã chép' : 'Sao chép',
                ),
              ),
          ),
          h(
            'div',
            { class: 'bubble-actions' },
            h(
              'button',
              {
                class: 'btn-detail',
                onclick: () => {
                  sessionViewMode = 'detail';
                  renderWidget();
                },
              },
              sigCount > 0 ? `Chi tiết (${sigCount})` : 'Chi tiết',
            ),
            h(
              'div',
              { class: 'bubble-actions-right' },
              !dockedToChat &&
                h(
                  'button',
                  {
                    class: 'text-btn pin-active',
                    title: 'Cho mèo bám lại ngay trên đỉnh khung chat này',
                    onclick: () => {
                      dockedToChat = true;
                      renderWidget();
                    },
                  },
                  'Ghim lên chat',
                ),
              h(
                'button',
                {
                  class: 'text-btn',
                  title: 'Quét và đổi sang đoạn chat khác',
                  onclick: () => void stopAndScanOthers(),
                },
                'Đổi chat',
              ),
              h(
                'button',
                {
                  class: 'text-btn',
                  title: 'Dừng canh gác đoạn chat này',
                  onclick: () => void closeToDefaultCat(),
                },
                'Đóng',
              ),
            ),
          ),
          session.waiting &&
            h(
              'div',
              { class: 'waiting-switch-box' },
              ...otherOpenThreads.slice(0, 3).map((t) =>
                h(
                  'button',
                  {
                    class: 'btn-lock',
                    title: `Khóa và quét ngay đoạn chat với ${t.threadLabel}`,
                    onmouseenter: () => showSpotlight(t.threadId, t.threadLabel),
                    onmouseleave: () => hideSpotlight(),
                    onclick: async () => {
                      await sendReq({ kind: 'stop_and_clear' });
                      await lockThread(t);
                    },
                  },
                  `Quét: ${t.threadLabel}`,
                ),
              ),
              h(
                'button',
                {
                  class: 'btn-detail',
                  onclick: () => void stopAndScanOthers(),
                },
                'Quét tìm đoạn chat khác',
              ),
            ),
        ),
        // Chú mèo Pixel cầm khiên bám ngay dưới bong bóng
        catStageBtn,
      );

      mount.replaceChildren(perchWrap);
      requestAnimationFrame(updateWidgetPosition);
      return;
    }

    // 4. Khi bấm vào mèo hoặc "Chi tiết" (sessionViewMode === 'detail'):
    //    Hiển thị bên cạnh khung chat, với phần đầu 2 hàng rõ ràng không bao giờ đè chữ!
    const liveHead = h(
      'div',
      { class: 'live-head drag-handle', title: 'Giữ kéo để di chuyển bảng chi tiết tới bất kỳ đâu' },
      h(
        'div',
        { class: 'live-head-top' },
        h(
          'div',
          { class: 'live-title' },
          h('span', { class: `dot${session.status !== 'tracking' || session.waiting ? ' paused' : ''}` }),
          h('span', {}, 'SafeChat AI'),
          h('span', { class: 'live-thread-name', title: session.threadLabel }, `· ${session.threadLabel}`),
        ),
        h('span', { class: `level-pill ${lv}` }, LEVEL_DISPLAY[lv]),
      ),
      h(
        'div',
        { class: 'win-btns' },
        !dockedToChat &&
          h(
            'button',
            {
              class: 'text-btn pin-active',
              title: 'Đặt lại ngay bên cạnh khung chat đang khóa',
              onclick: () => {
                dockedToChat = true;
                renderWidget();
              },
            },
            'Ghim cạnh chat',
          ),
        h(
          'button',
          {
            class: 'btn-detail',
            title: 'Thu gọn về chú mèo Pixel cầm khiên bám trên khung chat',
            onclick: () => {
              sessionViewMode = 'mini';
              renderWidget();
            },
          },
          'Về mèo canh gác',
        ),
        h(
          'button',
          {
            class: 'text-btn',
            title: session.status === 'tracking' ? 'Tạm dừng theo dõi' : 'Tiếp tục theo dõi',
            onclick: async () => {
              await sendReq({ kind: session?.status === 'tracking' ? 'pause' : 'resume' });
            },
          },
          session.status === 'tracking' ? 'Tạm dừng' : 'Tiếp tục',
        ),
        h(
          'button',
          {
            class: 'text-btn',
            title: 'Quét và đổi sang đoạn chat khác',
            onclick: () => void stopAndScanOthers(),
          },
          'Đổi chat',
        ),
        h(
          'button',
          {
            class: 'text-btn',
            title: 'Dừng và về mèo canh gác mặc định',
            onclick: () => void closeToDefaultCat(),
          },
          'Đóng',
        ),
      ),
    );
    bindDragHandle(liveHead);

    const tabsNav = h(
      'div',
      { class: 'detail-tabs', role: 'tablist' },
      h(
        'button',
        {
          class: `tab-btn${detailTab === 'overview' ? ' active' : ''}`,
          onclick: () => {
            detailTab = 'overview';
            renderWidget();
          },
        },
        'Tổng quan',
      ),
      h(
        'button',
        {
          class: `tab-btn${detailTab === 'evaluate' ? ' active' : ''}`,
          onclick: () => {
            detailTab = 'evaluate';
            renderWidget();
          },
        },
        `Đánh giá (${sigCount})`,
      ),
      h(
        'button',
        {
          class: `tab-btn${detailTab === 'analysis' ? ' active' : ''}`,
          onclick: () => {
            detailTab = 'analysis';
            renderWidget();
          },
        },
        'Phân tích',
      ),
    );

    const detailWrap = h(
      'div',
      { class: 'wrap' },
      h(
        'section',
        { class: 'live-card' },
        liveHead,
        tabsNav,
        detailTab === 'overview'
          ? renderOverviewTab(session)
          : detailTab === 'evaluate'
            ? renderEvaluateTab(session)
            : renderAnalysisTab(session),
      ),
    );

    mount.replaceChildren(detailWrap);
    requestAnimationFrame(updateWidgetPosition);
  }

  window.addEventListener('resize', () => updateWidgetPosition());
  window.addEventListener('scroll', () => updateWidgetPosition(), true);
  setInterval(() => {
    if (isDragging) return;
    if (session && dockedToChat && !session.waiting) {
      updateWidgetPosition();
    }
    if ((!session && !minimized) || session?.waiting) {
      const sig = probeThreads(probeLocal())
        .map((t) => `${t.threadId}:${t.threadLabel}`)
        .join('|');
      if (sig !== lastThreadSignature) {
        lastThreadSignature = sig;
        renderWidget();
      }
    }
  }, 400);

  chrome.storage?.session
    ?.get?.(SESSION_KEY)
    .then((res) => {
      session = (res?.[SESSION_KEY] as Session | undefined) ?? null;
      renderWidget();
    })
    .catch(() => renderWidget());

  chrome.storage?.session?.onChanged?.addListener?.((changes) => {
    if (SESSION_KEY in changes) {
      const prev = session;
      session = (changes[SESSION_KEY]?.newValue as Session | undefined) ?? null;
      if (!prev && session) {
        sessionViewMode = 'mini';
        dockedToChat = true;
      } else if (prev && !session) {
        chosenThreadId = null;
        hasScanned = true;
      }
      renderWidget();
    }
  });
}
