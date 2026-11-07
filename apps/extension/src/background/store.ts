// Lưu trữ: phiên trong chrome.storage.session (chỉ nằm trong bộ nhớ, tự mất khi đóng trình duyệt);
// cài đặt trong chrome.storage.local. Không ghi nội dung chat vào log.
import { DEFAULT_SETTINGS, SESSION_KEY, SETTINGS_KEY, type Session, type Settings } from '../shared/protocol';

export async function loadSession(): Promise<Session | null> {
  const r = await chrome.storage.session.get(SESSION_KEY);
  return (r[SESSION_KEY] as Session | undefined) ?? null;
}

export async function saveSession(s: Session): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: s });
}

/** Xóa toàn bộ dữ liệu phiên rồi đọc lại để xác nhận; trả về các khóa còn sót. */
export async function clearSessionVerified(): Promise<string[]> {
  await chrome.storage.session.clear();
  const left = await chrome.storage.session.get(null);
  return Object.keys(left);
}

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((r[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}
