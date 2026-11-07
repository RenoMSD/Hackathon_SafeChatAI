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
