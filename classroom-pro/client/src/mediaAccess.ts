/**
 * 安全获取 getUserMedia（兼容旧前缀；非 HTTPS 时 mediaDevices 常为 undefined）
 */
export function getUserMediaSafe(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav) return Promise.reject(new Error('当前环境不支持麦克风'));

  const md = nav.mediaDevices;
  if (md && typeof md.getUserMedia === 'function') {
    return md.getUserMedia(constraints);
  }

  const legacy =
    (nav as any).getUserMedia ||
    (nav as any).webkitGetUserMedia ||
    (nav as any).mozGetUserMedia ||
    (nav as any).msGetUserMedia;

  if (typeof legacy === 'function') {
    return new Promise((resolve, reject) => {
      legacy.call(nav, constraints, resolve, reject);
    });
  }

  const host = typeof location !== 'undefined' ? location.hostname : '';
  const insecure =
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    host !== 'localhost' &&
    host !== '127.0.0.1';

  if (insecure) {
    return Promise.reject(
      new Error(
        '手机浏览器在 HTTP（非 HTTPS）下禁止麦克风。请用电脑喊话，或为系统配置 HTTPS / 内网穿透后再用手机开麦。文字喊话仍可用。',
      ),
    );
  }

  return Promise.reject(new Error('浏览器不支持麦克风，请换 Chrome/Edge 或改用文字喊话'));
}

export function micAvailableHint(): string | null {
  if (typeof navigator === 'undefined') return '当前环境无法使用麦克风';
  if (typeof navigator.mediaDevices?.getUserMedia === 'function') return null;
  const host = typeof location !== 'undefined' ? location.hostname : '';
  if (
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    host !== 'localhost' &&
    host !== '127.0.0.1'
  ) {
    return '当前为 HTTP 访问，手机无法开麦，请用文字喊话或电脑端；配置 HTTPS 后可用麦克风。';
  }
  return null;
}
