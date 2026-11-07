import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { HistoryEntry } from '../types';
import { riskColor, riskSoftColor, useTheme } from '../theme';
import { formatRelativeTime, snippet } from '../utils/format';

interface HistoryListProps {
  items: HistoryEntry[];
  loading: boolean;
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
}

export function HistoryList({ items, loading, onSelect, onClear }: HistoryListProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>Lịch sử kiểm tra</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>5 kết quả gần nhất, chỉ lưu trên thiết bị</Text>
        </View>
        {items.length > 0 && (
          <Pressable
            onPress={onClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Xóa lịch sử kiểm tra"
          >
            <Text style={[styles.clear, { color: colors.muted }]}>Xóa</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Chưa có kết quả nào</Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Chia sẻ một tin nhắn từ Zalo, Messenger, SMS hoặc trình duyệt — hoặc dán nội dung vào ô kiểm tra thủ
            công để bắt đầu.
          </Text>
        </View>
      ) : (
        items.map((entry) => {
          const color = riskColor(entry.analysis.riskLevel, colors);
          const soft = riskSoftColor(entry.analysis.riskLevel, colors);

          return (
            <Pressable
              key={entry.id}
              onPress={() => onSelect(entry)}
              accessibilityRole="button"
              accessibilityLabel={`Mở kết quả ${entry.analysis.riskLabel}, điểm ${entry.analysis.riskScore} phần trăm`}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <View style={[styles.scoreBadge, { backgroundColor: soft, borderColor: color }]}>
                <Text style={[styles.scoreText, { color }]}>{entry.analysis.riskScore}%</Text>
              </View>

              <View style={styles.itemBody}>
                <View style={styles.itemTop}>
                  <Text style={[styles.itemLevel, { color }]}>{entry.analysis.riskLabel}</Text>
                  <Text style={[styles.itemTime, { color: colors.muted }]}>
                    {formatRelativeTime(entry.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.itemText, { color: colors.text }]} numberOfLines={2}>
                  {snippet(entry.text, 120)}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.muted }]}>
                  {entry.source === 'share' ? 'Nhận từ chia sẻ' : 'Nhập thủ công'} ·{' '}
                  {entry.analysis.matchedRules.length} quy tắc
                </Text>
              </View>

              <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  clear: {
    fontSize: 12,
    fontWeight: '700',
  },
  centered: {
    paddingVertical: 22,
    alignItems: 'center',
  },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 19,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  scoreBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '800',
  },
  itemBody: {
    flex: 1,
    gap: 3,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemLevel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  itemTime: {
    fontSize: 10,
    fontWeight: '600',
  },
  itemText: {
    fontSize: 13,
    lineHeight: 19,
  },
  itemMeta: {
    fontSize: 10,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 24,
    fontWeight: '300',
  },
});
