import type { Rule } from './rule';

export const financeRules: Rule[] = [
  {
    type: 'upfront_fee',
    category: 'finance',
    severity: 'high',
    title: 'Yêu cầu đóng phí/đặt cọc trước khi nhận việc',
    explanation:
      'Có yêu cầu đóng phí, đặt cọc hoặc nộp tiền để được nhận việc. Đơn vị tuyển dụng hợp pháp thường không thu phí của ứng viên.',
    recommended_action: 'Không chuyển tiền trước khi xác minh độc lập đơn vị tuyển dụng và có văn bản nêu rõ khoản phí.',
    negatable: true,
    patterns: [
      /\b(phi|le phi|tien) (ho so|kich hoat|dang ky|dao tao|dong phuc|giu cho|bao hiem|the chan|xu ly|mo tai khoan|nhan viec|tham gia|giu suat|lam the|xac minh|bao dam|dam bao|thu tuc|giu viec)\b/,
      /\b(dong|nop|chuyen|gui) (truoc )?(tien |them )?(coc|phi|le phi|tien coc)\b/,
      /\bdat coc\b/,
      /\bcoc truoc\b/,
      /\b(dong|nop|chuyen) (truoc )?\d+(?:[.,]\d+)? (nghin|trieu)\b/,
    ],
  },
  {
    type: 'money_transfer',
    category: 'finance',
    severity: 'medium',
    title: 'Đề nghị chuyển khoản',
    explanation: 'Đối phương đề nghị chuyển khoản hoặc gửi tiền vào một tài khoản.',
    recommended_action: 'Chỉ chuyển tiền khi đã xác minh người nhận qua kênh độc lập và có lý do rõ ràng bằng văn bản.',
    negatable: true,
    patterns: [
      /\bchuyen khoan\b.{0,30}\b(vao|qua|cho|truoc|so tai khoan)\b/,
      /\b(chuyen|gui) (tien )?(truoc )?(vao|qua|cho) (so tai khoan|tai khoan|ben (minh|em|anh|chi|cong ty))\b/,
      /\bchuyen (tien )?truoc\b/,
    ],
  },
  {
    type: 'task_deposit',
    category: 'finance',
    severity: 'high',
    title: 'Nạp tiền làm nhiệm vụ / hoàn tiền kèm hoa hồng',
    explanation:
      'Có dấu hiệu mô hình "làm nhiệm vụ", nạp tiền để nhận hoa hồng hoặc chốt đơn ảo — kiểu lừa đảo việc làm online phổ biến.',
    recommended_action: 'Không nạp tiền để "làm nhiệm vụ". Các khoản hoa hồng ban đầu thường chỉ để tạo lòng tin.',
    patterns: [
      // Không tính tin báo "đã được nạp" và nạp tiền điện thoại/thẻ cào/data (phát hiện từ dev SMS)
      /(?<!\b(da|vua|duoc) (duoc )?)\bnap (tien|them|\d+)(?!.{0,25}\b(vao (tkc|tai khoan chinh|thue bao|sim|so dien thoai|dien thoai)|card|the cao|data|goi cuoc|dien thoai)\b)/,
      /\b(lam|nhan) nhiem vu\b.{0,40}\b(hoa hong|hoan tien|nap|thuong)\b/,
      /\bhoan (lai )?(tien|von)\b.{0,30}\bhoa hong\b/,
      /\bhoa hong \d+(?:[.,]\d+)? ?%/,
      /\b(chot|tao) don (ao|hang)\b/,
      /\b(dau tu|gop von)\b.{0,40}\b(loi nhuan|lai|hoa hong)\b/,
    ],
  },
  {
    ref: 'R04',
    type: 'task_freeze_extortion',
    category: 'finance',
    severity: 'critical',
    title: 'Bẫy "kẹt lệnh/sai cú pháp", ép nạp thêm để rút tiền',
    explanation:
      'Đối phương báo lỗi hệ thống, sai cú pháp, đóng băng tài khoản hoặc "đơn liên hoàn/đơn cuối" và yêu cầu nạp thêm để rút tiền cũ. Đây là kịch bản giam tiền: nạp thêm bao nhiêu cũng không rút được.',
    recommended_action:
      'Dừng ngay, không nạp thêm bất kỳ khoản nào. Lưu bằng chứng, báo ngân hàng và trình báo công an.',
    requireOneOf: [0, 2],
    groups: [
      [
        /\bsai (noi dung( chuyen khoan)?|cu phap|thao tac|lenh|so tai khoan|ma don)\b/,
        /\bloi (he thong|giao dich|lenh)\b/,
        /\b(he thong|bi|da) dong bang\b/,
        /\bdong bang (tai khoan|so du|tien|lenh|diem)\b/,
        /\b(treo|ket) (tien|lenh|so du|don)\b/,
      ],
      [/\b(don (hang )?(kep|lien hoan|combo|phuc loi|cuoi|tiep theo)|nhiem vu (cuoi|tiep theo|phuc loi|dac biet|kep)|chuoi nhiem vu|goi (vip|nhiem vu))\b/],
      [/\b(nap them|bu (von|tien|so du)|kich hoat (lenh rut|rut tien)|mo khoa (dong bang|tai khoan|lenh)|phi (rut|mo khoa|giai phong))\b/],
      [/\b(mat (toan bo|het|sach)\b.{0,6}\btien|tin nhiem (bi tru|giam)|han chot|trong (vong )?\d+ (phut|gio)|hoan (ca )?goc (lan|va|kem) lai|qua han)\b/],
    ],
  },
  {
    ref: 'R08',
    type: 'romance_customs_gift',
    category: 'finance',
    severity: 'high',
    title: 'Bẫy nhận quà nước ngoài / "hải quan" giữ hàng đòi phí',
    explanation:
      'Có câu chuyện gửi quà, thùng đô la/trang sức từ nước ngoài rồi "hải quan/công ty vận chuyển" đòi phí thông quan, phí phạt. Hải quan không thu tiền qua tài khoản cá nhân.',
    recommended_action: 'Không chuyển bất kỳ khoản phí nào để "nhận quà". Tự tra cứu và liên hệ cơ quan hải quan qua kênh chính thức.',
    requireOneOf: [2, 3],
    groups: [
      [/\b(gui (kien hang|qua|thung qua|goi qua|do la|usd|vang|trang suc)|thung qua|qua\b.{0,10}\bve viet nam|kien hang\b.{0,6}\bnuoc ngoai)\b/],
      [/\b(hai quan|san bay|cong ty van chuyen|kho van|tam giu (kien hang|hang|qua)|giu hang)\b/],
      [/\b(ngoai te|phi thong quan|phi (chong )?rua tien|thue nhap khau|phi van chuyen quoc te|phi giai phong hang)\b/],
      [/\b(nop phat|dong phat|chuyen (vao|cho) (tai khoan )?(nhan vien|can bo)|tich thu)\b/],
    ],
  },
  // ---- Phát hiện từ dev SMS (dữ liệu ngoài): thẻ tín dụng, đơn hàng/bưu phẩm. Viết theo ý nghĩa kịch bản.
  {
    type: 'bank_alert_callback',
    category: 'impersonation',
    severity: 'high',
    title: 'Cảnh báo giao dịch/khóa thẻ giả, dụ gọi số lạ hoặc bấm link',
    explanation:
      'Tin nhắn báo thẻ/tài khoản vừa bị trừ tiền, có giao dịch bất thường hoặc bị khóa, rồi giục gọi ngay một số điện thoại hoặc bấm link để "khóa thẻ". Kẻ gian dùng nỗi sợ mất tiền để dẫn bạn tới tổng đài/trang giả và lấy thông tin thẻ, OTP.',
    recommended_action:
      'Không gọi số và không bấm link trong tin. Tự mở ứng dụng ngân hàng hoặc gọi số tổng đài in trên mặt sau thẻ để kiểm tra.',
    groups: [
      [
        /\b(the (tin dung|ngan hang|atm|visa|ghi no)|tai khoan( ngan hang)?)\b.{0,40}\b(bi (quet|tru|khoa|tam khoa|dong bang)|vua (bi )?(quet|tru)|giao dich (bat thuong|la|nghi van))\b/,
        /\b(phat hien|canh bao)\b.{0,20}\bgiao dich\b.{0,40}\b(the|tai khoan|nuoc ngoai)\b/,
      ],
      [
        /\bgoi (gap|ngay)\b/,
        /\b(goi|lien he)\b.{0,12}\b(so|hotline|tong dai)\b.{0,6}\d{6,}/,
        /\b(bam|nhan|truy cap) (vao )?(link|duong link|https?)\b/,
        /\b(dong bang|khoa) the\b.{0,10}\b(ngay|gap|khan cap)\b/,
      ],
    ],
  },
  {
    type: 'card_cash_service',
    category: 'finance',
    severity: 'high',
    title: 'Dịch vụ nâng hạn mức / rút tiền thẻ tín dụng qua tin nhắn',
    explanation:
      'Có lời mời nâng hạn mức, mở thẻ nhanh hoặc rút tiền mặt từ thẻ tín dụng, kèm yêu cầu bấm link, gửi ảnh thẻ, cung cấp mã hoặc trả phí. Ngân hàng chỉ thay đổi hạn mức qua ứng dụng/chi nhánh chính thức.',
    recommended_action: 'Không gửi ảnh thẻ, số thẻ hay mã xác thực. Muốn đổi hạn mức, tự liên hệ ngân hàng qua ứng dụng hoặc chi nhánh.',
    groups: [
      [
        /\b((nang|tang|mo|kich hoat|ho tro) han muc (the|tin dung)|han muc (the )?tin dung\b.{0,20}\b(duoc duyet|tang|nang)|rut tien (mat )?(tu )?the( tin dung)?|dao han the|ho tro (rut|dao) (tien )?the|mo the tin dung (online|nhanh|khong can))\b/,
      ],
      [
        /\b(bam|nhan|truy cap|kich hoat)\b.{0,10}\b(link|tai day|duong link|https?)\b/,
        /\b(nhap|cung cap|gui)\b.{0,25}\b(thong tin|so the|anh|hinh|mat truoc|mat sau|ma)\b/,
        /\bphi\b.{0,10}\b(\d|dich vu|kich hoat|mo the|rut)\b/,
        /\b(chuyen khoan|nhan vien (se )?goi|giu may|ket ban zalo)\b/,
      ],
    ],
  },
  {
    type: 'parcel_fee_scam',
    category: 'impersonation',
    severity: 'high',
    title: 'Giả bưu cục/vận chuyển: đơn hàng bị giữ, đòi phí hoặc dọa xử lý',
    explanation:
      'Tin nhắn báo đơn hàng/bưu phẩm đang bị giữ, thiếu cước, thất lạc hoặc chứa giấy tờ pháp lý, rồi đòi chuyển khoản phí, bấm link, liên hệ tổng đài lạ hoặc dọa chuyển công an. Đơn vị vận chuyển thật thu tiền khi giao (COD), không yêu cầu chuyển khoản trước qua tin nhắn.',
    recommended_action:
      'Không chuyển khoản, không bấm link. Tra mã vận đơn trên ứng dụng/website chính thức của đơn vị vận chuyển hoặc sàn đã đặt hàng.',
    groups: [
      [
        /\b(don hang|buu pham|buu kien|kien hang|van don|goi hang|buu dien|buu cuc)\b.{0,40}\b(dang (bi )?giu|bi giu|tam giu|luu kho|thieu (cuoc|phi)|chua (thanh toan|nhan|duoc nhan)|that lac|khong the (giao|lien he)|giao (that bai|khong thanh cong)|tai lieu phap ly|hang cam)\b/,
        /\b(phi (luu kho|luu bai|thong quan)|thieu cuoc)\b/,
      ],
      [
        /\b(thanh toan|chuyen khoan|nop|dong)\b.{0,40}\b(phi|cuoc|so tai khoan|truoc \d)\b/,
        /\b(vao|bam|nhan|truy cap) (vao )?(link|duong link)\b/,
        /\blien he\b.{0,6}\b(tong dai|telegram|zalo|hotline)\b/,
        /\b(cap nhat|xac nhan) (lai )?(thong tin|dia chi|so dien thoai)\b/,
        /\b(qua han|neu khong)\b.{0,30}\b(chuyen|bao|bi)\b.{0,6}\b(cong an|toa an|csgt|xu ly)\b/,
      ],
    ],
  },
];
