import { getToken } from './api';
import { apiUrl, getApiBase } from './netPrefer';

export type LiveHandler = (msg: { type: string; payload?: any; id?: number }) => void;
export type SignalHandler = (msg: { from?: string; action?: string; payload?: any }) => void;
export type PresenceHandler = (p: { boards: number; teachers: number; boardOnline: boolean }) => void;

function wsUrl(role: string) {
  const token = getToken();
  const base = getApiBase();
  let host = window.location.host;
  let proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (base) {
    try {
      const u = new URL(base);
      host = u.host;
      proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    } catch {
      /* ignore */
    }
  }
  return `${proto}//${host}/ws?token=${encodeURIComponent(token)}&role=${encodeURIComponent(role)}`;
}

/** 统一实时通道：WebSocket 优先，失败时回退 EventSource */
export function connectLive(opts: {
  role: 'teacher' | 'board' | 'desktop' | 'client';
  onLive: LiveHandler;
  onSignal?: SignalHandler;
  onPresence?: PresenceHandler;
  onStatus?: (s: string) => void;
}) {
  let ws: WebSocket | null = null;
  let es: EventSource | null = null;
  let closed = false;
  let retryTimer: number | null = null;
  let signalOut: ((msg: any) => void) | null = null;

  const setStatus = (s: string) => opts.onStatus?.(s);

  const handlePayload = (msg: any) => {
    if (!msg) return;
    if (msg.type === 'hello') {
      setStatus('已同步');
      if (msg.payload?.presence) opts.onPresence?.(msg.payload.presence);
      return;
    }
    if (msg.type === 'pong') {
      setStatus('已同步');
      return;
    }
    if (msg.type === 'presence') {
      opts.onPresence?.(msg.payload || {});
      return;
    }
    if (msg.type === 'wake') {
      opts.onLive({ type: 'wake', payload: msg.payload || {} });
      return;
    }
    if (msg.type === 'signal') {
      opts.onSignal?.(msg);
      return;
    }
    if (msg.channel === 'live' && msg.event) {
      opts.onLive({ type: msg.event.type, payload: msg.event.payload, id: msg.event.id });
      return;
    }
    // SSE 直推的是 event 本体
    if (msg.type && msg.payload !== undefined) {
      opts.onLive({ type: msg.type, payload: msg.payload, id: msg.id });
    }
  };

  const connectWs = () => {
    if (closed) return;
    try {
      ws = new WebSocket(wsUrl(opts.role));
      ws.onopen = () => {
        setStatus('WebSocket 已连接');
        signalOut = (msg) => {
          if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
        };
      };
      ws.onmessage = (ev) => {
        try {
          handlePayload(JSON.parse(ev.data));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        signalOut = null;
        setStatus('同步断开，重连中…');
        if (!closed) retryTimer = window.setTimeout(connectWs, 1500);
      };
      ws.onerror = () => {
        ws?.close();
      };
    } catch {
      connectSse();
    }
  };

  const connectSse = () => {
    const token = getToken();
    es = new EventSource(apiUrl(`/api/sync/stream?token=${encodeURIComponent(token)}`));
    es.onopen = () => setStatus('SSE 已连接');
    es.onmessage = (ev) => {
      try {
        handlePayload(JSON.parse(ev.data));
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => setStatus('SSE 异常');
  };

  connectWs();

  return {
    close() {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      ws?.close();
      es?.close();
    },
    sendSignal(action: string, payload: any, to: 'board' | 'teacher' | 'all' = 'all') {
      signalOut?.({ type: 'signal', action, payload, to });
    },
    ping() {
      signalOut?.({ type: 'ping' });
    },
  };
}
