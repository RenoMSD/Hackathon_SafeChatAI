# App Android

Phụ trách: **Đạt**, nhánh `dat/clients`. Duy cài APK lên máy demo.

Capacitor bọc `apps/web`, nhận chia sẻ văn bản qua Android share intent. CI build APK debug thành artifact.

- Chỉ Android. APK dùng cho demo và có thể gửi cho ban giám khảo khi cần.
- Không dùng Quyền Trợ năng hay quyền đọc thông báo.
- Không commit keystore hay file `.apk`.
