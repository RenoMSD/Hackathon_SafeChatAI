import type { Severity, Signal } from '@safechat/core/types';

/** Danh sách loại tín hiệu chuẩn. AI trả type tự do, gateway ánh xạ về đây. */
export const CANONICAL_TYPES = [
  'job_bait',
  'fee_upfront',
  'overseas_transport',
  'document_retention',
  'debt_bondage',
  'forced_labor',
  'threat_direct',
  'threat_indirect',
  'isolation_control',
  'secrecy_demand',
  'location_control',
  'account_control',
  'romance_bait',
  'love_bombing',
  'sextortion',
  'intimate_image_threat',
  'investment_bait',
  'withdrawal_fee',
  'account_freeze_threat',
  'authority_impersonation',
  'bank_impersonation',
  'otp_request',
  'remote_access_request',
  'mule_account',
  'loan_shark',
  'organ_trade',
  'minor_grooming',
  'trafficking_recruitment',
  'meta_warning',
  'contradiction',
  'urgency_pressure',
  'sunk_cost',
  'gaslighting',
  'other',
] as const;

export type CanonicalType = (typeof CANONICAL_TYPES)[number];

const CANONICAL = new Set<string>(CANONICAL_TYPES);

/** Từ đồng nghĩa (kể cả type luật của core) ánh xạ về loại chuẩn. */
const SYNONYMS: Record<string, CanonicalType> = {
  fake_job: 'job_bait',
  scam_job: 'job_bait',
  job_scam: 'job_bait',
  recruitment_scam: 'job_bait',
  task_recruitment: 'job_bait',
  unrealistic_pay: 'job_bait',
  upfront_payment: 'fee_upfront',
  advance_fee: 'fee_upfront',
  deposit_fee: 'fee_upfront',
  upfront_fee: 'fee_upfront',
  fee_advance: 'fee_upfront',
  parcel_fee_scam: 'fee_upfront',
  recovery_scam: 'fee_upfront',
  refund_link_info: 'fee_upfront',
  money_transfer: 'fee_upfront',
  task_deposit: 'fee_upfront',
  overseas_job: 'overseas_transport',
  overseas_work: 'overseas_transport',
  transport_abroad: 'overseas_transport',
  passport_retention: 'document_retention',
  id_retention: 'document_retention',
  id_document_request: 'document_retention',
  original_documents: 'document_retention',
  debt_bondage: 'debt_bondage',
  debt_trap: 'debt_bondage',
  borrow_request: 'debt_bondage',
  forced_labour: 'forced_labor',
  forced_labor: 'forced_labor',
  labour_abuse: 'forced_labor',
  threat: 'threat_direct',
  direct_threat: 'threat_direct',
  threat_coercion: 'threat_direct',
  debt_collection_threat: 'threat_direct',
  task_freeze_extortion: 'threat_direct',
  indirect_threat: 'threat_indirect',
  blackmail: 'threat_indirect',
  isolation: 'isolation_control',
  communication_control: 'isolation_control',
  channel_migration: 'isolation_control',
  secrecy: 'secrecy_demand',
  secrecy_general: 'secrecy_demand',
  secrecy_from_family: 'secrecy_demand',
  keep_secret: 'secrecy_demand',
  location_control: 'location_control',
  urgent_relocation: 'location_control',
  relocation: 'location_control',
  account_control: 'account_control',
  account_takeover_borrow: 'account_control',
  romance_scam: 'romance_bait',
  romance_customs_gift: 'romance_bait',
  love_bomb: 'love_bombing',
  lovebombing: 'love_bombing',
  sextortion: 'sextortion',
  intimate_image: 'intimate_image_threat',
  intimate_image_request: 'intimate_image_threat',
  investment_scam: 'investment_bait',
  investment_fraud: 'investment_bait',
  withdrawal_fee: 'withdrawal_fee',
  account_frozen: 'account_freeze_threat',
  account_freeze: 'account_freeze_threat',
  police_impersonation: 'authority_impersonation',
  authority_impersonation: 'authority_impersonation',
  hidden_company_identity: 'authority_impersonation',
  bank_fraud: 'bank_impersonation',
  bank_impersonation: 'bank_impersonation',
  bank_alert_callback: 'bank_impersonation',
  bank_credentials: 'bank_impersonation',
  otp: 'otp_request',
  otp_password_request: 'otp_request',
  remote_access: 'remote_access_request',
  malware_apk: 'remote_access_request',
  phishing_vote_qr: 'remote_access_request',
  mule: 'mule_account',
  money_mule: 'mule_account',
  card_cash_service: 'mule_account',
  loan_shark: 'loan_shark',
  loan_app_trap: 'loan_shark',
  loan_offer_app: 'loan_shark',
  organ: 'organ_trade',
  organ_trade: 'organ_trade',
  grooming: 'minor_grooming',
  minor_grooming: 'minor_grooming',
  trafficking: 'trafficking_recruitment',
  trafficking_recruitment: 'trafficking_recruitment',
  meta: 'meta_warning',
  meta_warning: 'meta_warning',
  contradiction: 'contradiction',
  no_written_contract: 'contradiction',
  urgency: 'urgency_pressure',
  urgency_pressure: 'urgency_pressure',
  sunk_cost: 'sunk_cost',
  gaslighting: 'gaslighting',
  guilt_debt: 'gaslighting',
};

function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^(ai_)+/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function canonicalType(raw: string): CanonicalType {
  const key = normalizeKey(raw);
  if (CANONICAL.has(key)) return key as CanonicalType;
  const direct = SYNONYMS[key];
  if (direct) return direct;
  const collapsed = key.replace(/_/g, '');
  if (CANONICAL.has(collapsed)) return collapsed as CanonicalType;
  return SYNONYMS[collapsed] ?? 'other';
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

const DANGEROUS = new Set([
  'threat_direct',
  'threat_indirect',
  'isolation_control',
  'secrecy_demand',
  'location_control',
  'account_control',
  'otp_request',
  'document_retention',
  'remote_access_request',
  'minor_grooming',
  'trafficking_recruitment',
  'sextortion',
  'intimate_image_threat',
  'organ_trade',
  'debt_bondage',
  'forced_labor',
  'overseas_transport',
  'mule_account',
  'bank_impersonation',
  'authority_impersonation',
]);

export function isDangerousType(type: string): boolean {
  return DANGEROUS.has(type);
}

/**
 * Chuẩn hoá type, khử trùng theo (type, evidence ids), sắp severity giảm dần, cắt tối đa N.
 */
export function normalizeSignals(signals: Signal[], maxSignals: number): Signal[] {
  const deduped = new Map<string, Signal>();
  for (const s of signals) {
    const type = canonicalType(s.type);
    const ids = [...new Set(s.evidence_message_ids)].sort();
    const key = `${type}|${ids.join(',')}`;
    const normalized: Signal = {
      ...s,
      type,
      confidence:
        typeof s.confidence === 'number' && Number.isFinite(s.confidence)
          ? Math.max(0, Math.min(1, s.confidence))
          : undefined,
    };
    const prev = deduped.get(key);
    if (!prev || SEVERITY_ORDER[normalized.severity] > SEVERITY_ORDER[prev.severity]) deduped.set(key, normalized);
  }
  return [...deduped.values()]
    .sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      if (bySeverity) return bySeverity;
      return (b.confidence ?? 0) - (a.confidence ?? 0);
    })
    .slice(0, maxSignals);
}
