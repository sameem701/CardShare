import { useRef } from 'react';
import { Image } from 'react-native';

export default function ProofImage({ uri, onReload, style, resizeMode = 'contain' }) {
  const tried = useRef(false);
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel="Proof screenshot"
      onError={() => {
        if (tried.current) return;
        tried.current = true;
        onReload?.();
      }}
    />
  );
}
