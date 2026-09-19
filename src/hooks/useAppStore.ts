import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppState, DisciplineKind, Homework, LiveSignal, Student, ViewId } from '../types';
import { todayStr, timeStr, uid } from '../data/defaults';
import { loadState, publishLive, readLive, saveState } from '../lib/storage';
import { fillCallTemplate, speak } from '../lib/speech';

export function useAppStore() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [live, setLive] = useState<LiveSignal>(() => readLive());
  const [multiCall, setMultiCall] = useState(false);
  const [callQueue, setCallQueue] = useState<string[]>([]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'classroom-hub-live-v1' && e.newValue) {
        setLive(JSON.parse(e.newValue) as LiveSignal);
      }
      if (e.key === 'classroom-hub-state-v1' && e.newValue) {
        setState(JSON.parse(e.newValue) as AppState);
      }
    };
    const onLive = (e: Event) => {
      setLive((e as CustomEvent<LiveSignal>).detail);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('classroom-live', onLive);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('classroom-live', onLive);
    };
  }, []);

  const patch = useCallback((partial: Partial<AppState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  const setView = (view: ViewId) => patch({ view });
  const setMode = (mode: AppState['mode']) => patch({ mode });

  const emitLive = useCallback((signal: Omit<LiveSignal, 'updatedAt'>) => {
    const full = { ...signal, updatedAt: Date.now() };
    publishLive(full);
    setLive(full);
  }, []);

  const callStudents = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const names = ids
        .map((id) => state.students.find((s) => s.id === id)?.name)
        .filter(Boolean) as string[];
      if (!names.length) return;

      let i = 0;
      const run = () => {
        if (i >= names.length) return;
        const name = names[i];
        const text = fillCallTemplate(state.callTemplate, name);
        emitLive({ type: 'call', title: name, subtitle: text, accent: '#0b6e63' });
        speak(text);
        i += 1;
        if (i < names.length) {
          setTimeout(run, 3200);
        }
      };
      run();
      setCallQueue([]);
      setMultiCall(false);
    },
    [emitLive, state.callTemplate, state.students],
  );

  const toggleCallSelect = (id: string) => {
    if (!multiCall) {
      callStudents([id]);
      return;
    }
    setCallQueue((q) => (q.includes(id) ? q.filter((x) => x !== id) : [...q, id]));
  };

  const addDiscipline = (studentId: string, kind: DisciplineKind, reason: string) => {
    const stu = state.students.find((s) => s.id === studentId);
    if (!stu || !reason.trim()) return;
    const rec = {
      id: uid('d'),
      studentId,
      studentName: stu.name,
      kind,
      reason: reason.trim(),
      date: todayStr(),
      time: timeStr(),
    };
    patch({ disciplines: [rec, ...state.disciplines] });
  };

  const removeDiscipline = (id: string) => {
    patch({ disciplines: state.disciplines.filter((d) => d.id !== id) });
  };

  const createHomework = (title: string) => {
    if (!title.trim()) return;
    const hw: Homework = {
      id: uid('hw'),
      title: title.trim(),
      createdAt: new Date().toISOString(),
      doneIds: [],
    };
    patch({ homeworks: [hw, ...state.homeworks], activeHomeworkId: hw.id });
  };

  const toggleHomeworkDone = (studentId: string) => {
    const id = state.activeHomeworkId;
    if (!id) return;
    patch({
      homeworks: state.homeworks.map((hw) => {
        if (hw.id !== id) return hw;
        const done = hw.doneIds.includes(studentId)
          ? hw.doneIds.filter((x) => x !== studentId)
          : [...hw.doneIds, studentId];
        return { ...hw, doneIds: done };
      }),
    });
  };

  const deleteHomework = (id: string) => {
    const next = state.homeworks.filter((h) => h.id !== id);
    patch({
      homeworks: next,
      activeHomeworkId: state.activeHomeworkId === id ? next[0]?.id ?? null : state.activeHomeworkId,
    });
  };

  const markPicked = (id: string) => {
    if (state.pickedIds.includes(id)) return;
    patch({ pickedIds: [...state.pickedIds, id] });
  };

  const clearPicked = () => patch({ pickedIds: [] });

  const upsertStudent = (student: Student) => {
    const exists = state.students.some((s) => s.id === student.id);
    patch({
      students: exists
        ? state.students.map((s) => (s.id === student.id ? student : s))
        : [...state.students, student],
    });
  };

  const removeStudent = (id: string) => {
    patch({ students: state.students.filter((s) => s.id !== id) });
  };

  const replaceStudents = (students: Student[]) => patch({ students });

  const todayStats = useMemo(() => {
    const today = todayStr();
    const list = state.disciplines.filter((d) => d.date === today);
    return {
      praise: list.filter((d) => d.kind === 'praise').length,
      violation: list.filter((d) => d.kind === 'violation').length,
    };
  }, [state.disciplines]);

  const activeHomework = state.homeworks.find((h) => h.id === state.activeHomeworkId) ?? null;

  return {
    state,
    patch,
    live,
    emitLive,
    setView,
    setMode,
    multiCall,
    setMultiCall,
    callQueue,
    setCallQueue,
    callStudents,
    toggleCallSelect,
    addDiscipline,
    removeDiscipline,
    createHomework,
    toggleHomeworkDone,
    deleteHomework,
    markPicked,
    clearPicked,
    upsertStudent,
    removeStudent,
    replaceStudents,
    todayStats,
    activeHomework,
  };
}

export type Store = ReturnType<typeof useAppStore>;
