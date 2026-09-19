export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 1;
  u.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const zh = voices.find((v) => v.lang.startsWith('zh'));
  if (zh) u.voice = zh;
  window.speechSynthesis.speak(u);
}

export function fillCallTemplate(template: string, name: string): string {
  return template.replaceAll('{姓名}', name).replaceAll('{name}', name);
}
