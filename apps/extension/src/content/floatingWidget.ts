// Widget nổi trên trang. Shadow DOM `closed`; không dùng innerHTML; không can thiệp DOM của Messenger.
// Widget CHỈ nhận RiskBadge (mức, điểm, trạng thái). Không đọc storage, không đọc Session,
// không có transcript, bằng chứng, tên người gửi, lời khuyên hay giao diện đồng ý.
import { RISK_LEVEL_LABEL, RISK_LEVEL_ORDER, type RiskLevel } from '@safechat/core/types';
import type { RiskBadge } from '../shared/protocol';

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  right: 18px;
  bottom: 64px;
  z-index: 2147483640;
  font: 13px/1.45 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: #161e2e;
}
* { box-sizing: border-box; }
@keyframes float-breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes pulse-dot {
  0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.55); }
  70% { box-shadow: 0 0 0 6px rgba(22, 163, 74, 0); }
  100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
}
@keyframes pop-in {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.orb-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 13px 7px 9px;
  border-radius: 99px;
  border: 1px solid #dbeafe;
  background: #ffffff;
  color: #161e2e;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 12px 28px -6px rgba(29, 78, 216, 0.28), 0 4px 10px -2px rgba(22, 30, 46, 0.08);
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms ease;
}
.orb-btn:hover { transform: translateY(-2px) scale(1.02); }
.orb-pct {
  padding: 2px 7px;
  border-radius: 99px;
  font-size: 11.5px;
  font-weight: 800;
}
.orb-pct.low { background: #dcfce7; color: #16a34a; }
.orb-pct.attention { background: #dbeafe; color: #2563eb; }
.orb-pct.high { background: #ffedd5; color: #ea580c; }
.orb-pct.critical { background: #fee2e2; color: #dc2626; }

.wrap {
  width: 348px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: pop-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.icon-btn {
  width: 26px; height: 26px;
  border-radius: 7px;
  border: 1px solid #e1e7f0;
  background: #f7f9fc;
  color: #5a6578;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

/* Peeking Bar & Live Widget */
.peek-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 10px;
  margin-bottom: -18px;
  position: relative;
  z-index: 3;
  pointer-events: none;
}
.status-pill {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ffffff;
  border: 1px solid #e1e7f0;
  border-radius: 99px;
  padding: 4px 11px;
  font-size: 11.5px;
  font-weight: 600;
  box-shadow: 0 6px 14px -4px rgba(22, 30, 46, 0.12);
  margin-bottom: 14px;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: #16a34a; animation: pulse-dot 2s infinite; }
.dot.paused { background: #d97706; animation: none; }

.live-card {
  background: #ffffff;
  border: 1px solid #e1e7f0;
  border-radius: 20px;
  padding: 13px;
  box-shadow: 0 18px 40px -10px rgba(22, 30, 46, 0.16), 0 4px 12px -2px rgba(22, 30, 46, 0.06);
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.live-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid #e1e7f0;
}
.live-title { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 15px; }
.badge-live {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 6px;
  background: #16a34a;
  color: #fff;
}
.badge-live.paused { background: #d97706; }
.win-btns { display: flex; gap: 5px; }

.dash-2col {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 8px;
}
.sub-card {
  background: #f7f9fc;
  border: 1px solid #e1e7f0;
  border-radius: 14px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.gauge-box { position: relative; width: 118px; height: 96px; display: flex; align-items: center; justify-content: center; }
.gauge-center {
  position: absolute;
  inset: 14px 0 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.pct-num { font-size: 25px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.risk-pill {
  margin-top: 4px;
  padding: 3px 9px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
}
.risk-pill.low { background: #dcfce7; color: #16a34a; }
.risk-pill.attention { background: #dbeafe; color: #2563eb; }
.risk-pill.high { background: #ffedd5; color: #ea580c; }
.risk-pill.critical { background: #fee2e2; color: #dc2626; }

.tiers-list { align-items: stretch; justify-content: space-between; gap: 5px; }
.tier-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 7px;
  border-radius: 99px;
  font-size: 11.5px;
  transition: background-color 250ms ease, transform 220ms ease;
}
.tier-item.active { font-weight: 700; transform: scale(1.02); }
.tier-item.critical.active { background: #fee2e2; }
.tier-item.high.active { background: #ffedd5; }
.tier-item.attention.active { background: #dbeafe; }
.tier-item.low.active { background: #dcfce7; }
.tdot { width: 12px; height: 12px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 5px; }
.tdot::after { content: ''; width: 4px; height: 4px; border-radius: 50%; background: #fff; }
.tdot.critical { background: #dc2626; }
.tdot.high { background: #f59e0b; }
.tdot.attention { background: #3b82f6; }
.tdot.low { background: #16a34a; }
.segs { display: inline-flex; gap: 2.5px; }
.seg { width: 5.5px; height: 12px; border-radius: 3px; background: #dfe5ef; transition: background-color 300ms ease; }
.seg.on.critical { background: #dc2626; }
.seg.on.high { background: #f59e0b; }
.seg.on.attention { background: #3b82f6; }
.seg.on.low { background: #16a34a; }


.note { font-size: 11px; color: #64748b; text-align: center; line-height: 1.35; }
`;

function catPeekSvg(): SVGElement {
  return svg(
    'svg',
    { viewBox: '0 0 120 68', width: 78, height: 48, class: 'cat-anim', 'aria-hidden': 'true' },
    svg('polygon', { points: '28,38 22,10 46,24', fill: '#1e2433' }),
    svg('polygon', { points: '30,35 26,15 43,25', fill: '#fda4af' }),
    svg('polygon', { points: '92,38 98,10 74,24', fill: '#1e2433' }),
    svg('polygon', { points: '90,35 94,15 77,25', fill: '#fda4af' }),
    svg('ellipse', { cx: 60, cy: 46, rx: 34, ry: 25, fill: '#1e2433' }),
    svg('path', { d: 'M60 32 L42 58 Q60 66 78 58 Z', fill: '#ffffff' }),
    svg('circle', { cx: 46, cy: 43, r: 6, fill: '#facc15' }),
    svg('circle', { cx: 46, cy: 43, r: 3.2, fill: '#111827' }),
    svg('circle', { cx: 74, cy: 43, r: 6, fill: '#facc15' }),
    svg('circle', { cx: 74, cy: 43, r: 3.2, fill: '#111827' }),
    svg('ellipse', { cx: 60, cy: 50, rx: 3.2, ry: 2.3, fill: '#fb7185' }),
    svg('ellipse', { cx: 30, cy: 60, rx: 11, ry: 6.5, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.2 }),
    svg('ellipse', { cx: 90, cy: 60, rx: 11, ry: 6.5, fill: '#ffffff', stroke: '#cbd5e1', 'stroke-width': 1.2 }),
  );
}

const STROKE_COLOR: Record<RiskLevel, string> = {
  low: '#16a34a',
  attention: '#3b82f6',
  high: '#f59e0b',
  critical: '#dc2626',
};

const PILL_TEXT: Record<RiskLevel, string> = {
  low: '✓ Chưa thấy dấu hiệu rõ',
  attention: 'ℹ️ Cần chú ý xác minh',
  high: '⚠️ Có dấu hiệu rủi ro',
  critical: '🚨 Rủi ro rất cao',
};

function segCountFor(level: RiskLevel, score: number, rowLevel: RiskLevel): number {
  const cur = RISK_LEVEL_ORDER[level];
  const row = RISK_LEVEL_ORDER[rowLevel];
  if (rowLevel === level) {
    if (rowLevel === 'critical') return 4;
    if (rowLevel === 'high') return score >= 80 ? 4 : 3;
    if (rowLevel === 'attention') return score >= 45 ? 3 : 2;
    return score > 0 ? 2 : 1;
  }
  return row < cur ? (rowLevel === 'low' ? 1 : 2) : 0;
}

export interface FloatingWidget {
  update(badge: RiskBadge): void;
  destroy(): void;
}

let active: FloatingWidget | null = null;

/** Tạo widget; nếu đang có một widget thì trả về chính nó (không tạo trùng). */
export function initFloatingWidget(initial: RiskBadge): FloatingWidget | null {
  if (active) {
    active.update(initial);
    return active;
  }
  if (typeof document === 'undefined' || !document.body) return null;

  const host = document.createElement('div');
  // `closed`: script của trang không lấy được host.shadowRoot (sẽ là null). Không lưu `shadow` ở đâu ngoài closure này.
  const shadow = host.attachShadow({ mode: 'closed' });
  const styleEl = document.createElement('style');
  styleEl.textContent = WIDGET_CSS;
  const mount = document.createElement('div');
  shadow.append(styleEl, mount);
  document.body.append(host);

  let badge = initial;
  let minimized = false;
  let animScore = 0;
  let rafId = 0;

  function render() {
    const { level: lv, score: targetScore } = badge;

    if (minimized) {
      mount.replaceChildren(
        h(
          'button',
          {
            class: 'orb-btn',
            title: 'Mở SafeChat AI',
            onclick: () => {
              minimized = false;
              render();
            },
          },
          h('span', {}, '🛡️ SafeChat AI'),
          h('span', { class: `orb-pct ${lv}` }, `${targetScore}% · ${RISK_LEVEL_LABEL[lv]}`),
        ),
      );
      return;
    }

    const radius = 42;
    const circum = 2 * Math.PI * radius;
    const arcLen = (240 / 360) * circum;
    const startOff = arcLen - (animScore / 100) * arcLen;
    const endOff = arcLen - (targetScore / 100) * arcLen;
    const track = svg('circle', {
      cx: 59, cy: 54, r: radius, fill: 'none', stroke: '#e1e7f0', 'stroke-width': 9, 'stroke-linecap': 'round',
      'stroke-dasharray': `${arcLen} ${circum}`, transform: 'rotate(150 59 54)',
    });
    const arc = svg('circle', {
      cx: 59, cy: 54, r: radius, fill: 'none', stroke: STROKE_COLOR[lv], 'stroke-width': 9, 'stroke-linecap': 'round',
      'stroke-dasharray': `${arcLen} ${circum}`, 'stroke-dashoffset': String(startOff),
      style: 'transition: stroke-dashoffset 650ms cubic-bezier(0.22, 1, 0.36, 1), stroke 350ms ease',
      transform: 'rotate(150 59 54)',
    });
    const pctText = h('div', { class: 'pct-num' }, `${Math.round(animScore)}%`);
    requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', String(endOff)));
    cancelAnimationFrame(rafId);
    const fromVal = animScore;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 550);
      animScore = fromVal + (targetScore - fromVal) * (1 - Math.pow(1 - p, 3));
      pctText.textContent = `${Math.round(animScore)}%`;
      if (p < 1) rafId = requestAnimationFrame(step);
      else animScore = targetScore;
    };
    rafId = requestAnimationFrame(step);

    const paused = !badge.tracking;
    const statusText = badge.tracking ? 'Đang theo dõi tin nhắn...' : badge.waiting ? 'Chờ mở lại khung chat' : 'Tạm dừng theo dõi';
    const liveText = badge.tracking ? 'LIVE' : badge.waiting ? 'CHỜ' : 'PAUSED';
    const tierRows: { level: RiskLevel; label: string }[] = [
      { level: 'critical', label: 'Rất cao' },
      { level: 'high', label: 'Cao' },
      { level: 'attention', label: 'Trung bình' },
      { level: 'low', label: 'Thấp' },
    ];

    mount.replaceChildren(
      h(
        'div',
        { class: 'wrap' },
        h(
          'div',
          { class: 'peek-bar' },
          catPeekSvg(),
          h('div', { class: 'status-pill' }, h('span', { class: `dot${paused ? ' paused' : ''}` }), statusText),
        ),
        h(
          'section',
          { class: 'live-card' },
          h(
            'div',
            { class: 'live-head' },
            h('div', { class: 'live-title' }, h('span', {}, '🛡️ SafeChat AI'), h('span', { class: `badge-live${paused ? ' paused' : ''}` }, liveText)),
            h(
              'div',
              { class: 'win-btns' },
              h(
                'button',
                {
                  class: 'icon-btn',
                  title: 'Thu nhỏ thành nút nổi',
                  onclick: () => {
                    minimized = true;
                    render();
                  },
                },
                '—',
              ),
            ),
          ),
          h(
            'div',
            { class: 'dash-2col' },
            h(
              'div',
              { class: 'sub-card' },
              h('div', { class: 'gauge-box' }, svg('svg', { viewBox: '0 0 118 102', width: 118, height: 102 }, track, arc), h('div', { class: 'gauge-center' }, pctText)),
              h('div', { class: `risk-pill ${lv}` }, PILL_TEXT[lv]),
            ),
            h(
              'div',
              { class: 'sub-card tiers-list' },
              ...tierRows.map(({ level, label }) => {
                const lit = segCountFor(lv, targetScore, level);
                return h(
                  'div',
                  { class: `tier-item ${level}${lv === level ? ' active' : ''}` },
                  h('span', { style: 'display:inline-flex;align-items:center' }, h('span', { class: `tdot ${level}` }), label),
                  h('span', { class: 'segs' }, ...[0, 1, 2, 3].map((i) => h('span', { class: `seg ${level}${i < lit ? ' on' : ''}` }))),
                );
              }),
            ),
          ),
          h('div', { class: 'note' }, 'Chi tiết và bằng chứng xem trong bảng bên (side panel). Khung này chỉ hiện mức và điểm.'),
        ),
      ),
    );
  }

  const api: FloatingWidget = {
    update(next) {
      badge = next;
      render();
    },
    destroy() {
      cancelAnimationFrame(rafId);
      host.remove();
      if (active === api) active = null;
    },
  };
  active = api;
  render();
  return api;
}