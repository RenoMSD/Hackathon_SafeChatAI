import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { SHARE_TEXT_MAX_LENGTH, type ShareAnalysisResponse } from '@safechat/contracts';
import { HistoryList } from '../components/HistoryList';
import { ScanResultCard } from '../components/ScanResultCard';
import { useHistory } from '../hooks/useHistory';
import { useShareIntent } from '../hooks/useShareIntent';
import { GATEWAY_URL, ShareApiError, analyzeSharedText } from '../services/api';
import { useTheme } from '../theme';
import type { HistoryEntry, ScanSource } from '../types';
import { createId, snippet } from '../utils/format';

type ScanStatus = 'idle' | 'scanning' | 'done' | 'error';

const cardShadow =
  Platform.select({
    ios: {
      shadowColor: '#0f172a',
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  }) ?? {};

export function HomeScreen() {
  const { colors } = useTheme();
  const { content: sharedContent, clear: clearSharedContent, isReady: shareReady, error: shareError } =
    useShareIntent();
  const {
    items: historyItems,
    loading: historyLoading,
    add: addHistory,
    clear: clearHistory,
  } = useHistory();

  const [manualText, setManualText] = useState('');
  const [activeText, setActiveText] = useState('');
  const [activeSource, setActiveSource] = useState<ScanSource>('manual');
  const [activeOrigin, setActiveOrigin] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [analysis, setAnalysis] = useState<ShareAnalysisResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFullShareText, setShowFullShareText] = useState(false);

  const requestRef = useRef(0);
  const resultAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const resultY = useRef(0);

  const runScan = useCallback(
    async (text: string, source: ScanSource, origin?: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      requestRef.current += 1;
      const requestId = requestRef.current;

      setActiveText(trimmed);
      setActiveSource(source);
      setActiveOrigin(origin);
      setStatus('scanning');
      setAnalysis(null);
      setErrorMessage(null);
      resultAnim.setValue(0);

      try {
        const result = await analyzeSharedText(trimmed, origin);
        if (requestId !== requestRef.current) return;

        setAnalysis(result);
        setStatus('done');
        addHistory({
          id: createId('scan'),
          text: trimmed,
          source,
          createdAt: result.analyzedAt,
          analysis: result,
        });

        Animated.timing(resultAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }).start();
      } catch (error) {
        if (requestId !== requestRef.current) return;

        const message =
          error instanceof ShareApiError ? error.message : 'Không thể phân tích nội dung lúc này.';
        setErrorMessage(message);
        setStatus('error');
      }
    },
    [addHistory, resultAnim],
  );

  useEffect(() => {
    if (!sharedContent) return;

    setShowFullShareText(false);
    void runScan(sharedContent.text, 'share', sharedContent.source);
  }, [sharedContent, runScan]);

  const handleManualScan = useCallback(() => {
    const trimmed = manualText.trim();
    if (trimmed.length === 0) return;

    clearSharedContent();
    void runScan(trimmed, 'manual');
  }, [clearSharedContent, manualText, runScan]);

  const handleRetry = useCallback(() => {
    if (activeText.length === 0) return;
    void runScan(activeText, activeSource, activeOrigin);
  }, [activeOrigin, activeSource, activeText, runScan]);

  const handleHistorySelect = useCallback(
    (entry: HistoryEntry) => {
      requestRef.current += 1;
      setActiveText(entry.text);
      setActiveSource(entry.source);
      setActiveOrigin(undefined);
      setAnalysis(entry.analysis);
      setStatus('done');
      setErrorMessage(null);
      setManualText(entry.text);

      resultAnim.setValue(0);
      Animated.timing(resultAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }).start();

      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, resultY.current - 12), animated: true });
      });
    },
    [resultAnim],
  );

  const canScan = manualText.trim().length > 0 && status !== 'scanning';
  const isShareFlow = sharedContent !== null && activeSource === 'share' && status !== 'idle';

  const scanBlock = (
    <>
      {status === 'scanning' && (
        <View style={[styles.scanningCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ActivityIndicator size="large" color={colors.brand} />
          <View style={styles.scanningBody}>
            <Text style={[styles.scanningTitle, { color: colors.text }]}>Đang phân tích nội dung...</Text>
            <Text style={[styles.scanningSubtitle, { color: colors.muted }]}>
              Đang gọi API SafeChat Gateway và đối chiếu bộ luật.
            </Text>
            <Text style={[styles.scanningPreview, { color: colors.muted }]} numberOfLines={3}>
              {snippet(activeText, 220)}
            </Text>
          </View>
        </View>
      )}

      {status === 'error' && (
        <View style={[styles.errorCard, { backgroundColor: colors.highSoft, borderColor: colors.high }]}>
          <Text style={[styles.errorTitle, { color: colors.high }]}>Không thể hoàn tất kiểm tra</Text>
          <Text style={[styles.errorText, { color: colors.text }]}>{errorMessage ?? 'Đã xảy ra lỗi.'}</Text>
          <Text style={[styles.errorHint, { color: colors.muted }]}>
            Kiểm tra gateway đang chạy và điện thoại cùng mạng Wi-Fi. Địa chỉ: {GATEWAY_URL}
          </Text>
          <Pressable
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Thử lại kiểm tra"
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: colors.high, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.brandContrast }]}>Thử lại</Text>
          </Pressable>
        </View>
      )}

      {status === 'done' && analysis && (
        <Animated.View
          onLayout={(event) => {
            resultY.current = event.nativeEvent.layout.y;
          }}
          style={{
            opacity: resultAnim,
            transform: [
              {
                translateY: resultAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          }}
        >
          <ScanResultCard result={analysis} scannedText={activeText} />
        </Animated.View>
      )}
    </>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={[styles.logoWrap, { backgroundColor: colors.brand }]}>
              <Svg width={26} height={30} viewBox="0 0 24 28">
                <Path
                  d="M12 1.5 22 5v8.2c0 6.3-4.2 11-10 13.3C6.2 24.2 2 19.5 2 13.2V5l10-3.5Z"
                  fill={colors.brandContrast}
                />
                <Path
                  d="m7.7 13.7 2.8 2.8 5.9-6.1"
                  stroke={colors.brand}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </View>

            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>SafeChat AI Shield</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Kiểm tra dấu hiệu lừa đảo trong tin nhắn
              </Text>
            </View>

            <View
              style={[
                styles.statusPill,
                { backgroundColor: shareReady ? colors.lowSoft : colors.surfaceAlt },
              ]}
            >
              <View
                style={[styles.statusDot, { backgroundColor: shareReady ? colors.low : colors.muted }]}
              />
              <Text style={[styles.statusText, { color: shareReady ? colors.low : colors.muted }]}>
                {shareReady ? 'Sẵn sàng' : 'Đang khởi động'}
              </Text>
            </View>
          </View>

          <Text style={[styles.privacy, { color: colors.muted }]}>
            Nội dung chỉ dùng để phân tích. Gateway không lưu tin nhắn của bạn.
          </Text>

          {sharedContent && (
            <View
              style={[
                styles.shareCard,
                { backgroundColor: colors.brandSoft, borderColor: colors.brand },
              ]}
            >
              <View style={styles.shareHeader}>
                <View style={[styles.shareDot, { backgroundColor: colors.brand }]} />
                <Text style={[styles.eyebrow, styles.shareLabel, { color: colors.brand }]}>
                  NỘI DUNG VỪA ĐƯỢC CHIA SẺ
                </Text>
                <Pressable
                  onPress={clearSharedContent}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Đóng nội dung chia sẻ"
                >
                  <Text style={[styles.shareClose, { color: colors.brand }]}>Đóng</Text>
                </Pressable>
              </View>

              <Text
                style={[styles.shareText, { color: colors.text }]}
                numberOfLines={showFullShareText ? undefined : 6}
              >
                {sharedContent.text}
              </Text>

              {sharedContent.text.length > 240 && (
                <Pressable
                  onPress={() => setShowFullShareText((value) => !value)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.shareMore, { color: colors.brand }]}>
                    {showFullShareText ? 'Thu gọn' : 'Xem thêm'}
                  </Text>
                </Pressable>
              )}

              <Text style={[styles.shareSource, { color: colors.muted }]}>
                Từ: {sharedContent.source}
              </Text>

              {shareError !== null && shareError.length > 0 && (
                <Text style={[styles.shareError, { color: colors.high }]}>
                  Không đọc được một phần dữ liệu chia sẻ. Bạn vẫn có thể dán nội dung thủ công.
                </Text>
              )}
            </View>
          )}

          {isShareFlow && scanBlock}

          <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.eyebrow, { color: colors.muted }]}>KIỂM TRA THỦ CÔNG</Text>
            <Text style={[styles.inputTitle, { color: colors.text }]}>Dán tin nhắn hoặc đường link</Text>

            <TextInput
              value={manualText}
              onChangeText={setManualText}
              placeholder="Ví dụ: Đóng phí hồ sơ 500 nghìn để nhận việc..."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={SHARE_TEXT_MAX_LENGTH}
              textAlignVertical="top"
              autoCapitalize="sentences"
              selectionColor={colors.brand}
              accessibilityLabel="Nội dung cần kiểm tra"
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <View style={styles.inputFooter}>
              <Text style={[styles.counter, { color: colors.muted }]}>
                {manualText.length}/{SHARE_TEXT_MAX_LENGTH}
              </Text>
              <Pressable
                onPress={handleManualScan}
                disabled={!canScan}
                accessibilityRole="button"
                accessibilityLabel="Quét nhanh nội dung"
                style={({ pressed }) => [
                  styles.scanButton,
                  {
                    backgroundColor: colors.brand,
                    opacity: !canScan ? 0.45 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {status === 'scanning' ? (
                  <ActivityIndicator size="small" color={colors.brandContrast} />
                ) : (
                  <Text style={[styles.scanButtonText, { color: colors.brandContrast }]}>Quét nhanh</Text>
                )}
              </Pressable>
            </View>
          </View>

          {!isShareFlow && scanBlock}

          <HistoryList
            items={historyItems}
            loading={historyLoading}
            onSelect={handleHistorySelect}
            onClear={clearHistory}
          />

          <Text style={[styles.footer, { color: colors.muted }]}>
            SafeChat AI Shield v0.5.0 · Điểm dấu hiệu, không phải xác suất lừa đảo.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 44,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  privacy: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: -6,
  },
  shareCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 9,
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  shareDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  shareLabel: {
    flex: 1,
  },
  shareClose: {
    fontSize: 12,
    fontWeight: '700',
  },
  shareText: {
    fontSize: 14,
    lineHeight: 21,
  },
  shareMore: {
    fontSize: 12,
    fontWeight: '700',
  },
  shareSource: {
    fontSize: 11,
    fontWeight: '600',
  },
  shareError: {
    fontSize: 11,
    lineHeight: 17,
  },
  scanningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    ...cardShadow,
  },
  scanningBody: {
    flex: 1,
    gap: 4,
  },
  scanningTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  scanningSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  scanningPreview: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  errorCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
  },
  errorHint: {
    fontSize: 11,
    lineHeight: 17,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '800',
  },
  inputCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    ...cardShadow,
  },
  inputTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  input: {
    minHeight: 112,
    maxHeight: 190,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    lineHeight: 21,
  },
  inputFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  counter: {
    fontSize: 11,
    fontWeight: '600',
  },
  scanButton: {
    minWidth: 112,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  scanButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
  },
});
