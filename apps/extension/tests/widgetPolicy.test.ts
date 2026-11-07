import { describe, expect, it } from 'vitest';
import { INITIAL_BADGE, normalizeBadge, widgetAction } from '../src/content/widgetPolicy';

const risk = (over: Record<string, unknown> = {}) => ({
    kind: 'cs_risk_update' as const,
    risk: { level: 'high', score: 66, tracking: true, ...over } as never,
});

describe('widget — chỉ hiện sau khi bắt đầu, không tự hiện khi tải trang', () => {
    it('chưa có widget: cs_probe và các thông điệp khác không tạo widget', () => {
        expect(widgetAction({ kind: 'cs_probe' }, false)).toEqual({ type: 'none' });
        expect(widgetAction({ kind: 'cs_stop' }, false)).toEqual({ type: 'none' });
    });

    it('cs_start → hiện widget với mức thấp, điểm 0', () => {
        expect(widgetAction({ kind: 'cs_start', threadId: 'x' }, false)).toEqual({ type: 'show', badge: INITIAL_BADGE });
        expect(widgetAction({ kind: 'cs_start', threadId: 'x' }, true).type).toBe('update');
    });

    it('cs_risk_update: đang theo dõi → hiện/cập nhật; không theo dõi và chưa có widget → không hiện', () => {
        expect(widgetAction(risk(), false).type).toBe('show'); // khôi phục sau khi tải lại trang
        expect(widgetAction(risk(), true).type).toBe('update');
        expect(widgetAction(risk({ tracking: false }), false)).toEqual({ type: 'none' });
        expect(widgetAction(risk({ tracking: false, waiting: true }), true).type).toBe('update');
    });

    it('cs_stop → gỡ widget', () => {
        expect(widgetAction({ kind: 'cs_stop' }, true)).toEqual({ type: 'hide' });
    });

    it('dữ liệu sai dạng bị bỏ qua, điểm bị chặn trong 0–100', () => {
        expect(widgetAction(risk({ level: 'bogus' }), true)).toEqual({ type: 'none' });
        expect(widgetAction(risk({ score: 'abc' }), false)).toEqual({ type: 'none' });
        expect(normalizeBadge({ level: 'high', score: 250.6, tracking: true })).toEqual({
            level: 'high', score: 100, tracking: true, waiting: undefined,
        });
        expect(normalizeBadge(null)).toBeNull();
    });

    it('chỉ giữ đúng 4 trường; trường lạ (kể cả nội dung) bị bỏ', () => {
        const b = normalizeBadge({ level: 'low', score: 3, tracking: true, text: 'Chuyển khoản 0912345678', threadLabel: 'Người A' });
        expect(Object.keys(b!).sort()).toEqual(['level', 'score', 'tracking', 'waiting']);
        expect(JSON.stringify(b)).not.toContain('0912');
        expect(JSON.stringify(b)).not.toContain('Người A');
    });
});