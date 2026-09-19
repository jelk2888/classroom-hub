import type { Student } from '../types';

const NAMES = [
  '陈思远', '林晓萱', '王浩然', '张雨桐', '刘子墨', '赵一诺', '黄子轩', '周诗涵',
  '吴俊杰', '徐梦瑶', '孙浩宇', '马欣怡', '朱明轩', '胡语嫣', '郭宇航', '何雨欣',
  '高子涵', '罗俊熙', '梁思琪', '宋嘉豪', '郑欣然', '谢宇辰', '韩雨薇', '唐子豪',
  '冯思涵', '于梓萱', '董浩然', '萧雨桐', '程一凡', '曹欣悦', '袁俊杰', '邓诗雨',
  '许明辉', '傅佳怡', '沈子轩', '曾雨涵', '彭浩宇', '吕思琪', '苏俊豪', '卢欣然',
  '蒋宇轩', '蔡梦琪', '贾子墨', '丁诗涵', '魏浩然', '薛雨萱', '叶明轩', '阎欣怡',
];

export function createDefaultStudents(): Student[] {
  return NAMES.map((name, i) => ({
    id: `s${i + 1}`,
    no: String(i + 1).padStart(2, '0'),
    name,
    gender: i % 2 === 0 ? '男' : '女',
  }));
}

export function genRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function timeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
