const BOARD_NAME = 'classroom-board';
const WAKE_KEY = 'ccp_board_wake';
const CHANNEL = 'ccp-board';

declare global {
  interface Window {
    __ccpBoardRef?: Window | null;
  }
}

/** 真机手机/小平板：避免误伤带触摸屏的 Windows 笔记本 */
export function isTouchLikeDevice() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPod|Mobile/i.test(ua)) return true;
  if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)) {
    return true;
  }
  // 仅当「粗指针且无悬停」且窄屏，才视为手机控台
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  const noHover = window.matchMedia?.('(hover: none)')?.matches;
  const narrow = window.matchMedia?.('(max-width: 900px)')?.matches;
  return !!(coarse && noHover && narrow);
}

function boardUrl() {
  return `${window.location.origin}${window.location.pathname}?mode=board`;
}

/**
 * 仅在用户主动点击「打开教室大屏」时调用。
 * 手机教师端不弹窗、不跳转（避免 about:blank / 离开控台）；大屏应在教室电脑打开。
 */
export function openBoardWindow() {
  const url = boardUrl();
  if (isTouchLikeDevice()) {
    window.alert(
      '手机请继续用教师端发指令。\n教室大屏请在一体机/教室电脑打开（网页 ?mode=board 或托盘 EXE）。\n两端登录同一班级即可自动连接。',
    );
    return null;
  }
  const features = 'popup=yes,width=1280,height=800';
  const w = window.open(url, BOARD_NAME, features);
  if (w && !w.closed) {
    window.__ccpBoardRef = w;
    try {
      w.focus();
    } catch {
      /* ignore */
    }
  } else {
    window.alert('浏览器拦截了弹窗。请允许本站弹窗，或在教室电脑单独打开大屏页。');
  }
  return w;
}

/**
 * 唤醒已打开的教室大屏。
 * 禁止 window.open('', name)——会新建/导航到 about:blank。
 * 跨设备依赖 WebSocket；本机仅 focus 自己打开过的窗口引用。
 */
export function wakeBoard(payload?: Record<string, any>) {
  const stamp = String(Date.now());
  const data = JSON.stringify({ stamp, ...(payload || {}) });
  try {
    localStorage.setItem(WAKE_KEY, data);
  } catch {
    /* ignore */
  }
  try {
    new BroadcastChannel(CHANNEL).postMessage({ type: 'wake', payload });
  } catch {
    /* ignore */
  }

  // 手机教师端：绝不调用 window.open
  if (isTouchLikeDevice()) return;

  const w = window.__ccpBoardRef;
  if (!w || w.closed) {
    window.__ccpBoardRef = null;
    return;
  }
  try {
    // 若引用仍是空白页，放弃，避免 focus 到 about:blank
    const href = String(w.location?.href || '');
    if (!href || href === 'about:blank') {
      try {
        w.close();
      } catch {
        /* ignore */
      }
      window.__ccpBoardRef = null;
      return;
    }
  } catch {
    // 跨域读 location 会抛错，说明窗口有真实页面，可继续 focus
  }
  try {
    w.focus();
  } catch {
    /* ignore */
  }
  try {
    w.postMessage({ type: 'ccp-wake', payload }, window.location.origin);
  } catch {
    /* ignore */
  }
}

export function isBoardWindowAlive(): boolean {
  if (isTouchLikeDevice()) return false;
  const w = window.__ccpBoardRef;
  if (!w || w.closed) return false;
  try {
    const href = String(w.location?.href || '');
    if (!href || href === 'about:blank') return false;
  } catch {
    /* cross-origin ok */
  }
  return true;
}

export function onBoardWake(handler: (payload?: any) => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === WAKE_KEY && e.newValue) {
      try {
        handler(JSON.parse(e.newValue));
      } catch {
        handler();
      }
    }
  };
  window.addEventListener('storage', onStorage);

  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (ev) => {
      if (ev.data?.type === 'wake') handler(ev.data.payload);
    };
  } catch {
    /* ignore */
  }

  const onMsg = (ev: MessageEvent) => {
    if (ev.origin !== window.location.origin) return;
    if (ev.data?.type === 'ccp-wake') handler(ev.data.payload);
  };
  window.addEventListener('message', onMsg);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('message', onMsg);
    ch?.close();
  };
}
