# Sổ thí nghiệm

Mọi lần chỉnh sửa luật hay thử cách suy luận mới đều có một mã `EXP-xxx`. Xem bảng tổng hợp ở [LEDGER.md](LEDGER.md).

## Mỗi thí nghiệm lưu gì

| File | Nơi lưu | Nội dung |
|---|---|---|
| `EXP-xxx/README.md` | Repo | Giả thuyết, cách làm, kết luận, cách tái lập |
| `EXP-xxx/metrics.json` | Repo | Số tune, check, SMS và dự đoán từng ca của tune, không có nội dung hội thoại |
| `research/results/experiments/EXP-xxx/preds.json` | Chỉ trên máy | Dự đoán đầy đủ để so từng cặp |

Repo đang public nên không đưa nội dung hội thoại hay mã ca của check lên đây.

## Quy tắc

1. **Viết giả thuyết trước khi chạy.** Mỗi lần chỉ đổi một ý chính.
2. **Không ghi đè.** Chạy lại thì dùng mã mới. Kết quả xấu vẫn được giữ.
3. **Chọn trên tune, xác nhận trên check.** Dùng `--skip-check` khi còn đang so sánh. Chỉ phương án được chọn mới xem check.
4. **Đếm số lần xem check.** Mỗi lần xem làm check bớt độc lập. Sổ tự cộng dồn, và phải nêu con số này khi báo cáo.
5. **Không đọc nội dung ca check.** Chỉ xem số tổng.
6. **Số dev không phải kết quả cuối.** Số cuối lấy từ test đã khóa và bộ đề kín, chạy một lần sau khi đóng băng.

## Thêm một thí nghiệm

```bash
npm run bench:experiment -- --id EXP-010 --title "Tên ngắn" --hypothesis "Sửa gì, kỳ vọng gì" --method rules --skip-check --vs EXP-001
```

Sau đó viết phần Kết luận trong `EXP-010/README.md`.
