# App Android

Phụ trách: **Đạt**, nhánh `dat/clients`. Duy cài APK lên máy demo.

Capacitor bọc `apps/web`, nhận chia sẻ văn bản qua Android share intent. CI build APK debug thành artifact.

- Chỉ Android. APK chỉ dùng cho demo trên máy của nhóm, **không phát hành công khai**, không đưa vào Release. Sản phẩm đang khuyên người dùng không cài APK ngoài kho ứng dụng; bản phát hành thật sẽ qua CH Play.
- Không dùng Quyền Trợ năng hay quyền đọc thông báo.
- Không commit keystore hay file `.apk`.
