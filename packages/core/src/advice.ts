import type { Advice, RiskLevel, Signal } from './types';

const LEVEL_ACTIONS: Record<RiskLevel, string[]> = {
  low: [
    'Chưa thấy dấu hiệu rõ trong phần đã đọc — điều này không chứng minh cuộc trò chuyện an toàn.',
    'Tiếp tục kiểm tra thông tin người/đơn vị đang liên hệ từ nguồn độc lập.',
  ],
  attention: [
    'Xem kỹ các căn cứ bên dưới trước khi quyết định.',
    'Đề nghị thông tin và điều kiện bằng văn bản (hợp đồng, tên pháp nhân) trước khi giao dịch.',
    'Kiểm tra qua kênh độc lập: website chính thức, số tổng đài, cổng đăng ký doanh nghiệp, hoặc gọi trực tiếp số đã lưu của người quen.',
  ],
  high: [
    'Dừng lại trước khi chuyển tiền hoặc cung cấp thông tin cá nhân.',
    'Không chia sẻ OTP, mật khẩu, ảnh giấy tờ cho tới khi đã xác minh độc lập.',
    'Hỏi ý kiến người thân, bạn bè hoặc nhà trường về lời mời này.',
  ],
  critical: [
    'Ưu tiên an toàn của bạn: không gặp riêng, không di chuyển chỉ vì áp lực từ đối phương.',
    'Liên hệ ngay người bạn tin tưởng và cho họ biết tình hình.',
    'Lưu lại bằng chứng (ảnh chụp màn hình, báo cáo xuất) và cân nhắc ngừng tương tác.',
  ],
};

/** Câu hỏi xác minh trung lập theo loại tín hiệu — người dùng tự sao chép và quyết định gửi. */
const QUESTIONS: Record<string, string> = {
  upfront_fee: 'Anh/chị có thể gửi văn bản nêu rõ khoản phí này là gì, ai thu và có hóa đơn không ạ?',
  money_transfer: 'Tài khoản nhận tiền đứng tên cá nhân hay công ty ạ? Em muốn đối chiếu với thông tin pháp nhân.',
  task_deposit: 'Công việc này có hợp đồng lao động không, hay chỉ là nạp tiền làm nhiệm vụ ạ?',
  hidden_company_identity: 'Cho em xin tên pháp nhân đầy đủ, mã số thuế và địa chỉ văn phòng để em tra cứu ạ.',
  unrealistic_pay: 'Anh/chị mô tả giúp em công việc cụ thể hằng ngày và cách tính lương được không ạ?',
  no_written_contract: 'Em có thể nhận hợp đồng hoặc thư mời nhận việc trước khi bắt đầu không ạ?',
  possible_contradiction: 'Trước đó anh/chị có nói khác, anh/chị xác nhận lại giúp em bằng văn bản được không ạ?',
  urgency_pressure: 'Em cần vài ngày để tìm hiểu và hỏi ý kiến gia đình, như vậy có được không ạ?',
  id_document_request: 'Giấy tờ này dùng cho mục đích gì và được lưu trữ ra sao ạ? Em có thể nộp trực tiếp tại văn phòng không?',
  task_recruitment: 'Công việc này do công ty nào trả lương, có hợp đồng không, và em có phải nạp/ứng tiền trước lần nào không ạ?',
  investment_scam: 'Sàn này được cấp phép bởi cơ quan nào ở Việt Nam ạ? Em muốn tự tra cứu trước khi tham gia.',
  romance_customs_gift: 'Cho em xin số vận đơn và tên đơn vị vận chuyển để em tự liên hệ hải quan qua kênh chính thức ạ.',
  loan_app_trap: 'Cho em xin tên công ty tài chính và số giấy phép để em tự gọi tổng đài chính thức xác minh ạ.',
  loan_offer_app: 'Cho em xin tên công ty tài chính và số giấy phép; em sẽ tự tải ứng dụng chính thức trên kho ứng dụng ạ.',
  refund_link_info: 'Em sẽ tự mở ứng dụng chính thức của sàn để kiểm tra đơn và hoàn tiền, không qua link ạ.',
  bank_alert_callback: 'Em sẽ tự gọi số tổng đài in trên thẻ hoặc mở ứng dụng ngân hàng để kiểm tra ạ.',
  card_cash_service: 'Cho em xin tên ngân hàng; em sẽ tự đổi hạn mức trên ứng dụng chính thức ạ.',
  parcel_fee_scam: 'Cho em xin mã vận đơn, em tự tra trên ứng dụng của đơn vị vận chuyển ạ.',
  debt_collection_threat: 'Cho em xin số hợp đồng và tên công ty cho vay để em tự kiểm tra qua kênh chính thức ạ.',
  suspicious_link: 'Đây là trang chính thức của đơn vị nào ạ? Em sẽ tự truy cập từ website/ứng dụng chính thức.',
  channel_migration: 'Mình trao đổi tiếp ở đây được không ạ? Em muốn giữ lại nội dung để đối chiếu.',
};

export const SUPPORT_RESOURCES = [
  'Gọi 113 (Cảnh sát) nếu bạn đang gặp nguy hiểm khẩn cấp.',
  'Gọi 111 (Tổng đài quốc gia bảo vệ trẻ em) nếu bạn hoặc người liên quan dưới 18 tuổi.',
  'Phản ánh lừa đảo trực tuyến tại canhbao.khonggianmang.vn.',
  'Liên hệ phòng công tác sinh viên của trường hoặc người thân tin cậy.',
];

export const SAFETY_MESSAGE =
  'Một số yêu cầu có thể ảnh hưởng đến an toàn của bạn, chẳng hạn bị thúc ép di chuyển gấp, giao giấy tờ gốc hoặc giữ bí mật với người thân. Đừng gặp riêng hoặc di chuyển chỉ vì áp lực từ đối phương. Hãy liên hệ người bạn tin tưởng và tìm hỗ trợ tại địa phương nếu cảm thấy không an toàn.';

/** Mức Nghiêm trọng do bẫy tài chính/mã độc (không có nguy hiểm thân thể). */
export const FINANCIAL_SAFETY_MESSAGE =
  'Các yêu cầu trong cuộc trò chuyện khớp với kịch bản chiếm đoạt tiền/tài khoản đã biết. Dừng mọi giao dịch, không nạp thêm, không cài ứng dụng hay đọc mã cho bất kỳ ai. Nếu đã chuyển tiền hoặc cài ứng dụng lạ: ngắt mạng thiết bị, gọi ngay tổng đài ngân hàng để khóa tài khoản, lưu bằng chứng và trình báo công an.';

const PHYSICAL = new Set(['isolation', 'pressure']);
const CRITICAL_FINANCIAL_ACTIONS = [
  'Dừng ngay mọi giao dịch; không nạp thêm hay đóng thêm bất kỳ khoản phí nào để "rút tiền", "mở khóa", "xác minh".',
  'Gọi tổng đài ngân hàng của bạn (số in trên thẻ/ứng dụng chính thức) nếu đã chuyển tiền hoặc lộ thông tin.',
  'Lưu lại bằng chứng (ảnh chụp màn hình, báo cáo xuất) và trình báo công an nơi cư trú.',
];

export function buildAdvice(level: RiskLevel, signals: Signal[], safetyPriority: boolean): Advice {
  const actions = [...LEVEL_ACTIONS[level]];
  for (const s of signals) {
    if (!actions.includes(s.recommended_action)) actions.push(s.recommended_action);
  }
  if (safetyPriority) {
    // Mức Nghiêm trọng: TẮT câu hỏi thăm dò, không khuyến khích tiếp tục tương tác.
    // Nguy hiểm thân thể (cô lập, đe dọa, ảnh nhạy cảm) và bẫy tài chính/mã độc có hướng dẫn khác nhau.
    const physical = signals.some(
      (s) => s.direct_danger && (PHYSICAL.has(s.category) || s.type === 'intimate_image_request'),
    );
    if (!physical) {
      const fin = [...CRITICAL_FINANCIAL_ACTIONS, ...actions.slice(LEVEL_ACTIONS.critical.length)];
      return { actions: fin, questions: [], safety_message: FINANCIAL_SAFETY_MESSAGE, support_resources: SUPPORT_RESOURCES };
    }
    return { actions, questions: [], safety_message: SAFETY_MESSAGE, support_resources: SUPPORT_RESOURCES };
  }
  const questions: string[] = [];
  for (const s of signals) {
    const q = QUESTIONS[s.type];
    if (q && !questions.includes(q)) questions.push(q);
  }
  return { actions, questions: questions.slice(0, 4) };
}
