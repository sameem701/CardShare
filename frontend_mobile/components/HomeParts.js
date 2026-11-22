import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import theme from '../constants/theme';
import PrimaryButton from './PrimaryButton';

// Small pieces the Home, History, Manage cards and Requests screens share.

export function HomeIntro({ eyebrow, title, text }) {
  return (
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.introTitle}>{title}</Text>
      {text ? <Text style={styles.introText}>{text}</Text> : null}
    </View>
  );
}

export function SectionHeading({ eyebrow, title, count, action }) {
  return (
    <View style={styles.heading}>
      <View>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.headingTitle}>{title}</Text>
      </View>
      {action || (count ? <Text style={styles.count}>{count}</Text> : null)}
    </View>
  );
}

export function PrivacyNote({ children }) {
  return (
    <View style={styles.privacy}>
      <Text style={styles.privacyMark}>⌑</Text>
      <Text style={styles.privacyText}>{children}</Text>
    </View>
  );
}

const ICONS = {
  circle: (color) => (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="8" r="3" stroke={color} strokeWidth="1.8" />
      <Circle cx="17" cy="9" r="2.4" stroke={color} strokeWidth="1.8" />
      <Path d="M3.5 19c.5-3 2.5-4.5 5.5-4.5s5 1.5 5.5 4.5M15 15c2.8-.2 4.5 1.1 5 3.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  ),
  card: (color) => (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="14" rx="3" stroke={color} strokeWidth="1.8" />
      <Path d="M3 10h18" stroke={color} strokeWidth="1.8" />
    </Svg>
  ),
  history: (color) => (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.8" />
      <Path d="M12 8v4l3 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
};

// The dashed box shown when there is nothing yet. extra sits above the button.
export function CircleEmpty({ icon = 'circle', title, text, button, onPress, extra }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{ICONS[icon](theme.colors.green)}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {extra}
      {button ? (
        <View style={styles.emptyAction}>
          <PrimaryButton label={button} onPress={onPress} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingTop: 12,
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: 18,
  },
  eyebrow: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.3,
    color: theme.colors.text3,
  },
  introTitle: {
    marginTop: 9,
    fontFamily: theme.fonts.display,
    fontSize: 27,
    lineHeight: 31,
    letterSpacing: -0.7,
    color: theme.colors.text,
  },
  introText: {
    marginTop: 9,
    maxWidth: 290,
    fontFamily: theme.fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text2,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: 12,
  },
  headingTitle: {
    marginTop: 5,
    fontFamily: theme.fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: theme.colors.text,
  },
  count: {
    fontFamily: theme.fonts.body,
    fontSize: 11,
    color: theme.colors.text2,
    paddingBottom: 2,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 7,
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: 14,
  },
  privacyMark: {
    fontSize: 14,
    color: theme.colors.green,
  },
  privacyText: {
    fontFamily: theme.fonts.body,
    fontSize: 10,
    color: theme.colors.text3,
  },
  empty: {
    marginHorizontal: theme.layout.screenPadding,
    marginBottom: 18,
    paddingVertical: 24,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border2,
    backgroundColor: theme.colors.bg2,
    alignItems: 'center',
    gap: 9,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: theme.colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  emptyTitle: {
    fontFamily: theme.fonts.display,
    fontSize: 17,
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 240,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.text2,
    textAlign: 'center',
  },
  emptyAction: {
    width: '100%',
    marginTop: 5,
  },
});
