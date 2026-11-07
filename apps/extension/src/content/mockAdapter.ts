// Adapter cho trang chat giả lập (mock-chat/) — cấu trúc DOM ổn định, dùng để demo và kiểm thử.
import type { Sender } from '@safechat/core/types';
import type { ChatAdapter } from './adapter';

const ROOT = '[data-safechat-mock-thread]';

function current() {
  const el = document.querySelector<HTMLElement>(ROOT);
  const id = el?.dataset.safechatMockThread;
  return el && id ? { el, threadId: `mock:${id}`, threadLabel: el.dataset.threadLabel ?? id } : null;
}

export const mockAdapter: ChatAdapter = {
  platform: 'mock',
  keepsSelection: false,

  listThreads() {
    const c = current();
    return c ? [{ threadId: c.threadId, threadLabel: c.threadLabel }] : [];
  },

  readMessages(threadId) {
    const c = current();
    if (!c || c.threadId !== threadId) return { messages: [] };
    return {
      messages: [...c.el.querySelectorAll<HTMLElement>('[data-msg]')].map((el) => ({
        sender: (el.dataset.sender as Sender | undefined) ?? 'unknown',
        text: el.querySelector('.text')?.textContent ?? el.textContent ?? '',
        // Cố ý KHÔNG dùng domId để kiểm thử cơ chế khử trùng lặp theo nội dung
      })),
    };
  },

  observeRoot(threadId) {
    const c = current();
    return c?.threadId === threadId ? c.el : null;
  },

  getThreadRect(threadId) {
    const c = current();
    if (!c || c.threadId !== threadId) return null;
    const chatBox = c.el.closest<HTMLElement>('.chat') ?? c.el;
    return chatBox.getBoundingClientRect();
  },
};
