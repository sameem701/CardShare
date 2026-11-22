import { Platform } from 'react-native';

const SCROLLBAR_STYLE_ID = 'cardshare-scrollbar';

export function installWebChrome() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById(SCROLLBAR_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = SCROLLBAR_STYLE_ID;
  style.textContent = `
    :root { color-scheme: dark; }
    html, body { background: #0A0A0B; }
    *::-webkit-scrollbar { width: 0; height: 0; }
    * { scrollbar-width: none; }
    input:focus, textarea:focus { outline: none; }
  `;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#1E1F21');
  document.head.appendChild(style);
}

export const hiddenScrollProps = {
  showsVerticalScrollIndicator: false,
  showsHorizontalScrollIndicator: false,
};
