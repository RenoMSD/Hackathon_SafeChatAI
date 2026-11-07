# Hướng dẫn cài đặt & kiểm thử SafeChat AI (Developer mode)

## 1. Build

```bash
npm install
npm run build:extension
```

Kết quả nằm trong `apps/extension/dist/`.

## 2. Nạp extension vào Chrome

1. Mở `chrome://extensions`.
2. Bật **Developer mode** (góc trên bên phải).
3. Bấm **Load unpacked** và chọn thư mục `apps/extension/dist`.
4. Ghim biểu tượng SafeChat AI (hình khiên xanh) lên thanh công cụ.

Sau mỗi lần sửa code: chạy `npm run build:extension`, bấm nút ↻ của extension trong `chrome://extensions`, rồi **tải lại tab chat** để content script mới được nạp.

## 3. Chạy chat giả lập

```bash
npm run dev:extension
```

Mở `http://localhost:5178/mock-chat/`. Nếu cổng 5178 đang bận, Vite sẽ báo cổng khác.

## 4. Bật AI (tùy chọn)

Trong side panel, chọn **Cài đặt**:

| Tầng | Cách bật | Ghi chú |
|---|---|---|
| Bộ quy tắc | Luôn chạy | Miễn phí, chạy trên máy |
| Gemini Nano (trên máy) | Bấm **Tải mô hình & bật** | Cần Chrome máy tính, khoảng 22 GB trống, GPU trên 4 GB VRAM hoặc 16 GB RAM. Chỉ chạy khi side panel đang mở. Tiếng Việt chưa được hỗ trợ chính thức, nên đây là chế độ thử nghiệm (`en`). |
| Groq | Dán API key → **Bật Groq** → cho phép quyền `api.groq.com` | Mô hình nhỏ `llama-3.1-8b-instant` chạy mặc định; mô hình lớn `llama-3.3-70b-versatile` chỉ chạy khi mức ≥ Cần chú ý. Giới hạn lượt gọi mỗi ngày đặt trong Cài đặt. |

**Khi nào AI chạy:** khi mức cảnh báo tăng, khi có loại tín hiệu quy tắc mới, hoặc khi tích đủ N tin mới (mặc định 5). Hai lần gọi cách nhau ít nhất 10 giây.

**Gửi đi những gì:** chỉ các tin mới, kèm 4 tin ngữ cảnh và bản tóm tắt do AI viết lần trước. Số điện thoại, số tài khoản và email được che trước khi gửi.

## 5. Checklist kiểm thử thủ công

Dùng chat giả lập. Với mỗi bước, đánh dấu ✅ hoặc ❌.

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 1 | Mở side panel trên trang không hỗ trợ (ví dụ google.com) | Báo "chưa hỗ trợ"; nút Bắt đầu bị khóa |
| 2 | Mở chat giả lập, chưa tích đồng ý | Nút Bắt đầu bị khóa |
| 3 | Tích đồng ý → Bắt đầu theo dõi | Trạng thái "Đang theo dõi", đã ghi nhận 0 tin |
| 4 | Kịch bản `05` → Tự phát | Mức tăng dần lên **Cao**; tab Bằng chứng có thẻ "Lời nói về phí chưa nhất quán" với trích dẫn Trước/Sau |
| 5 | Bấm **Render lại DOM** nhiều lần | Số tin đã ghi nhận **không** tăng |
| 6 | Tab **Phân tích** | Có bảng cách tính điểm, thống kê theo nhóm, diễn biến theo thời gian |
| 7 | Đổi sang kịch bản `08` | Phiên tạm dừng với lý do "đã chuyển chat"; dữ liệu không bị trộn |
| 8 | Bấm "Xóa phiên này & theo dõi chat mới" → Tự phát | Mức **Nghiêm trọng**, khung "Ưu tiên an toàn", **không** có câu hỏi thăm dò |
| 9 | Tự gõ tin (người gửi "Tôi"): "có phải đặt cọc không ạ?" | Không gắn cờ tin của bạn |
| 10 | Tab Bản nháp → Xuất HTML / JSON | File tải về mở được; nội dung đúng phạm vi đã chọn |
| 11 | Đánh dấu một tín hiệu "Không liên quan" | Thẻ tín hiệu mờ đi; điểm không đổi; báo cáo xuất có ghi nhãn |
| 12 | Tạm dừng → gửi thêm tin → Tiếp tục | Tin gửi trong lúc tạm dừng không được tính; tin sau khi tiếp tục được tính |
| 13 | Đóng tab chat | Side panel báo "Tạm dừng — tab đã đóng" |
| 14 | **Dừng và xóa phiên** | Có thông báo đã xóa. Kiểm tra trong DevTools của service worker: `chrome.storage.session.get(null)` trả về `{}` |
| 15 | (Groq) Bật Groq, chạy kịch bản `03` | Dòng trạng thái AI hiện "Groq (mô hình lớn)"; tab Phân tích có tóm tắt AI; số lượt hôm nay tăng |
| 16 | (Groq) Nhập key sai | Báo "API key Groq không hợp lệ (401)"; kết quả quy tắc giữ nguyên |
| 17 | (Nano) Bật AI trên máy, giữ side panel mở, chạy một kịch bản | Trạng thái AI hiện "Gemini Nano trên máy" (hoặc lỗi kèm chuyển sang Groq) |
| 18 | Kịch bản `16_tc01_task_freeze` | **Nghiêm trọng**, khung an toàn hướng dẫn *dừng giao dịch / gọi ngân hàng* (không phải hướng dẫn di chuyển) |
| 19 | Kịch bản `17_tc02_police_apk` | **Nghiêm trọng**; tab Bằng chứng có thẻ R02 và "Đường link đáng ngờ" |
| 20 | Kịch bản `20_tc05_shop_deposit` | **Thấp**; thẻ "Đặt cọc trong giao dịch thông thường" có nhãn *Đã hạ mức theo ngữ cảnh* |
| 21 | Kịch bản `24_r03_task_ctv` → tab Phân tích | "Tiến trình kịch bản" sáng S1 → S2 → S3; "Vì sao" có dòng cộng điểm giai đoạn |
| 22 | Kịch bản `21_r01_police_scam` | Thẻ R01 dẫn chứng cả tin 1 và tin 3 (luật ghép nhiều tin) |
| 23 | Theo dõi một kịch bản lên mức Cao → tab Bản nháp → **Lưu phiên (.json)** → Dừng và xóa → mở lại side panel → tích đồng ý → **Tiếp tục từ bản nháp** chọn file → Tiếp tục phiên này | Phiên quay lại đủ tin, bằng chứng, đánh dấu; đầu phiên ghi "Tiếp tục từ bản nháp lưu lúc …"; phát thêm tin → chỉ tin mới được thêm (không trùng) |
| 24 | Sửa tay 1 chữ trong file phiên .json rồi chọn file đó | Báo "File đã bị chỉnh sửa hoặc hỏng", không khôi phục |
| 25 | Kịch bản `08_secrecy_family` (Nghiêm trọng) → gõ thêm vài tin bình thường từ phía đối phương | Mức **giữ** Nghiêm trọng, có dòng "Giữ mức Nghiêm trọng…", hướng dẫn an toàn vẫn hiện |
| 26 | Kịch bản `41_borrow_verified_small` → Tự phát | Sau tin nhờ mượn: **Cần chú ý**; sau khi "Tôi" xác nhận cuộc gọi: hiện dòng "Giữ mức Cần chú ý: cần thêm 1 lần đánh giá…"; tin kế tiếp: hạ về **Thấp**, thẻ "Mượn tiền sau khi đã xác minh người thật" có nhãn *Đã hạ mức theo ngữ cảnh* |
| 27 | Kịch bản `45_borrow_forged_call` (kẻ gian tự gõ "[cuộc gọi]") | Vẫn **Cao**, không hạ mức |
| 28 | Facebook thật: mở 2 khung chat → Kiểm tra lại | Panel liệt kê 2 tên để chọn; chỉ cuộc được chọn được đọc |
| 29 | Đang theo dõi → đóng khung chat → mở lại | Panel hiện "Đang chờ mở lại khung chat", mở lại thì đọc tiếp, bản nháp không trùng tin |
| 30 | Facebook thật: kiểm tra bản nháp | Tin của mình là "Tôi", của đối phương là người kia; không lẫn chữ "Nhập, bản sao trợ năng" |

**Xem log:** vào `chrome://extensions`, bấm **service worker** để mở DevTools của background. Mở DevTools của side panel bằng cách chuột phải vào panel và chọn **Inspect**. Extension không ghi nội dung chat ra console.

## 6. Messenger thật (thử nghiệm)

Messenger web hiện chỉ còn **khung chat popup** trên facebook.com. Mở khung chat (không thu nhỏ) → panel → Kiểm tra lại → (đang mở nhiều khung thì chọn một người) → Bắt đầu theo dõi.
- Cuộc trò chuyện được xác định bằng ID tài khoản người kia (link ở phần đầu khung), không bằng tên; mọi mã tin phải khớp ID đó, lệch là bộ đọc tự ngừng và báo trong panel.
- Đóng khung chat: phiên được giữ ở trạng thái **Đang chờ mở lại khung chat**; mở lại đúng người đó thì đọc tiếp. Mở thêm khung khác không ảnh hưởng.
- Chat nhóm, ảnh/sticker/tin thoại: chưa hỗ trợ.
- Selector dò trên giao diện thật 11/2026 (`apps/extension/dev/dom-probe.js`, chỉ in cấu trúc). Facebook đổi giao diện → chạy lại script và chỉnh `apps/extension/src/content/messengerAdapter.ts`.
