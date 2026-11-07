import type { Rule } from './rule';

// Nhóm 1, 4, 6 (tonghopkichban.md): mạo danh cơ quan, giả người quen mượn tiền, lừa đảo kép thu hồi tiền.
export const impersonationRules: Rule[] = [
  {
    ref: 'R01',
    type: 'authority_impersonation',
    category: 'impersonation',
    severity: 'critical',
    direct_danger: true,
    title: 'Mạo danh công an/viện kiểm sát, đe dọa liên quan vụ án',
    explanation:
      'Đối phương tự xưng cơ quan pháp luật, nói bạn liên quan vụ án/đường dây và yêu cầu chuyển tiền "xác minh" hoặc giữ bí mật. Cơ quan chức năng không làm việc qua tin nhắn mạng xã hội và không yêu cầu chuyển tiền để chứng minh trong sạch.',
    recommended_action:
      'Không chuyển tiền, không cung cấp thông tin. Ngừng trò chuyện và tự liên hệ công an phường/xã nơi cư trú qua kênh chính thức.',
    requireOneOf: [0],
    groups: [
      [/\b(cong an|vien kiem sat|toa an|bo cong an|co quan dieu tra|canh sat (hinh su|kinh te)?|dieu tra vien|can bo (cong an|dieu tra)|cuc canh sat)\b/],
      [/\b(lenh bat|bat (tam )?giam|khoi to|truy na|giay trieu tap|rua tien|ma tuy|duong day (rua tien|ma tuy|lua dao|toi pham)|lien quan (den|toi) (vu an|duong day|toi pham))\b/],
      [
        /\btai khoan (an toan|tam giu|dieu tra|phong toa|cua (co quan|bo cong an|toa an))\b/,
        /\b(chung minh|xac minh|kiem tra) (nguon tien|tai san|dong tien|trong sach)\b/,
        /\bchuyen (toan bo|het|tat ca) (tien|tai san|so du)\b/,
      ],
      [/\b(bao mat tuyet doi|bi mat (dieu tra|nha nuoc)|khong duoc (noi|ke|tiet lo|cho biet)|phong kin|o mot minh|thue phong (khach san|nha nghi))\b/],
    ],
  },
  {
    ref: 'R06',
    type: 'account_takeover_borrow',
    category: 'impersonation',
    severity: 'high',
    title: 'Nghi tài khoản người quen bị chiếm, nhờ chuyển tiền gấp',
    explanation:
      'Có yêu cầu chuyển tiền gấp/hộ, viện cớ ngân hàng lỗi, mạng yếu hoặc không nghe máy được — kiểu thường gặp khi tài khoản người quen bị chiếm hoặc dùng deepfake.',
    recommended_action:
      'Gọi điện trực tiếp tới số điện thoại bạn đã lưu của người đó (không gọi qua ứng dụng chat) để xác minh trước khi chuyển tiền.',
    requireOneOf: [0],
    groups: [
      [
        /\b(chuyen (gap|tam|giup|ho|nho)|cho (muon|vay) (tam|gap|it)|cuu (gap|voi|tao|minh|em|anh|chi)|ban (qua|sang) (giup|ho|tam)|muon (tam|gap)|ung (tam|truoc) (giup|ho))\b/,
      ],
      [
        /\b(ngan hang|app( ngan hang)?)\b.{0,15}\b(bao tri|bi loi|dang loi|bi khoa)\b/,
        /\bhan muc\b.{0,10}\b(het|vuot)\b/,
        /\b(chuyen|ban) (nho|qua|vao) (tai khoan|so tai khoan) (cua )?(ban|nguoi khac|ho|ban minh|nguoi nha)\b/,
      ],
      [/\b(mang (yeu|lag|cham)|lag (qua|lam)|hong (mic|loa|camera)|khong (nghe|goi) (may|duoc)|dang (ban )?hop|song yeu|goi video\b.{0,12}\b(lag|mo|giat))\b/],
      [/\b(chieu|toi|mai|ti nua|ti xiu|xong)\b.{0,12}\btra (lien|ngay|lai|ban|may|nhe)\b/],
    ],
  },
  {
    type: 'borrow_request',
    category: 'finance',
    severity: 'medium',
    title: 'Nhờ mượn/ứng tiền qua tin nhắn',
    explanation:
      'Có lời nhờ mượn hoặc ứng tiền qua tin nhắn. Tài khoản người quen có thể đã bị chiếm — chưa thấy bước xác minh người thật.',
    recommended_action: 'Gọi điện trực tiếp tới số bạn đã lưu của người đó (không qua ứng dụng chat) trước khi chuyển tiền.',
    patterns: [
      /\b(cho|giup) (tao|minh|em|anh|chi|to|tui|toi) (muon|vay) (tam |gap |it |chut )?\d/,
      /\b(cho|giup) (tao|minh|em|anh|chi|to|tui|toi) (muon|vay) (tam |gap |it |chut )?(tien|it tien)\b/,
      /\bmuon tam\b.{0,15}\b(\d|tien)/,
      /\bung (tam|truoc) (giup|ho|cho)\b/,
    ],
  },
  {
    ref: 'R09',
    type: 'recovery_scam',
    category: 'impersonation',
    severity: 'critical',
    title: 'Lừa đảo kép: hứa thu hồi tiền đã bị lừa',
    explanation:
      'Đối phương hứa lấy lại tiền đã mất (tự xưng luật sư, an ninh mạng, hacker) và đòi phí trước. Không ai can thiệp được hệ thống ngân hàng để "kéo" tiền về.',
    recommended_action:
      'Không đóng bất kỳ khoản phí "thu hồi" nào. Trình báo công an nơi cư trú và liên hệ trực tiếp ngân hàng của bạn.',
    requireOneOf: [0, 2],
    groups: [
      [/\b(ho tro (thu hoi|lay lai)|lay lai (tien|von|tai san) (bi lua|da mat|bi mat)|thu hoi (von|tien|tai san)|truy thu (dong tien|tien))\b/],
      [/\b(van phong luat|luat su|doi ngu (an ninh mang|ky thuat)|hacker|can thiep (he thong|cong thanh toan|ngan hang)|an ninh mang)\b/],
      [/\b(tien|khoan tien)\b.{0,15}\b(bi treo|dang treo|bi giu|phong toa)\b/, /\blien ngan hang\b/],
      [/\b(phi (kich hoat )?hoan tien|phi (ho so|mo luong|to tung|phap ly|dich vu|thu hoi)|nap tien doi ung|dong (truoc )?phi)\b/],
    ],
  },
];
