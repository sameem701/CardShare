import Svg, { Circle, Path, Rect } from 'react-native-svg';

export function NavIcon({ name, color }) {
  if (name === 'home') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
        <Path d="M9 21V12h6v9" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (name === 'circle') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Circle cx="9" cy="8" r="3" stroke={color} strokeWidth="1.8" />
        <Path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <Path d="M16 6c1.7 0 3 1.3 3 3s-1.3 3-3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <Path d="M18 17c1.7.6 3 2.3 3 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    );
  }
  if (name === 'request') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Rect x="2" y="7" width="20" height="14" rx="3" stroke={color} strokeWidth="1.8" />
        <Path d="M16 7V6a4 4 0 0 0-8 0v1" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <Circle cx="12" cy="14" r="2" stroke={color} strokeWidth="1.8" />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 8v4l3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M3.05 11a9 9 0 1 0 .49-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M3 4v4h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
