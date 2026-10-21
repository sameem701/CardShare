let clear = () => {};

export function registerChatCacheClear(fn) {
  clear = fn;
}

export function clearChatCache() {
  clear();
}
