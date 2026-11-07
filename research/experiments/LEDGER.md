# Sổ thí nghiệm

Tự sinh bằng `npm run bench:experiment -- --ledger`. Không sửa tay. Cách đọc và quy tắc ở [README.md](README.md).

`Cao+` là cảnh báo từ mức Cao trở lên. `Bỏ sót` là ca nhãn từ Cao trở lên bị chấm dưới Cao. Mọi số là số dev.

| Mã | Nội dung | Cách suy luận | Commit | Tune: bỏ sót | Tune: báo nhầm Cao+ | Check: bỏ sót | Check: báo nhầm Cao+ | SMS BT Cao+ | SMS LĐ Cao+ | Lần xem check (cộng dồn) |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| [EXP-000](EXP-000/README.md) | Mốc bộ luật trước khi sửa | rules | `e420e93` | 35.5% (11/31) | 21.9% (7/32) | 52.6% (10/19) | – (chưa tách) | 3.6% | 31.0% | 1 |
| [EXP-001](EXP-001/README.md) | 10 đề xuất từ phân tích lỗi trên tune | rules | `2f0e1c7+dirty` | 3.2% (1/31) | 9.4% (3/32) | 52.6% (10/19) | 10.0% (2/20) | 3.6% | 33.1% | 2 |
| [EXP-002](EXP-002/README.md) | Khung ý định thay cho mẫu câu | frames (frames-v1) | `2f0e1c7+dirty` | 29.0% (9/31) | 25.0% (8/32) | chưa xem | chưa xem | 4.9% | 2.5% | 2 |
| [EXP-003](EXP-003/README.md) | Luật kết hợp khung ý định | rules+frames (frames-v1) | `2f0e1c7+dirty` | 3.2% (1/31) | 28.1% (9/32) | chưa xem | chưa xem | 8.2% | 33.1% | 2 |
| [EXP-004](EXP-004/README.md) | Mô hình học từ dữ liệu, không dùng luật | ML ký tự TF-IDF + hồi quy logistic | `2f0e1c7+dirty` | 6.5% (2/31) | 3.1% (1/32) | chưa xem | chưa xem | 38.3% | 66.1% | 2 |
| [EXP-005](EXP-005/README.md) | Luật HOẶC mô hình học máy | ML ký tự TF-IDF + hồi quy logistic HOẶC luật EXP-001 | `2f0e1c7+dirty` | 0.0% (0/31) | 12.5% (4/32) | chưa xem | chưa xem | 38.3% | 66.1% | 2 |
| [EXP-006](EXP-006/README.md) | Kiểm tra mô hình học văn phong hay học dấu hiệu | Kiểm tra rò rỉ trên tune | `2f0e1c7+dirty` | – (–) | – (–) | chưa xem | chưa xem | – | – | 2 |
| [EXP-007](EXP-007/README.md) | Mô hình học trên SMS thật, áp sang hội thoại | ML ký tự TF-IDF + hồi quy logistic, học trên SMS dev | `ca76683` | 0.0% (0/31) | 100.0% (32/32) | chưa xem | chưa xem | 5.8% | 96.2% | 2 |
| [EXP-008](EXP-008/README.md) | Đợt 1: phủ định liệt kê, chiều tiền, giấu gia đình, ứng tiền | rules | `ca76683+dirty` | 3.2% (1/31) | 9.4% (3/32) | chưa xem | chưa xem | 3.6% | 33.1% | 2 |
| [EXP-009](EXP-009/README.md) | Gom đủ 5 tin mới gọi AI một lần, gọi nốt tin lẻ khi dừng 60 giây | đếm lượt gọi bằng AI giả, không gọi mạng | `a7abe92+dirty` | – (–) | – (–) | chưa xem | chưa xem | – | – | 2 |
| [EXP-010](EXP-010/README.md) | Chạy thử Groq 2 ca: model dùng được, token, reasoning_effort | ai, groq, 2 ca tune, trần 2048 token, prompt bench-v2 | `309ab2d` | – (–) | – (–) | chưa xem | chưa xem | – | – | 2 |
| [EXP-011](EXP-011/README.md) | Luật + gpt-oss-120b mức low | hybrid-hint, groq openai/gpt-oss-120b (reasoning low), prompt bench-v2 | `098afb3` | 3.2% (1/31) | 25.0% (8/32) | chưa xem | chưa xem | – | – | 2 |
