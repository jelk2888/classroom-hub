export type Gender = '男' | '女' | '';

export interface Student {
  id: string;
  no: string;
  name: string;
  gender: Gender;
}

export type ViewId = 'call' | 'discipline' | 'homework' | 'roll' | 'timer' | 'settings';
export type AppMode = 'board' | 'remote';

export type DisciplineKind = 'praise' | 'violation';

export interface DisciplineRecord {
  id: string;
  studentId: string;
  studentName: string;
  kind: DisciplineKind;
  reason: string;
  date: string; // YYYY-MM-DD
  time: string;
}

export interface Homework {
  id: string;
  title: string;
  createdAt: string;
  doneIds: string[];
}

export interface AppState {
  className: string;
  roomCode: string;
  students: Student[];
  disciplines: DisciplineRecord[];
  homeworks: Homework[];
  activeHomeworkId: string | null;
  callTemplate: string;
  pickedIds: string[];
  mode: AppMode;
  view: ViewId;
}

export interface LiveSignal {
  type: 'idle' | 'call' | 'roll' | 'timer';
  title: string;
  subtitle?: string;
  accent?: string;
  updatedAt: number;
}
