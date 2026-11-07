# Bản web

Phụ trách: **Đạt**, nhánh `dat/clients`.

Màn hình kiểm tra đoạn chat, dùng chung cho bản web và app Android. `@safechat/core` chạy ngay trên thiết bị, chỉ gọi gateway khi người dùng bật AI và đồng ý.

Làm với `@safechat/contracts/mock` trước, đổi sang URL thật khi có staging.

Nội dung chat chỉ đưa vào DOM qua `textContent`, không dùng `innerHTML`. Mặc định không lưu lại sau khi đóng.
