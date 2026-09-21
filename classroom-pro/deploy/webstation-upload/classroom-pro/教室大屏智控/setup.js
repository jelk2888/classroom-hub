async function boot() {
  const msg = document.getElementById('msg');
  const hostEl = document.getElementById('host');
  const portEl = document.getElementById('port');
  const httpsEl = document.getElementById('https');
  const codeEl = document.getElementById('code');
  const passEl = document.getElementById('password');
  const rememberEl = document.getElementById('remember');
  const autoEl = document.getElementById('autoLogin');
  const goBtn = document.getElementById('go');
  const saveBtn = document.getElementById('saveOnly');

  function readForm() {
    return {
      host: String(hostEl.value || '').trim(),
      port: Number(portEl.value) || 5666,
      https: !!httpsEl.checked,
      code: String(codeEl.value || '').trim(),
      password: String(passEl.value || ''),
      remember: !!rememberEl.checked,
      autoLogin: !!autoEl.checked,
    };
  }

  function fill(cfg) {
    if (!cfg) return;
    hostEl.value = cfg.host || '';
    portEl.value = cfg.port || 5666;
    httpsEl.checked = !!cfg.https;
    codeEl.value = cfg.code || '';
    passEl.value = cfg.password || '';
    rememberEl.checked = cfg.remember !== false;
    autoEl.checked = !!cfg.autoLogin;
  }

  function show(text, ok) {
    msg.className = ok ? 'ok' : 'err';
    msg.textContent = text || '';
  }

  try {
    const cfg = await window.boardSetup.loadConfig();
    fill(cfg);
    if (cfg?.autoLogin && cfg.host && cfg.code && cfg.password) {
      show('正在自动登录…', true);
      goBtn.disabled = true;
      const r = await window.boardSetup.loginAndEnter(readForm());
      if (!r?.ok) {
        show(r?.error || '自动登录失败，请手动登录', false);
        goBtn.disabled = false;
      }
    }
  } catch (e) {
    show(String(e.message || e), false);
  }

  saveBtn.onclick = async () => {
    show('');
    const cfg = readForm();
    if (!cfg.host) return show('请填写服务器 IP / 域名');
    const r = await window.boardSetup.saveConfig(cfg);
    show(r?.ok ? '已保存到本机 board-config.json' : r?.error || '保存失败', !!r?.ok);
  };

  goBtn.onclick = async () => {
    show('');
    const cfg = readForm();
    if (!cfg.host) return show('请填写服务器 IP / 域名');
    if (!cfg.code || !cfg.password) return show('请填写班级码和密码');
    goBtn.disabled = true;
    show('正在连接并登录…', true);
    try {
      const r = await window.boardSetup.loginAndEnter(cfg);
      if (!r?.ok) {
        show(r?.error || '登录失败', false);
        goBtn.disabled = false;
      }
    } catch (e) {
      show(String(e.message || e), false);
      goBtn.disabled = false;
    }
  };
}

boot();
