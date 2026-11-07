# Gateway

Phụ trách: **Danh**, nhánh `danh/gateway-aws`.

Hono-like (native Node http) trên AWS Lambda. Thiết kế ở [docs/03](../../docs/03_KIEN_TRUC_MUC_TIEU.md), việc cần làm ở [docs/04](../../docs/04_KE_HOANG_12H.md).

## Quy ước

- Đúng hợp đồng trong `@safechat/contracts`. Đổi hợp đồng phải báo cả nhóm và đi bằng PR riêng vào `main`.
- Gọi `buildAiRequest` và `parseAiResponse` của `@safechat/core/ai`, không viết lại prompt hay phần kiểm tra trích dẫn ở đây.
- Model lấy từ biến môi trường `MODEL_SMALL`, `MODEL_LARGE`.
- Không log nội dung tin nhắn, prompt hay trích dẫn.
- Lỗi trả đúng dạng `ApiError`.
- Test đặt trong `tests/`, được `npm test` ở thư mục gốc tự chạy.

## Endpoint

| Phương thức | Đường dẫn | Việc |
|---|---|---|
| GET | `/healthz` | Kiểm tra sống và sẵn sàng |
| POST | `/v1/devices` | Cấp token ẩn danh ngắn hạn |
| POST | `/v1/analyses` | Phân tích delta, gọi Bedrock, kiểm tra trích dẫn |
| POST | `/v1/feedback` | Ghi feedback (không có nội dung tin nhắn) |
| GET | `/v1/metrics/summary` | Số liệu tổng hợp công khai |

## Cấu trúc

```
services/gateway/
  src/index.ts      Điểm vào gateway (native http, routing)
  build.mjs         Build dist cho Lambda
  tests/            Vitest (chạy bằng npm test gốc)
```

## Triển khai

- Hạ tầng: `infra/template.yaml` (AWS SAM, stack `safechat-staging`, `safechat-prod`, vùng `ap-northeast-1`)
- CI: `.github/workflows/ci.yml` (ESLint, gitleaks, typecheck, test, eval, build)
- CD: `.github/workflows/deploy.yml` (GitHub OIDC tới AWS, deploy staging + smoke test)

Không commit access key, tên tài khoản hay giá trị bí mật. Deploy qua GitHub OIDC.
