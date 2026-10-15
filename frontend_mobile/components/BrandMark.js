import Svg, { Circle, Path, Rect } from 'react-native-svg';

export default function BrandMark({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="7" width="20" height="14" rx="3" stroke="black" strokeWidth="2.5" />
      <Path d="M16 7V6a4 4 0 0 0-8 0v1" stroke="black" strokeWidth="2.5" strokeLinecap="round" />
      <Circle cx="12" cy="14" r="2" fill="black" />
    </Svg>
  );
}
