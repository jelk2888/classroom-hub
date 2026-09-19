import type { AppState, LiveSignal } from '../types';
import { createDefaultStudents, genRoomCode } from '../data/defaults';

const STATE_KEY = 'classroom-hub-state-v1';
const LIVE_KEY = 'classroom-hub-live-v1';

export function defaultState(): AppState {
  return {
    className: '示例班',
    roomCode: genRoomCode(),
    students: createDefaultStudents(),
    disciplines: [],
    homeworks: [],
    activeHomeworkId: null,
    callTemplate: '{姓名}同学，请到办公室来一趟',
    pickedIds: [],
    mode: 'remote',
    view: 'call',
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function publishLive(signal: LiveSignal): void {
  localStorage.setItem(LIVE_KEY, JSON.stringify(signal));
  window.dispatchEvent(new CustomEvent('classroom-live', { detail: signal }));
}

export function readLive(): LiveSignal {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    if (!raw) return { type: 'idle', title: '课堂智控台就绪', subtitle: '等待指令', updatedAt: Date.now() };
    return JSON.parse(raw) as LiveSignal;
  } catch {
    return { type: 'idle', title: '课堂智控台就绪', subtitle: '等待指令', updatedAt: Date.now() };
  }
}

export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
