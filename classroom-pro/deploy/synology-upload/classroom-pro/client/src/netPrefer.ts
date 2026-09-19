/**
 * 网络偏好：局域网优先探测，不通再走互联网 / 当前页同源。
 * 结果写入 localStorage，api / WebSocket 统一走优选基址。
 */

const LS_BASE = 'ccp_api_base';
const LS_LAN = 'ccp_lan_urls';
const LS_PUBLIC = 'ccp_public_url';
const LS_PATH = 'ccp_net_path'; // lan | public | local

let resolvedBase = ''; // '' = 相对当前页
let resolvedPath: 'lan' | 'public' | 'local' | 'unknown' = 'unknown';

export function getApiBase() {
  return resolvedBase;
}

export function getNetPath() {
  return resolvedPath;
}

function normalizeBase(u: string) {
  return String(u || '')
    .trim()
    .replace(/\/$/, '');
}

function sameOrigin(base: string) {
  if (!base) return true;
  try {
    return new URL(base).origin === window.location.origin;
  } catch {
    return false;
  }
}

async function probe(base: string, ms = 700): Promise<boolean> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const url = base ? `${normalizeBase(base)}/api/health` : '/api/health';
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return !!(data as any).ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

function cacheLan(urls: string[]) {
  try {
    localStorage.setItem(LS_LAN, JSON.stringify(urls.filter(Boolean)));
  } catch {
    /* ignore */
  }
}

function readCachedLan(): string[] {
  try {
    const raw = localStorage.getItem(LS_LAN);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(normalizeBase).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function setPublicUrlHint(url: string) {
  const u = normalizeBase(url);
  try {
    if (u) localStorage.setItem(LS_PUBLIC, u);
    else localStorage.removeItem(LS_PUBLIC);
  } catch {
    /* ignore */
  }
}

export function getPublicUrlHint() {
  try {
    return normalizeBase(localStorage.getItem(LS_PUBLIC) || '');
  } catch {
    return '';
  }
}

/** 启动时调用：先试局域网，再试当前页，再试互联网 */
export async function resolvePreferredEndpoint(): Promise<{ base: string; path: typeof resolvedPath }> {
  const cachedPublic = getPublicUrlHint();
  const cachedLan = readCachedLan();

  // 若当前页已能通，先拉一份 net/info 刷新候选（不阻塞过久）
  let remoteLan: string[] = [];
  let remotePublic = cachedPublic;
  if (await probe('', 500)) {
    try {
      const info = await fetch('/api/net/info', { cache: 'no-store' }).then((r) => r.json());
      remoteLan = (info.lan || []).map(normalizeBase);
      if (info.publicUrl) remotePublic = normalizeBase(info.publicUrl);
      if (remoteLan.length) cacheLan(remoteLan);
      if (remotePublic) setPublicUrlHint(remotePublic);
    } catch {
      /* ignore */
    }
  }

  const lanCandidates = [...new Set([...remoteLan, ...cachedLan])];
  // 开发态：前端 5174 时也试同主机 3789
  if (window.location.port === '5174') {
    const host = window.location.hostname;
    lanCandidates.unshift(`http://${host}:3789`);
  }

  // 1) 局域网
  for (const base of lanCandidates) {
    if (!base || sameOrigin(base)) continue;
    if (await probe(base, 700)) {
      resolvedBase = sameOrigin(base) ? '' : base;
      resolvedPath = 'lan';
      try {
        localStorage.setItem(LS_BASE, resolvedBase);
        localStorage.setItem(LS_PATH, resolvedPath);
      } catch {
        /* ignore */
      }
      return { base: resolvedBase, path: resolvedPath };
    }
  }

  // 当前页若在局域网 IP 上且健康
  const host = window.location.hostname;
  const isPrivate =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  if (isPrivate && (await probe('', 500))) {
    resolvedBase = '';
    resolvedPath = host === 'localhost' || host === '127.0.0.1' ? 'local' : 'lan';
    try {
      localStorage.setItem(LS_BASE, '');
      localStorage.setItem(LS_PATH, resolvedPath);
    } catch {
      /* ignore */
    }
    return { base: resolvedBase, path: resolvedPath };
  }

  // 2) 当前同源
  if (await probe('', 800)) {
    resolvedBase = '';
    resolvedPath = isPrivate ? (host === 'localhost' || host === '127.0.0.1' ? 'local' : 'lan') : 'public';
    try {
      localStorage.setItem(LS_BASE, '');
      localStorage.setItem(LS_PATH, resolvedPath);
    } catch {
      /* ignore */
    }
    return { base: resolvedBase, path: resolvedPath };
  }

  // 3) 互联网回退
  const publics = [...new Set([remotePublic, cachedPublic].filter(Boolean))];
  for (const base of publics) {
    if (await probe(base, 1500)) {
      resolvedBase = sameOrigin(base) ? '' : base;
      resolvedPath = 'public';
      try {
        localStorage.setItem(LS_BASE, resolvedBase);
        localStorage.setItem(LS_PATH, resolvedPath);
      } catch {
        /* ignore */
      }
      return { base: resolvedBase, path: resolvedPath };
    }
  }

  // 失败也尽量用同源相对路径
  resolvedBase = normalizeBase(localStorage.getItem(LS_BASE) || '');
  resolvedPath = (localStorage.getItem(LS_PATH) as any) || 'unknown';
  return { base: resolvedBase, path: resolvedPath };
}

export function apiUrl(path: string) {
  if (!path.startsWith('/')) return path;
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}

export function netPathLabel(path = resolvedPath) {
  if (path === 'lan') return '局域网';
  if (path === 'public') return '互联网';
  if (path === 'local') return '本机';
  return '探测中';
}
