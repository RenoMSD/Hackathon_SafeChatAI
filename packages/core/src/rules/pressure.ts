import type { Rule } from './rule';

export const pressureRules: Rule[] = [
  {
    type: 'urgency_pressure',
    category: 'pressure',
    severity: 'medium',
    title: 'Thúc ép quyết định gấp',
    explanation: 'Có lời thúc ép phải quyết định/chuyển tiền ngay, giới hạn suất hoặc dọa mất cơ hội.',
    recommended_action: 'Chậm lại. Một cơ hội hợp pháp không biến mất chỉ vì bạn dành thời gian kiểm tra.',
    // "nhanh lên", "khẩn cấp", "hết hạn" đứng một mình là câu đời thường → phải đi kèm hành động chuyển tiền/
    // cung cấp/quyết định, hoặc hậu quả ("không thì mất suất") (phát hiện từ dev dữ liệu ngoài).
    patterns: [
      /\b(ngay bay gio|ngay lap tuc|khan cap)\b.{0,30}\b(chuyen|nop|dong|thanh toan|cung cap|xac minh|cai|tai|dang ky|quyet dinh|dat coc)\b/,
      /\b(chuyen|nop|dong|thanh toan|cung cap|xac minh|quyet dinh|dang ky|dat coc|cai|tai)\b.{0,30}\b(ngay bay gio|ngay lap tuc|khan cap|trong hom nay|nhanh len|gap len)\b/,
      /\b(het han|trong hom nay)\b.{0,30}\b(khong thi|neu khong|mat (suat|co hoi|cho|tien|quyen loi)|bi (khoa|huy|phat))\b/,
      /\btruoc \d+ ?(gio|h)\b.{0,20}\b(hom nay|toi nay|khong thi|neu khong)\b/,
      /\bchi con \d+ (suat|cho|slot|nguoi)\b/,
      /\b(neu khong|khong thi)\b.{0,20}\b(mat (co hoi|suat|cho|viec)|huy (ho so|suat)|nguoi khac lay)\b/,
      /\bquyet dinh (ngay|luon|nhanh)\b/,
      /\bkeo (mat|het|lo) (suat|cho|co hoi|viec)\b/,
      /\b(dung|khong duoc) (suy nghi|do du|chan chu) (lau|nua|nhieu)\b/,
    ],
  },
  {
    type: 'threat_coercion',
    category: 'pressure',
    severity: 'critical',
    direct_danger: true,
    title: 'Đe dọa / cưỡng ép',
    explanation: 'Có lời đe dọa (phát tán hình ảnh, kiện cáo, làm hại) hoặc ép buộc người dùng phải làm theo.',
    recommended_action: 'Ngừng tương tác, lưu bằng chứng và tìm hỗ trợ từ người tin cậy hoặc cơ quan chức năng.',
    patterns: [
      /\b(phat tan|tung|dang|gui)\b.{0,15}\b(anh|hinh|clip|video)\b.{0,25}\b(len mang|cho (gia dinh|bo me|ban be|nguoi than|truong))\b/,
      /\b(se|bi) (kien|bao cong an|truy cuu|bo tu|xu ly)\b.{0,25}\b(neu|khong (dong|chuyen|lam|tra))\b/,
      /\b(liu hon|coi chung|biet nha (em|ban|may) o dau)\b/,
      /\b(boi thuong|den bu|phat)\b.{0,15}\b(hop dong|vi pham|bo viec)\b.{0,20}\b\d+(?:[.,]\d+)? (trieu|ty)\b/,
      /\bkhong (duoc|cho) (ve|nghi viec|bo viec)\b/,
      // Phát hiện từ tune bộ v2: tống tiền bằng ảnh, đe dọa gọi người thân. "anh" có thể là xưng hô nên cần rõ là ảnh
      /\b(anh cua (anh|em|chi|ban|may)|hinh anh|clip|video)\b.{0,50}\bse duoc gui di\b/,
      /\b(thi|khong thi|la) (anh|hinh)( anh)?\s+gui thang\b.{0,20}\b(lanh dao|co quan|gia dinh|nguoi than|dong nghiep)\b/,
      /\btien doi lay im lang\b/,
      /\bkhong (tra|thanh toan)\b.{0,30}\b(goi|bao|nhan tin)\b.{0,12}\bcho\b.{0,12}\b(nguoi than|dong nghiep|gia dinh|lanh dao)\b/,
    ],
  },
  {
    // Phát hiện từ dev SMS: đòi nợ (thật hoặc giả) bằng đe dọa bêu xấu với danh bạ/người thân hoặc dọa kiện
    type: 'debt_collection_threat',
    category: 'pressure',
    severity: 'high',
    title: 'Đòi nợ kèm đe dọa báo danh bạ / người thân / khởi kiện',
    explanation:
      'Tin nhắn nói bạn (hoặc người bạn "bảo lãnh") có khoản vay quá hạn và dọa thông báo tới danh bạ, người thân, nơi làm việc hoặc khởi kiện để ép trả tiền gấp. Đây là cách của app vay trái phép hoặc kẻ gian mạo danh đòi nợ.',
    recommended_action:
      'Không chuyển tiền theo tin nhắn. Kiểm tra khoản vay qua ứng dụng/hợp đồng chính thức; nếu bị đe dọa, lưu bằng chứng và báo công an nơi cư trú.',
    groups: [
      [/\b(khoan vay|khoan no|no (qua han|xau)|be no|bao lanh (khoan vay|cho)|cham (tra )?no|nhay nhom no)\b/],
      [
        /\b(neu khong|khong thi)\b.{0,40}\b(thong bao|gui|bao|nhan tin|goi)\b.{0,15}\b(toan bo )?(danh ba|nguoi than|gia dinh|bo me|cong ty|co quan|ban be)\b/,
        /\b(khoi kien|bi kien|kien ra toa|tranh bi (khoi )?kien)\b/,
        /\b(thanh toan|xu ly|tra)\b.{0,10}\b(gap|ngay)\b/,
      ],
    ],
  },
  {
    type: 'guilt_debt',
    category: 'pressure',
    severity: 'medium',
    title: 'Gây cảm giác mắc nợ / tội lỗi',
    explanation: 'Đối phương nhấn mạnh đã bỏ tiền, công sức cho người dùng để tạo áp lực phải làm theo.',
    recommended_action: 'Bạn không có nghĩa vụ làm theo chỉ vì đối phương nói đã "bỏ công" cho bạn.',
    patterns: [
      /\b(da )?(bo|ung) (tien|chi phi) (ra )?(cho|lo cho) (em|ban|chau)\b/,
      /\b(mang|mac|dang) no\b.{0,15}\b(cong ty|anh|chi|ben minh)\b/,
      /\b(phu long|vo on)\b/,
    ],
  },
];
