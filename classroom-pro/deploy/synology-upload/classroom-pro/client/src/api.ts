import { getApiBase, apiUrl } from './netPrefer';

const TOKEN_KEY = 'ccp_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const method = (options.method || 'GET').toUpperCase();
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const hasBody = options.body != null && options.body !== '';
  // DELETE/GET 无 body 时不要强行加 JSON Content-Type（部分代理会异常）
  if (!isForm && hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('x-token', token);
  const url = apiUrl(path);
  const res = await fetch(url, { ...options, method, headers, mode: getApiBase() ? 'cors' : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || res.statusText || '请求失败');
  return data as T;
}

export function speak(text: string, opts?: { rate?: number; pitch?: number; times?: number }) {
  if (!text?.trim()) return;
  speakQueue([text], opts);
}

/** 按顺序完整播报，上一段结束再播下一段（避免 cancel 截断） */
export function speakQueue(
  parts: string[],
  opts?: { rate?: number; pitch?: number; times?: number; cancel?: boolean },
) {
  if (!('speechSynthesis' in window)) return;
  const list = parts.map((t) => String(t || '').trim()).filter(Boolean);
  if (!list.length) return;
  const times = Math.max(1, opts?.times || 1);
  const queue: string[] = [];
  for (let r = 0; r < times; r += 1) queue.push(...list);

  if (opts?.cancel !== false) window.speechSynthesis.cancel();

  let i = 0;
  const next = () => {
    if (i >= queue.length) return;
    const u = new SpeechSynthesisUtterance(queue[i]);
    i += 1;
    u.lang = 'zh-CN';
    u.rate = opts?.rate ?? 1;
    u.pitch = opts?.pitch ?? 1;
    u.onend = () => setTimeout(next, 280);
    u.onerror = () => setTimeout(next, 280);
    window.speechSynthesis.speak(u);
  };
  next();
}

/** 从呼叫模板抽出「要干的事」（去掉姓名占位） */
export function extractCallAction(tpl: string) {
  return String(tpl || '')
    .replaceAll('{name}同学', '')
    .replaceAll('{姓名}同学', '')
    .replaceAll('{name}', '')
    .replaceAll('{姓名}', '')
    .replace(/^[,，、。.\s]+/, '')
    .replace(/[,，、\s]+$/, '')
    .trim();
}

/** 多人：先报所有姓名，再报事项；单人：整句完整播报 */
export function buildCallSpeakParts(names: string[], tpl: string) {
  const list = (names || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (!list.length) return [];
  const action = extractCallAction(tpl);
  if (list.length === 1) {
    const full = String(tpl || '')
      .replaceAll('{name}', list[0])
      .replaceAll('{姓名}', list[0])
      .trim();
    return full ? [full] : [`${list[0]}同学`];
  }
  const namePhrase = `${list.join('、')}同学`;
  return action ? [namePhrase, action] : [namePhrase];
}
