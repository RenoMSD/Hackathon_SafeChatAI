// Đường dẫn, nạp bộ đề và biến môi trường cho các lệnh nghiên cứu.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios } from '../../fixtures/scenarios';
import { parseCsv } from './csv';
import { rowsToCases, type BenchCase } from './dataset';
import { readXlsxSheet } from './xlsx';

export const RESEARCH_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(RESEARCH_DIR, 'data');
export const CACHE_DIR = join(RESEARCH_DIR, 'cache');
export const RESULTS_DIR = join(RESEARCH_DIR, 'results');
export const REPORTS_DIR = join(RESEARCH_DIR, 'reports');

/** Đọc research/.env (không commit) nếu có. */
export function loadEnv() {
  const f = join(RESEARCH_DIR, '.env');
  if (existsSync(f)) process.loadEnvFile(f);
}

export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}

/** 40 tình huống phát triển trong fixtures/ (do người viết luật soạn — chỉ dùng để thử đường ống). */
export function fixtureCases(): BenchCase[] {
  return scenarios.map((s) => ({
    id: s.id,
    group: -1,
    kind: s.expected.level === 'low' ? 'benign' : 'scam',
    messages: s.messages,
    gold: s.expected.level,
    tags: [],
    source: 'fixtures',
  }));
}

export function loadDataset(name: string, split: string): BenchCase[] {
  if (name === 'fixtures') return fixtureCases();
  // Bộ dữ liệu ngoài (bench:external, nhãn 2 lớp) hoặc bộ đề đặt tên (bench:import --name)
  if (name.startsWith('ext:') || name.startsWith('set:')) {
    const dir = join(DATA_DIR, name.startsWith('ext:') ? 'external' : 'sets', name.slice(4));
    const all = JSON.parse(readFileSync(join(dir, 'cases.json'), 'utf8')) as BenchCase[];
    if (split === 'all') return all;
    const sp = JSON.parse(readFileSync(join(dir, 'split.json'), 'utf8')) as { dev: string[]; test: string[] };
    const ids = new Set(split === 'test' ? sp.test : sp.dev);
    return all.filter((c) => ids.has(c.id));
  }
  // Kiểm tra nhanh một file đề (vd. đợt ca mới viết) mà không nhập/khóa bộ test — bỏ qua --split
  if (/\.(csv|xlsx)$/i.test(name)) {
    const raw = readFileSync(name);
    const { header, rows } = /\.xlsx$/i.test(name)
      ? readXlsxSheet(raw, arg('sheet', 'Bo_De_Chuan_TEMPLATE'))
      : parseCsv(raw.toString('utf8'));
    const { cases, issues } = rowsToCases(header, rows);
    if (issues.length) throw new Error(`File đề có ${issues.length} lỗi — chạy bench:import để xem chi tiết`);
    return cases;
  }
  const all = JSON.parse(readFileSync(join(DATA_DIR, 'cases.json'), 'utf8')) as BenchCase[];
  if (split === 'all') return all;
  const sp = JSON.parse(readFileSync(join(DATA_DIR, 'split.json'), 'utf8')) as { dev: string[]; test: string[] };
  const ids = new Set(split === 'test' ? sp.test : sp.dev);
  return all.filter((c) => ids.has(c.id));
}
