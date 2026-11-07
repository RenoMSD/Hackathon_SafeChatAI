# Gateway

Phụ trách: **Danh**, nhánh `danh/gateway-aws`.

Hono + TypeScript trên AWS Lambda. Thiết kế ở [docs/03](../../docs/03_KIEN_TRUC_MUC_TIEU.md), việc cần làm ở [docs/04](../../docs/04_KE_HOACH_12H.md).

## Quy ước

- Đúng hợp đồng trong `@safechat/contracts`. Đổi hợp đồng phải báo cả nhóm.
- Gọi `buildAiRequest` và `parseAiResponse` của `@safechat/core/ai`, không viết lại prompt hay phần kiểm tra trích dẫn ở đây.
- Model lấy từ biến môi trường `MODEL_SMALL`, `MODEL_LARGE`.
- Không log nội dung tin nhắn, prompt hay trích dẫn.
- Lỗi trả đúng dạng `ApiError`.
- Test đặt trong `tests/`, được `npm test` ở thư mục gốc tự chạy.
