import os from 'os';

/** 本机局域网 IPv4（排除回环） */
export function listLanIpv4() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const info of ifs[name] || []) {
      if (info.family !== 'IPv4' && info.family !== 4) continue;
      if (info.internal) continue;
      out.push(info.address);
    }
  }
  return out;
}

export function buildNetInfo(port, publicUrl = '') {
  const lan = listLanIpv4().map((ip) => `http://${ip}:${port}`);
  return {
    port: Number(port),
    lan,
    publicUrl: String(publicUrl || '').replace(/\/$/, ''),
    prefer: 'lan',
  };
}
