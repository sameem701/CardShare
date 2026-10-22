import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import PageDots from '../components/PageDots';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import { useTopInset } from '../hooks/useTopInset';
import theme from '../constants/theme';

const green = theme.colors.green;

const slides = [
  {
    title: 'Build your circle',
    body: 'Add friends and family you trust.',
    steps: [
      ['Open the ', { b: 'Circle' }, ' tab and tap ', { b: '+ Add' }],
      ['Type their phone number'],
      ['Send the invite to connect'],
    ],
    note: '',
  },
  {
    title: 'Share the benefit, not the card',
    body: 'Cardholders turn on sharing and place orders for friends.',
    steps: [
      ['Pick the card in your ', { b: 'Request' }, ' screen'],
      ['Add the store, price, and your delivery address'],
      ['They accept, order, and upload the receipt'],
    ],
    note: '',
  },
  {
    title: 'Direct settlement',
    body: 'Settle payment directly with each other once proof is sent.',
    steps: [
      ['Check the receipt on the order'],
      ['Send payment directly outside the app'],
      ['The cardholder taps ', { b: 'Money received' }, ' to close it'],
    ],
    note: '',
  },
];

function RichLine({ parts, style }) {
  return (
    <Text style={style}>
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          part
        ) : (
          <Text key={index} style={styles.stepBold}>
            {part.b}
          </Text>
        )
      )}
    </Text>
  );
}

function SlideArt({ index }) {
  if (index === 0) {
    return (
      <Svg width={136} height={136} viewBox="0 0 144 144" fill="none">
        <Circle cx="72" cy="72" r="66" fill="rgba(0,200,122,0.08)" stroke="rgba(0,200,122,0.25)" strokeDasharray="3 5" />
        <G transform="translate(72 72) scale(0.92) translate(-64 -60.5)">
          <Path d="M64 34L38 82M64 34L90 82M38 82H90" stroke={green} strokeOpacity={0.35} strokeWidth="2" />
          <G stroke={green} strokeWidth="2.5" strokeLinecap="round" fill={theme.colors.bg}>
            <Circle cx="64" cy="30" r="7" />
            <Path d="M52 50c2-6 6-8 12-8s10 2 12 8" />
            <Circle cx="38" cy="78" r="7" />
            <Path d="M26 98c2-6 6-8 12-8s10 2 12 8" />
            <Circle cx="90" cy="78" r="7" />
            <Path d="M78 98c2-6 6-8 12-8s10 2 12 8" />
          </G>
        </G>
      </Svg>
    );
  }
  if (index === 1) {
    return (
      <Svg width={136} height={136} viewBox="0 0 144 144" fill="none">
        <Circle cx="72" cy="72" r="66" fill="rgba(0,200,122,0.08)" />
        <Rect x="22" y="58" width="42" height="28" rx="5.5" fill={theme.colors.vcardFace} stroke={green} strokeWidth="2.3" />
        <Path d="M22 66.5h42" stroke={green} strokeWidth="2.3" />
        <Rect x="27.5" y="74" width="12" height="4.2" rx="2.1" fill={green} />
        <Path d="M73 72h15m0 0l-5.5-5.5m5.5 5.5l-5.5 5.5" stroke={green} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        <Rect x="97" y="67" width="25" height="20" rx="4.5" stroke={green} strokeWidth="2.3" />
        <Path d="M103 67v-4a6.5 6.5 0 0 1 13 0v4" stroke={green} strokeWidth="2.3" strokeLinecap="round" />
        <Circle cx="109.5" cy="76.5" r="2.3" fill={green} />
      </Svg>
    );
  }
  return (
    <Svg width={136} height={136} viewBox="0 0 144 144" fill="none">
      <Circle cx="72" cy="72" r="66" fill="rgba(0,200,122,0.08)" />
      <Circle cx="41.5" cy="72" r="20" fill={theme.colors.vcardFace} stroke={green} strokeWidth="2.3" />
      <SvgText
        x="41.5"
        y="72.5"
        textAnchor="middle"
        alignmentBaseline="central"
        fontFamily="Syne"
        fontWeight="700"
        fontSize="12.5"
        fill={green}
      >
        PKR
      </SvgText>
      <Path d="M70.5 72h15m0 0l-5.5-5.5m5.5 5.5l-5.5 5.5" stroke={green} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="108.5" cy="72" r="14" fill={green} />
      <Path d="M101.5 72l4.8 4.8 9.2-9.6" stroke={theme.colors.black} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function HowItWorksScreen({ step, onStep, onBack, onContinue, finishLabel = 'Continue' }) {
  const topInset = useTopInset();
  const scroller = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const pageFromScroll = useRef(step);
  const widthRef = useRef(0);
  const lock = useRef(false);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const index = step;
  const last = index === slides.length - 1;

  useEffect(() => {
    const width = frame.width;
    if (!width) return;
    const widthChanged = widthRef.current !== width;
    const samePage = step === pageFromScroll.current && !widthChanged;
    widthRef.current = width;
    if (samePage) return;
    const animate = !widthChanged && step !== pageFromScroll.current;
    pageFromScroll.current = step;
    lock.current = true;
    scroller.current?.scrollTo({ x: step * width, animated: animate });
    if (!animate) lock.current = false;
  }, [step, frame.width]);

  const onScroll = useRef(
    Animated.event(
      [{ nativeEvent: { contentOffset: { x: scrollX } } }],
      {
        useNativeDriver: true,
        listener: (event) => {
          const width = widthRef.current;
          const x = event.nativeEvent.contentOffset.x;
          if (!width) return;
          if (lock.current) {
            if (Math.abs(x - pageFromScroll.current * width) < 2) lock.current = false;
            return;
          }
          const next = Math.max(0, Math.min(slides.length - 1, Math.round(x / width)));
          if (next === pageFromScroll.current) return;
          pageFromScroll.current = next;
          onStepRef.current(next);
        },
      }
    )
  ).current;

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <View style={styles.top}>
        <Pressable
          onPress={onContinue}
          pointerEvents={last ? 'none' : 'auto'}
          style={[styles.skip, last && styles.skipHidden]}
          accessibilityRole="button"
          accessibilityLabel="Skip"
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>
      <View
        style={styles.pager}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setFrame((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        }}
      >
        {frame.width > 0 ? (
          <Animated.ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={frame.width}
            snapToAlignment="start"
            disableIntervalMomentum
            scrollEventThrottle={16}
            onScroll={onScroll}
            onScrollBeginDrag={() => {
              lock.current = false;
            }}
            onMomentumScrollEnd={() => {
              lock.current = false;
            }}
            style={{ width: frame.width, height: frame.height }}
          >
            {slides.map((slide, slideIndex) => (
              <View key={slide.title} style={[styles.page, { width: frame.width, height: frame.height }]}>
                <View style={styles.art}>
                  <SlideArt index={slideIndex} />
                </View>
                <Text style={styles.kicker}>{`Step ${slideIndex + 1} of ${slides.length}`}</Text>
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.copy}>{slide.body}</Text>
                <View style={styles.steps}>
                  {slide.steps.map((parts, stepIndex) => (
                    <View key={stepIndex} style={styles.step}>
                      <View style={styles.num}>
                        <Text style={styles.numText}>{stepIndex + 1}</Text>
                      </View>
                      <RichLine parts={parts} style={styles.stepText} />
                    </View>
                  ))}
                </View>
                {slide.note ? <Text style={styles.note}>{slide.note}</Text> : null}
              </View>
            ))}
          </Animated.ScrollView>
        ) : null}
      </View>
      <View style={styles.dots}>
        <PageDots
          count={slides.length}
          scrollX={scrollX}
          pageWidth={frame.width}
          labels={slides.map((item) => item.title)}
          onSelect={onStep}
        />
      </View>
      <View style={styles.actions}>
        <PrimaryButton
          label={last ? finishLabel : 'Next'}
          onPress={() => {
            if (last) onContinue();
            else onStep(index + 1);
          }}
        />
        <SecondaryButton
          label="Back"
          onPress={() => {
            if (index === 0) onBack();
            else onStep(index - 1);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.xxl,
    paddingBottom: theme.spacing.xxl,
  },
  top: {
    minHeight: 36,
    alignItems: 'flex-end',
  },
  skip: {
    paddingVertical: 6,
  },
  skipHidden: {
    opacity: 0,
  },
  skipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    color: theme.colors.text2,
  },
  pager: {
    flex: 1,
  },
  page: {
    justifyContent: 'center',
  },
  art: {
    alignItems: 'center',
    marginBottom: 14,
  },
  kicker: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.colors.text3,
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: theme.colors.text,
    marginBottom: 10,
  },
  copy: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.text2,
  },
  steps: {
    marginTop: theme.spacing.lg,
    gap: 10,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  num: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 12,
    color: theme.colors.green,
  },
  stepText: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
  stepBold: {
    fontFamily: theme.fonts.bodyMedium,
    color: theme.colors.text,
  },
  note: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 14,
    borderRadius: theme.radius.control + 2,
    backgroundColor: theme.colors.bg2,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 19,
    color: theme.colors.text2,
  },
  dots: {
    marginBottom: 22,
  },
  actions: {
    gap: 10,
  },
});
