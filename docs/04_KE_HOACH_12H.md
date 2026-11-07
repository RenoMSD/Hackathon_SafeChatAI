# Kế hoạch 12 giờ và phân công

Ba người làm độc lập trên 3 nhánh, ghép vào `main` ở 3 mốc cố định. Kiến trúc ở [03_KIEN_TRUC_MUC_TIEU.md](03_KIEN_TRUC_MUC_TIEU.md). Hợp đồng API ở [`packages/contracts`](../packages/contracts/src/index.ts).

**H0** là lúc cả nhóm bắt đầu. Hỗ trợ AI rút ngắn được phần viết code, nhưng **không rút ngắn được** phần tạo khóa Groq, kiểm tra hạn mức, gán nhãn, thử trên điện thoại và luyện demo. Các việc đó phải bắt đầu đúng giờ.

Giai đoạn hiện tại chạy **local-first + Groq `openai/gpt-oss-120b`**, chưa dùng AWS thật. Hạ tầng SAM giữ sẵn cho giai đoạn sau.

## Phạm vi: đây là bài thi

Chỉ làm những gì phục vụ **bảo mật** và **tiêu chí chấm**. Demo dùng dữ liệu giả lập, không vận hành với người dùng thật.

| Giữ, vì nằm trong tiêu chí chấm | Bỏ, không mất thời gian |
|---|---|
| Không lộ khóa, HTTPS, CORS, IAM quyền tối thiểu | Rà soát điều khoản Meta, Chrome Web Store, Google Play |
| Che PII, không log nội dung, rào chặn chèn lệnh, lọc đầu ra | Yêu cầu về vùng lưu dữ liệu và điều khoản model cho chat thật |
| Trích dẫn khớp tin gốc, giải thích được quyết định của AI | Hạn chế phát APK. Có thể gửi APK cho ban giám khảo nếu cần |
| Số liệu trung thực, tái lập được, nêu nguồn dữ liệu | Quy định phát hành sau cuộc thi |

Giai đoạn AWS (nếu bật) giữ vùng Tokyo. Giai đoạn hiện tại không phụ thuộc vùng AWS vì model chạy qua Groq.

## 1. Ai làm gì

| | **Duy** | **Danh** | **Đạt** |
|---|---|---|---|
| Vai trò | AI, dữ liệu, luật. Điều phối ghép nhánh | Backend, AWS, CI/CD | Extension, web, app Android |
| Nhánh | `duy/ai-eval` | `danh/gateway-aws` | `dat/clients` |
| Được sửa | `packages/core`, `research`, `fixtures`, `scripts` | `services/gateway`, `infra`, `.github/workflows/ci.yml`, `deploy.yml` | `apps/*`, `.github/workflows/android.yml` |
| Tiêu chí chính | III, VI | VII, IV.3, IV.4, IV.5 | II, IV.2, IV.6, V |
| Lý do | Dữ liệu nghiên cứu chỉ có trên máy Duy, không có trên repo public | Tách riêng, không phụ thuộc code khác ngoài hợp đồng | Dùng mock trong `packages/contracts` nên không phải chờ gateway |

Phân vai có thể đổi nếu nhóm muốn, miễn đổi cả cột.

### Quy tắc để làm độc lập

- Chỉ sửa thư mục của mình. Cần sửa thư mục người khác thì nhắn người đó.
- **File dùng chung** (`packages/contracts`, `package.json` gốc, `tsconfig.json`, `vitest.config.ts`, `docs/03`): làm PR riêng, nhỏ, vào `main` ngay, báo cả nhóm, rồi mọi người merge `main` về nhánh của mình.
- `package-lock.json` bị xung đột: nhận bản của `main`, chạy `npm install`, commit lại.
- Điểm ghép giữa các phần chỉ có 3 thứ:
  1. Hợp đồng API trong `packages/contracts`.
  2. Hàm `buildAiRequest` và `parseAiResponse` của `@safechat/core/ai`.
  3. Biến môi trường `MODEL_SMALL`, `MODEL_LARGE` của gateway. Duy chọn model, Danh chỉ cấu hình, không cần sửa code.

## 2. Mốc ghép

| Mốc | Duy | Danh | Đạt | Cả nhóm kiểm tra |
|---|---|---|---|---|
| **H1** | Có kết quả kiểm tra `gpt-oss-120b` qua Groq | Gateway local gọi được Groq bằng key của nhóm | Máy và công cụ sẵn sàng | Họp 10 phút, chốt hướng theo mục 5 |
| **M1: H3** | Trình chạy gọi được Groq | Gateway local có `/healthz`, CI xanh | APK khung cài được lên máy Duy | Đều xanh trên `main` |
| **M2: H6** | Xong vòng 1, chọn được model tạm | `/v1/analyses` chạy thật với Groq | App kiểm tra đoạn chat bằng luật, client chạy với mock | Gọi thật từ app tới gateway local |
| **Đóng băng: H7.5** | **Đóng băng luật, prompt, model** | Cấu hình model đã chọn | | Không gia hạn |
| **M3: H8.5** | Xong test cuối một lần | Gateway local ổn định; AWS chỉ deploy nếu còn thời gian | Extension và app trỏ tới gateway | Chạy trọn luồng demo |
| **H10** | | | | **Đóng băng code**, chỉ sửa lỗi chặn demo |
| **H12** | | | | Nộp bài. Dừng nhận thay đổi ở H11.5 |

Mỗi mốc ghép: tạo PR vào `main`, CI xanh, một người khác xem nhanh rồi merge. Duy điều phối thứ tự merge.

## 3. Việc của từng người

Tick vào ô của mình. Chỉ sửa phần của mình trong file này để tránh xung đột.

### Duy: `duy/ai-eval`

**H0–H1**
- [ ] Lấy key Groq của nhóm (không commit), chạy kiểm tra ở mục 5 với `openai/gpt-oss-120b`.
- [ ] Nhận credit GDP, ghi ngày hết hạn. Giữ để chạy đối chứng Gemini.

**H1–H3**
- [ ] Trình chạy: provider Groq và Gemini (đối chứng), ghi token và chi phí thật.
- [ ] Tách cố định tune 65 / check 40 của bộ v2, cùng nguồn đi chung, lưu manifest có mã băm.
- [ ] Gói gợi ý H2 từ luật: mã tin, giai đoạn, mâu thuẫn, thực thể, mức hiện tại.

**H3–H6: Vòng 1**
- [ ] Chạy mức trần với 3 kiểu gợi ý H0, H1, H2, rồi đi xuống các bậc model rẻ hơn.
- [ ] Phân loại lỗi trên tune. Sửa tối đa 5 luật, có tình huống thử theo cặp, eval không tụt.
- [ ] Báo Danh model tạm cho `MODEL_SMALL`, `MODEL_LARGE`.

**H6–H7.5: Vòng 2 và an toàn**
- [ ] Vòng 2 chỉ với model mạnh nhất và 2–3 model rút gọn. Trên check chỉ đọc số tổng.
- [ ] Bộ tấn công chèn lệnh ≥ 20 ca, chạy theo từng bậc model.
- [ ] Đo lượt và chi phí của `replay-hybrid` so với gọi AI mỗi tin.
- [ ] Chọn model theo tiêu chí đã viết trước, **đóng băng** và gắn tag.

**H7.5–H8.5: Số cuối**
- [ ] Chạy **một lần** trên SMS test, bộ nhóm test, bộ kín. Không sửa gì sau đó.

**H8.5–H12**
- [ ] `docs/MODEL_REPORT.md` và `docs/DATA_CARD.md`.
- [ ] Điều phối ghép M3, slide phần AI và dữ liệu, luyện phản biện.
- [ ] (P1) Đo thiên lệch theo nhóm kịch bản, giọng điệu, có dấu/không dấu.

### Danh: `danh/gateway-aws`

**H0–H1**
- [ ] Chạy gateway local với `AI_PROVIDER=groq`, key Groq đặt trong `.env` không commit; chạy kiểm tra ở mục 5.
- [ ] Nhận credit GDP.

**H1–H3**
- [ ] Gateway Hono local với `GET /healthz` và `GET /readyz`; template AWS SAM trong `infra/` giữ sẵn cho giai đoạn sau.
- [ ] `ci.yml`: gitleaks, typecheck, test, build (không bật ESLint khi chưa cấu hình).
- [ ] Ghi URL gateway local vào mục 6 của file này. **Đạt cần URL này ở M2.**

**H3–H6**
- [ ] `POST /v1/devices` và `POST /v1/analyses` đúng hợp đồng: kiểm tra schema, che PII lần hai, gọi Groq, kiểm tra trích dẫn bằng core.
- [ ] DynamoDB local hoặc store trong bộ nhớ: hạn mức thiết bị, bộ đếm chi tiêu, trần ngân sách tự ngắt.
- [ ] Không log nội dung chat. Có test cho việc này.

**H6–H8.5**
- [ ] `POST /v1/feedback`, `GET /v1/metrics/summary` (yêu cầu quyền admin).
- [ ] S3 + CloudFront cho bản web của Đạt (chỉ khi bật AWS).
- [ ] Nếu còn thời gian: deploy staging qua OIDC, tag `v0.5.0`, zip extension trong Release.
- [ ] Đo nhanh p50/p95 phần overhead của gateway.

**H8.5–H12**
- [ ] Rà bảo mật: npm audit, CORS, header, quyền IAM, log.
- [ ] Trước demo: gọi làm nóng, kiểm tra credit còn đủ.
- [ ] Ảnh bằng chứng cho tiêu chí VII. Slide phần kiến trúc và triển khai.

### Đạt: `dat/clients`

**H0–H1**
- [ ] Cài Node 20+, nhận credit GDP, chạy `npm install` và `npm run check`.

**H1–H3**
- [ ] `apps/mobile`: khung Capacitor Android bọc `apps/web`. `android.yml` xuất APK debug thành artifact. **Làm trước tính năng.**
- [ ] Gửi APK cho Duy cài thử. Quá H4 vẫn lỗi thì cài Android Studio.

**H3–H6**
- [ ] `apps/web`: màn hình kiểm tra đoạn chat, `@safechat/core` chạy trên thiết bị, dán hội thoại, đổi "Tôi / Đối phương" từng dòng, xem mức và bằng chứng.
- [ ] Nhận chia sẻ văn bản từ Messenger, Zalo qua Android share intent. Luôn còn đường dán thủ công.
- [ ] Client gateway dùng `@safechat/contracts/mock`, đổi sang URL staging ở M2.

**H6–H8.5**
- [ ] Extension gọi gateway, cập nhật màn hình đồng ý, bỏ yêu cầu Groq key.
- [ ] Sửa bảo mật widget: bỏ `TRUSTED_AND_UNTRUSTED_CONTEXTS`, background chỉ gửi mức và điểm, Shadow DOM `closed`.
- [ ] Thử mục 28–30 của `apps/extension/HUONG_DAN_CAI_DAT.md` trên Facebook thật, ghi lại kết quả.

**H8.5–H12**
- [ ] APK bản demo trỏ tới gateway của nhóm. Duy cài lại trên máy demo, giữ một file dự phòng.
- [ ] Quay video demo gồm extension và điện thoại.
- [ ] (P1) Dòng thời gian mức cảnh báo. Trang "7 kịch bản lừa đảo" có nguồn.
- [ ] (P1) Thử với 3–5 sinh viên, ghi độ dễ hiểu, xin đồng ý trước khi trích phản hồi.

### Việc chung

- [ ] (P1) **H5–H7: Bộ đề kín 15 ca** từ bài báo mới, để tăng độ tin cậy của số liệu cuối. Đạt chuyển thể, Danh và Đạt gán nhãn độc lập. Giữ ngoài repo, chuyển cho Duy dưới dạng file để chạy tự động. **Duy không đọc nội dung, không gán nhãn.**
- [ ] H1: quyết định `LICENSE` trước khi kết thúc, vì repo đang public.
- [ ] H10–H11.5: slide, kịch bản demo 3 phút, luyện ít nhất 2 lần trên đúng máy.

## 4. Đã cắt so với kế hoạch 24 giờ

| Bỏ hoặc thu nhỏ | Lý do |
|---|---|
| Vòng model thứ 3 | Không đủ thời gian. Tối đa 2 vòng |
| Ảnh chụp màn hình | Chuyển thành lộ trình |
| Guardrails, prompt caching của nhà cung cấp model | Làm nếu dư giờ, không ảnh hưởng luồng chính |
| Bộ đề kín 20–30 ca → 15 ca | Cỡ mẫu nhỏ hơn nên phải nói rõ khi báo cáo |
| Thử người dùng 5–10 → 3–5 người | Chỉ là tín hiệu định tính |
| Dashboard chạy thật | Dùng trang tĩnh |
| Tách `sidepanel/main.ts` | Không tăng giá trị demo |

**Không được cắt:** gateway thật gọi Groq, CI/CD, số AI thật, ít nhất 1 vòng model, APK chạy được với dán văn bản, báo cáo mô hình trung thực, video dự phòng. AWS production **đã hoãn** sang giai đoạn sau, không còn là điều kiện của bản demo hiện tại.

**Nếu chậm:**

| Lúc | Bỏ tiếp |
|---|---|
| H6 chưa xong vòng 1 | Bỏ vòng 2, chỉ giữ 3–4 model, đóng băng đúng H7.5 |
| H6 chưa có gateway thật | Đạt tiếp tục với mock, Duy hỗ trợ Danh 1 giờ |
| H8.5 chưa ghép xong | Bỏ mọi việc P1, ưu tiên một luồng demo chạy được |
| H10 còn lỗi ở share intent | Demo bằng dán thủ công |
| H10 Messenger thật lỗi | Demo extension bằng chat giả lập, nói rõ giới hạn |

## 5. Kiểm tra Groq ở H0–H1

Làm trước mọi việc khác. Dùng **key Groq của nhóm**, không commit key. Chỉ gửi dữ liệu giả.

1. Tạo key trong Groq Console, đặt vào `.env` local (`GROQ_API_KEY=...`), thêm `.env` vào `.gitignore`.
2. Chạy gateway với `AI_PROVIDER=groq`, `GROQ_MODEL_SMALL=openai/gpt-oss-120b`, `GROQ_MODEL_LARGE=openai/gpt-oss-120b`.
3. Gọi thử `POST /v1/analyses` bằng đoạn chat giả, mỗi tầng 3 lần. Kiểm tra JSON hợp lệ, trích dẫn khớp tin gốc, mức không tự lên Nghiêm trọng.
4. Xem hạn mức còn lại trong Groq Console. Ghi lại số lượt/token mỗi lần gọi vào `docs/MODEL_REPORT.md`.

| Kết quả | Hướng xử lý |
|---|---|
| Gọi được, JSON hợp lệ | Đi theo plan chính |
| Thỉnh thoảng lỗi JSON | Giữ parser nghiêm ngặt, ghi tỉ lệ; chỉ chấp nhận nếu ≥ 95% |
| 429 do hạn mức | Giảm số lượt/ngày trong Cài đặt, giữ backoff; không nâng plan nếu chưa bàn |
| Không gọi được vì mạng hoặc key | Demo bằng chế độ chỉ luật + Gemini Nano; nói rõ giới hạn |

**Không nâng plan trả phí hay phát sinh tiền thật nếu cả nhóm chưa đồng ý.** AWS (Bedrock, Lambda, staging) chỉ mở lại khi nhóm chuyển giai đoạn và đã xác nhận chi phí.

## 6. Thông tin dùng chung

Điền khi có. Không ghi khóa hay mật khẩu vào đây vì repo đang public.

| Mục | Giá trị |
|---|---|
| Hạn nộp | Chưa xác nhận |
| H0 | Chưa bắt đầu |
| URL gateway local | |
| URL staging (AWS, hoãn) | |
| URL bản web | |
| Model đã chọn | `openai/gpt-oss-120b` cho cả `small` và `large` |

## 7. Làm việc với git

```bash
git clone https://github.com/RenoMSD/Hackathon_SafeChatAI.git
```

```bash
cd Hackathon_SafeChatAI
```

```bash
npm install
```

```bash
npm run check
```

Chuyển sang nhánh của mình, ví dụ:

```bash
git switch dat/clients
```

Lấy thay đổi mới từ `main` về nhánh của mình, nên làm sau mỗi mốc ghép:

```bash
git fetch origin
```

```bash
git merge origin/main
```

- Không push thẳng vào `main`. Mọi thay đổi đi qua PR và `npm run check` phải xanh.
- Commit nhỏ theo từng việc, bằng tài khoản của chính mình, để lịch sử thể hiện đúng phân công.
- Không commit khóa, dữ liệu nghiên cứu, bộ đề kín, chat thật, APK. Repo đang **public**.
