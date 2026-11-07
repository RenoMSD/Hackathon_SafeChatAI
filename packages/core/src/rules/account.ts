import type { Rule } from './rule';

/** Mã bí mật: OTP, mã xác nhận/xác thực, mật khẩu. */
const SECRET = String.raw`(otp|ma (xac nhan|xac thuc|xac minh|kich hoat|khoi phuc|bao mat|dang nhap)|mat khau|password)`;
/** Không tính khi ngay trước động từ là lời dặn phủ định ("đừng đọc OTP cho ai", "tuyệt đối không cung cấp"). */
const NOT_WARNING = String.raw`(?<!\b(khong|dung|chang|khong bao gio|khong nen|khong duoc|tuyet doi khong)\s+(\S+\s+)?)`;
/** Người nhận phía đối phương ("đọc cho chị", "gửi qua anh"). */
const TO_THEM = String.raw`(anh|em|chi|minh|toi|to|tao|ba|me|con|cau|bac|chu|co|ben (em|minh|anh|chi))`;

export const accountRules: Rule[] = [
  {
    type: 'otp_password_request',
    category: 'account',
    severity: 'high',
    title: 'Xin mã OTP / mật khẩu',
    explanation:
      'Có yêu cầu đọc, gửi hoặc cung cấp mã OTP, mã xác thực hoặc mật khẩu. Không đơn vị nào (kể cả người quen) cần bạn đọc mã này cho họ.',
    recommended_action: 'Tuyệt đối không chia sẻ OTP, mật khẩu hay mã khôi phục với bất kỳ ai.',
    negatable: true,
    // Chỉ bắt YÊU CẦU (động từ đọc/gửi/cung cấp + mã), không bắt tin thông báo mã hay lời dặn "đừng chia sẻ OTP"
    // (phát hiện từ dev dữ liệu ngoài: tin ngân hàng gửi mã, câu kể "quên mật khẩu").
    patterns: [
      new RegExp(`${NOT_WARNING}\\b(doc|gui|dua|cung cap|nhan tin|chup|noi|xin|chuyen)\\b.{0,45}\\b${SECRET}\\b`),
      // Dẫn nhập mã vào link/app do đối phương đưa ("bấm vào link… nhập số thẻ với mã xác thực") — khác với
      // tự nhập OTP trong ứng dụng của mình khi nhận hàng/chuyển tiền
      new RegExp(`\\b(link|duong link|app|ung dung|trang web)\\b.{0,60}${NOT_WARNING}\\b(nhap|dien)\\b.{0,25}\\b(${SECRET.slice(1, -1)}|ma (do|nay))\\b`),
      new RegExp(`${NOT_WARNING}\\b(nhap|dien)\\b.{0,25}\\b${SECRET}\\b.{0,20}\\b(vao|tren)\\b.{0,12}\\b(link|duong link|app|ung dung|trang)\\b`),
      new RegExp(`\\b${SECRET}\\b.{0,30}${NOT_WARNING}\\b(doc|bao|nhan tin|cung cap|dua|gui (lai )?(cho|qua|sang))\\b.{0,12}\\b${TO_THEM}\\b`),
      new RegExp(`\\b${SECRET}\\b.{0,15}\\b(bao nhieu|so may|may so)\\b`),
      // Xin mã không gọi tên OTP: "đọc em mã đó", "mã 6 số vừa nhận". Không tính mã đơn hàng, mã giảm giá...
      new RegExp(`${NOT_WARNING}\\bdoc\\b.{0,20}\\bma\\b(?! (don|van don|khach|giam gia|san pham|nhan vien|so thue|hoc sinh|sinh vien))`),
      new RegExp(`\\bma \\d so\\b.{0,30}${NOT_WARNING}\\b(doc|gui|cho em|cho minh|bao)\\b`),
    ],
  },
  {
    type: 'bank_credentials',
    category: 'account',
    severity: 'high',
    title: 'Xin thông tin đăng nhập ngân hàng / thẻ',
    explanation: 'Có yêu cầu thông tin đăng nhập ngân hàng, số thẻ, mã CVV hoặc tài khoản ví điện tử.',
    recommended_action:
      'Không cung cấp thông tin đăng nhập ngân hàng, số thẻ hay CVV. Để nhận lương chỉ cần số tài khoản, không cần mật khẩu.',
    negatable: true,
    patterns: [
      /\b(ten dang nhap|tai khoan) (ngan hang|internet banking|mobile banking|vi)\b.{0,20}\b(mat khau|dang nhap)\b/,
      /\bcvv\b/,
      /\b(so the|mat sau the|the atm)\b.{0,20}\b(gui|chup|cho|cung cap)\b/,
      /\b(gui|chup|cho|cung cap)\b.{0,20}\b(so the|mat sau the|the atm)\b/,
      /\b(dang nhap|cai) (app|ung dung) ngan hang\b/,
    ],
  },
  {
    type: 'id_document_request',
    category: 'account',
    severity: 'high',
    title: 'Xin ảnh/thông tin giấy tờ tùy thân',
    explanation:
      'Có yêu cầu gửi ảnh căn cước, hộ chiếu hoặc ảnh chân dung cầm giấy tờ — dữ liệu có thể bị lạm dụng để mở tài khoản, vay tiền.',
    recommended_action:
      'Chỉ cung cấp giấy tờ khi đã ký hợp đồng với đơn vị đã xác minh; cân nhắc che bớt thông tin không cần thiết.',
    negatable: true,
    patterns: [
      /\b(gui|chup|cung cap|xin|nop)\b.{0,25}\b(can cuoc|chung minh|ho chieu|giay to tuy than|bang lai)\b/,
      /\b(mat truoc|mat sau|2 mat|hai mat)\b.{0,15}\b(can cuoc|chung minh)\b/,
      /\b(anh|hinh) (chan dung|selfie|khuon mat)\b.{0,20}\b(cam|cung|kem)\b.{0,15}\b(can cuoc|giay to)\b/,
    ],
    // "giữ hộ chiếu/căn cước gốc" thuộc original_documents, không tính trùng ở đây
    exclude: [/\b(ban goc|giay to goc|ho chieu goc|can cuoc goc)\b/],
  },
  {
    type: 'intimate_image_request',
    category: 'account',
    severity: 'critical',
    direct_danger: true,
    title: 'Đòi ảnh/video nhạy cảm',
    explanation:
      'Có yêu cầu gửi hình ảnh/video nhạy cảm hoặc "kiểm tra ngoại hình" bất thường. Nội dung này có thể bị dùng để tống tiền, khống chế.',
    recommended_action: 'Không gửi ảnh/video nhạy cảm. Nếu đã bị đe dọa, lưu bằng chứng và tìm hỗ trợ ngay.',
    patterns: [
      /\b(anh|hinh|video|clip) (nong|nhay cam|khoa than|ho hang|than tran|goi cam|noi y|bikini)\b/,
      /\b(kiem tra|xem|check) (body|than hinh|vong \d|so do)\b/,
      /\b(cho|gui) (xem )?(body|than hinh)\b/,
      /\bcoi (do|ao)\b.{0,20}\b(chup|quay|video|cam)\b/,
    ],
  },
];
