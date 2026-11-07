import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ShareAnalysisResponse, ShareRuleMatch } from '@safechat/contracts';
import { riskColor, riskSoftColor, useTheme, type ThemeColors } from '../theme';
import { formatClock, snippet } from '../utils/format';
import { RiskGauge } from './RiskGauge';

const SEVERITY_LABEL: Record<ShareRuleMatch['severity'], string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Nghiêm trọng',
};

const CATEGORY_LABEL: Record<ShareRuleMatch['category'], string> = {
  finance: 'Tài chính',
  account: 'Tài khoản & dữ liệu',
  identity: 'Danh tính doanh nghiệp',
  job_terms: 'Điều kiện việc làm',
  pressure: 'Thao túng / áp lực',
  isolation: 'Cô lập / di chuyển',
  contradiction: 'Mâu thuẫn',
  impersonation: 'Mạo danh',
  technical: 'Kỹ thuật / đường link',
  investment: 'Đầu tư',
};

const HEADLINE: Record<ShareAnalysisResponse['riskLevel'], string> = {
  high: 'Nguy cơ cao',
  medium: 'Cần xác minh',
  low: 'Chưa thấy dấu hiệu rõ',
};

function severityColor(severity: ShareRuleMatch['severity'], colors: ThemeColors): string {
  if (severity === 'critical' || severity === 'high') return colors.high;
  if (severity === 'medium') return colors.medium;
  return colors.low;
}

interface ScanResultCardProps {
  result: ShareAnalysisResponse;
  scannedText: string;
}

export function ScanResultCard({ result, scannedText }: ScanResultCardProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const accent = riskColor(result.riskLevel, colors);
  const accentSoft = riskSoftColor(result.riskLevel, colors);
  const canExpand = scannedText.length > 240;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: accent }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>KẾT QUẢ KIỂM TRA</Text>
          <Text style={[styles.heading, { color: colors.text }]}>{HEADLINE[result.riskLevel]}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: accentSoft }]}>
          <View style={[styles.badgeDot, { backgroundColor: accent }]} />
          <Text style={[styles.badgeText, { color: accent }]}>{result.riskLabel}</Text>
        </View>
      </View>

      <View style={styles.gaugeRow}>
        <RiskGauge score={result.riskScore} level={result.riskLevel} label={result.riskLabel} />
        <View style={styles.gaugeSide}>
          <Text style={[styles.reasonLabel, { color: colors.muted }]}>VÌ SAO RA MỨC NÀY</Text>
          <Text style={[styles.reason, { color: colors.text }]}>{result.levelReason}</Text>
        </View>
      </View>

      {result.safetyPriority && (
        <View style={[styles.safetyBanner, { backgroundColor: colors.highSoft, borderColor: colors.high }]}>
          <Text style={[styles.safetyTitle, { color: colors.high }]}>Ưu tiên an toàn của bạn</Text>
          <Text style={[styles.safetyText, { color: colors.text }]}>
            Nội dung có dấu hiệu nguy hiểm trực tiếp. Không tiếp tục làm theo yêu cầu, không chuyển tiền và
            liên hệ người tin cậy hoặc 113 nếu bạn đang gặp nguy hiểm.
          </Text>
        </View>
      )}

      <View style={[styles.quoteBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Text style={[styles.quoteLabel, { color: colors.muted }]}>NỘI DUNG ĐÃ QUÉT</Text>
        <Text style={[styles.quoteText, { color: colors.text }]} numberOfLines={expanded ? undefined : 5}>
          {scannedText}
        </Text>
        {canExpand && (
          <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button">
            <Text style={[styles.more, { color: colors.brand }]}>{expanded ? 'Thu gọn' : 'Xem thêm'}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Quy tắc phát hiện</Text>
        <Text style={[styles.sectionCount, { color: colors.muted }]}>{result.matchedRules.length}</Text>
      </View>

      {result.matchedRules.length === 0 ? (
        <View style={[styles.emptyRules, { backgroundColor: colors.lowSoft, borderColor: colors.low }]}>
          <Text style={[styles.emptyRulesText, { color: colors.text }]}>
            Không phát hiện quy tắc nào trong đoạn nội dung này. Điều này không chứng minh nội dung là an toàn.
          </Text>
        </View>
      ) : (
        result.matchedRules.map((rule, index) => {
          const color = severityColor(rule.severity, colors);
          return (
            <View
              key={`${rule.id}-${index}`}
              style={[styles.rule, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            >
              <View style={styles.ruleTop}>
                <View style={[styles.severityDot, { backgroundColor: color }]} />
                <Text style={[styles.ruleTitle, { color: colors.text }]}>{rule.title}</Text>
              </View>
              <View style={styles.ruleMeta}>
                <View style={[styles.codePill, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.codeText, { color: colors.muted }]}>{rule.id}</Text>
                </View>
                <Text style={[styles.ruleMetaText, { color: colors.muted }]}>
                  {CATEGORY_LABEL[rule.category]} · Mức {SEVERITY_LABEL[rule.severity]}
                </Text>
              </View>
              <Text style={[styles.ruleExplanation, { color: colors.muted }]}>{rule.explanation}</Text>
              {rule.evidence.length > 0 && (
                <View style={[styles.evidence, { borderLeftColor: color }]}>
                  <Text style={[styles.evidenceText, { color: colors.text }]}>
                    “{snippet(rule.evidence[0] ?? '', 200)}”
                  </Text>
                </View>
              )}
              <Text style={[styles.ruleAction, { color: colors.brand }]}>{rule.recommendedAction}</Text>
            </View>
          );
        })
      )}

      <View style={[styles.recommendation, { backgroundColor: accentSoft, borderColor: accent }]}>
        <Text style={[styles.eyebrow, { color: accent }]}>KHUYẾN NGHỊ HÀNH ĐỘNG</Text>
        <Text style={[styles.recommendationHeadline, { color: colors.text }]}>{result.recommendation.headline}</Text>

        {result.recommendation.actions.map((action, index) => (
          <View key={`${index}-${action}`} style={styles.actionRow}>
            <View style={[styles.actionIndex, { backgroundColor: accent }]}>
              <Text style={[styles.actionIndexText, { color: colors.brandContrast }]}>{index + 1}</Text>
            </View>
            <Text style={[styles.actionText, { color: colors.text }]}>{action}</Text>
          </View>
        ))}

        {result.recommendation.questions.length > 0 && (
          <View style={styles.subBlock}>
            <Text style={[styles.subTitle, { color: colors.muted }]}>Câu hỏi xác minh</Text>
            {result.recommendation.questions.map((question) => (
              <Text key={question} style={[styles.bulletText, { color: colors.text }]}>
                • {question}
              </Text>
            ))}
          </View>
        )}

        {result.recommendation.supportResources.length > 0 && (
          <View style={[styles.support, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.subTitle, { color: colors.muted }]}>Hỗ trợ khẩn cấp</Text>
            {result.recommendation.supportResources.map((resource) => (
              <Text key={resource} style={[styles.bulletText, { color: colors.text }]}>
                • {resource}
              </Text>
            ))}
          </View>
        )}
      </View>

      {result.uncertainties.length > 0 && (
        <View style={styles.uncertainties}>
          <Text style={[styles.subTitle, { color: colors.muted }]}>Điểm chưa chắc chắn</Text>
          {result.uncertainties.map((item) => (
            <Text key={item} style={[styles.bulletText, { color: colors.muted }]}>
              • {item}
            </Text>
          ))}
        </View>
      )}

      <Text style={[styles.disclaimer, { color: colors.muted }]}>{result.disclaimer}</Text>
      <Text style={[styles.footerMeta, { color: colors.muted }]}>
        {result.analyzedLines} dòng · {formatClock(result.analyzedAt)} · Bộ luật SafeChat (chưa gọi AI)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderLeftWidth: 5,
    padding: 18,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gaugeSide: {
    flex: 1,
    gap: 6,
  },
  reasonLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  reason: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  safetyBanner: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  safetyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  quoteBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  quoteLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  quoteText: {
    fontSize: 13,
    lineHeight: 20,
  },
  more: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyRules: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  emptyRulesText: {
    fontSize: 13,
    lineHeight: 20,
  },
  rule: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  ruleTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  severityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 5,
  },
  ruleTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  ruleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  codePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  codeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  ruleMetaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ruleExplanation: {
    fontSize: 13,
    lineHeight: 20,
  },
  evidence: {
    borderLeftWidth: 3,
    paddingLeft: 10,
  },
  evidenceText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  ruleAction: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  recommendation: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  recommendationHeadline: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  actionIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  actionIndexText: {
    fontSize: 11,
    fontWeight: '800',
  },
  actionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  subBlock: {
    gap: 6,
    marginTop: 2,
  },
  subTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  support: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  bulletText: {
    fontSize: 12,
    lineHeight: 19,
  },
  uncertainties: {
    gap: 6,
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 17,
  },
  footerMeta: {
    fontSize: 10,
    fontWeight: '600',
  },
});
