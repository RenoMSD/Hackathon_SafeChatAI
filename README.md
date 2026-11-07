# SafeChat AI

**Nhìn rõ trước khi tin.** Công cụ giúp người dùng nhận biết dấu hiệu lừa đảo tuyển dụng, dụ dỗ và nguy cơ mua bán người trong hội thoại, kèm bằng chứng trích từ chính tin nhắn và hướng dẫn an toàn.

Nhóm **Git Push & Pray**. Đây là prototype. SafeChat AI đưa ra *dấu hiệu cần xác minh*, không kết luận ai là tội phạm và không bảo đảm một cuộc trò chuyện là an toàn.

## Bắt đầu

Cần Node.js 20 trở lên.

```bash
npm install
```

```bash
npm run check
```

Lệnh `check` chạy typecheck, test, eval so với mốc và build extension. Phải xanh trước khi tạo PR.

**Đọc tiếp:** [Kế hoạch 12 giờ và phân công](docs/04_KE_HOACH_12H.md) · [Kiến trúc](docs/03_KIEN_TRUC_MUC_TIEU.md) · [Quy tắc phát triển](docs/quy-tac-phat-trien.md)

## Nhánh và phân công

| Nhánh | Người | Phạm vi |
|---|---|---|
| `main` | Cả nhóm | Luôn xanh. Chỉ nhận thay đổi qua PR |
| `duy/ai-eval` | Duy | `packages/core`, `research`, `fixtures`, `scripts` |
| `danh/gateway-aws` | Danh | `services/gateway`, `infra`, workflow CI và deploy |
| `dat/clients` | Đạt | `apps/extension`, `apps/web`, `apps/mobile`, workflow Android |

`packages/contracts` là hợp đồng API dùng chung, đổi phải báo cả nhóm.

## Cấu trúc

```
packages/core/       logic phân tích thuần: chuẩn hóa, luật, Claim Ledger, chấm điểm, giai đoạn, chống dao động, AI
packages/contracts/  hợp đồng API và phản hồi mẫu
apps/extension/      Chrome Extension MV3
apps/web/            màn hình kiểm tra đoạn chat
apps/mobile/         app Android bọc apps/web
services/gateway/    AI Gateway trên AWS Lambda
infra/               hạ tầng AWS
research/            khung đánh giá (dữ liệu không nằm trong repo)
fixtures/            bộ tình huống và mốc chất lượng
docs/                kế hoạch, kiến trúc, quy tắc
```

## Lệnh thường dùng

| Lệnh | Việc |
|---|---|
| `npm test` | Chạy test |
| `npm run eval` | Chấm bộ tình huống |
| `npm run build:extension` | Build vào `apps/extension/dist` |
| `npm run dev:extension` | Chat giả lập tại `http://localhost:5178/mock-chat/` |

## Nguyên tắc không được vi phạm

- Không bật AI thì không có dữ liệu nào rời thiết bị. Không log nội dung chat, ở cả client lẫn server.
- Dùng "có dấu hiệu", không kết luận tội phạm. Điểm là điểm dấu hiệu, không phải xác suất.
- Trích dẫn của AI phải khớp tin gốc. AI một mình không đẩy lên Nghiêm trọng, chỉ hạ tối đa 1 bậc và không hạ từ Nghiêm trọng.
- Không tự gửi tin nhắn. Ở mức Nghiêm trọng, ưu tiên hướng dẫn an toàn.

Chi tiết ở [docs/quy-tac-phat-trien.md](docs/quy-tac-phat-trien.md).

---

Nếu bạn đang gặp tình huống nguy hiểm: không chuyển tiền, không giao giấy tờ gốc, không đi theo yêu cầu. Liên hệ người thân tin cậy và công an nơi gần nhất (**113**).
