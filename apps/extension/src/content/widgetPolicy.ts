// Quyết định thuần (không đụng DOM) về việc tạo / cập nhật / gỡ widget, để kiểm thử được.
// Nguyên tắc: widget KHÔNG BAO GIỜ tự xuất hiện khi tải trang. Chỉ hiện sau cs_start
// (background chỉ gửi sau khi người dùng đồng ý và bấm bắt đầu) hoặc cs_risk_update của phiên đang theo dõi.
import { RISK_LEVEL_ORDER } from '@safechat/core/types';
import type { ContentRequest, RiskBadge } from '../shared/protocol';

export const INITIAL_BADGE: RiskBadge = { level: 'low', score: 0, tracking: true };

export type WidgetAction =
    | { type: 'none' }
    | { type: 'show'; badge: RiskBadge }
    | { type: 'update'; badge: RiskBadge }
    | { type: 'hide' };

/** Kiểm tra dữ liệu nhận từ background; trả null nếu sai dạng (không tin kiểu tĩnh). */
export function normalizeBadge(raw: unknown): RiskBadge | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.level !== 'string' || !(r.level in RISK_LEVEL_ORDER)) return null;
    if (typeof r.score !== 'number' || !Number.isFinite(r.score)) return null;
    return {
        level: r.level as RiskBadge['level'],
        score: Math.max(0, Math.min(100, Math.round(r.score))),
        tracking: r.tracking === true,
        waiting: r.waiting === true ? true : undefined,
    };
}

export function widgetAction(req: ContentRequest, visible: boolean): WidgetAction {
    switch (req.kind) {
        case 'cs_start':
            return visible ? { type: 'update', badge: INITIAL_BADGE } : { type: 'show', badge: INITIAL_BADGE };
        case 'cs_stop':
            return visible ? { type: 'hide' } : { type: 'none' };
        case 'cs_risk_update': {
            const badge = normalizeBadge(req.risk);
            if (!badge) return { type: 'none' };
            if (visible) return { type: 'update', badge };
            return badge.tracking ? { type: 'show', badge } : { type: 'none' };
        }
        default:
            return { type: 'none' };
    }
}