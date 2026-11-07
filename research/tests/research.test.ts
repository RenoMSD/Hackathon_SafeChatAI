import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { binaryMetrics } from '../lib/binary';
import { convertScamtext, convertSms, convertTele, fillMoneyTokens } from '../lib/external';
import { benchRequest, hybridLevel, hybridVetoLevel, readAiOutcome } from '../lib/bench';
import { parseCsv } from '../lib/csv';
import { rowsToCases } from '../lib/dataset';
import { cohenKappa, computeMetrics, meanPairwiseKappa, type Prediction } from '../lib/metrics';
import { hashCases, stratifiedSplit } from '../lib/split';
import { DailyCapReached, OpenRouterClient } from '../providers/openrouter';
import type { ChatMessage } from '@safechat/core/types';

const template = readFileSync(join(__dirname, '../dataset/TEMPLATE.csv'), 'utf8');

describe('CSV + bộ đề', () => {
  it('đọc ô nhiều dòng, dấu ngoặc kép kép, BOM; số dòng đúng', () => {
    const { header, rows } = parseCsv('﻿a,b\n1,"x\ny ""z"""\n2,w\n');
    expect(header).toEqual(['a', 'b']);
    expect(rows[0]!.values.b).toBe('x\ny "z"');
    expect(rows[1]!.line).toBe(4);
  });
  it('TEMPLATE.csv hợp lệ: 5 ca, tách DP/TOI đúng', () => {
    const { header, rows } = parseCsv(template);
    const { cases, issues } = rowsToCases(header, rows);
    expect(issues).toEqual([]);
    expect(cases).toHaveLength(5);
    const r04 = cases.find((c) => c.id === 'R04_001')!;
    expect(r04.messages.map((m) => m.sender)).toEqual(['other', 'self', 'other', 'other']);
    expect(r04.gold).toBe('critical');
    expect(r04.levelA).toBe('high');
  });
  it('báo lỗi đúng dòng: thiếu tiền tố, mức sai, id trùng, scam mà Thấp', () => {
    const csv = `id,nhom,loai,hoi_thoai,muc_A,muc_B,muc_chot,nguon
X1,3,scam,"DP: a
chào",cao,cao,cao,tu_viet
X1,3,scam,"DP: a
TOI: b",cao,rat_cao,thap,tu_viet`;
    const { header, rows } = parseCsv(csv);
    const { cases, issues } = rowsToCases(header, rows);
    expect(cases).toHaveLength(0);
    const msgs = issues.map((i) => `${i.line}:${i.message}`);
    expect(msgs.some((m) => m.startsWith('2:') && m.includes('không bắt đầu bằng'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('4:') && m.includes('bị trùng'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('4:') && m.includes('muc_B'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('4:') && m.includes('muc_chot là thap'))).toBe(true);
  });
  it('TEMPLATE_v2.csv: hội thoại dài, đọc mốc moc_muc', () => {
    const { header, rows } = parseCsv(readFileSync(join(__dirname, '../dataset/TEMPLATE_v2.csv'), 'utf8'));
    const { cases, issues } = rowsToCases(header, rows);
    expect(issues).toEqual([]);
    const job = cases.find((c) => c.id === 'V2_JOB_001')!;
    expect(job.messages.length).toBeGreaterThanOrEqual(14);
    expect(job.checkpoints).toEqual([
      { dpTurn: 2, level: 'low' },
      { dpTurn: 3, level: 'attention' },
      { dpTurn: 5, level: 'high' },
      { dpTurn: 6, level: 'critical' },
      { dpTurn: 8, level: 'critical' },
    ]);
  });
  it('moc_muc: báo sai dạng, vượt số tin, không tăng dần, mốc cuối khác muc_chot', () => {
    const mk = (moc: string) =>
      `id,nhom,loai,hoi_thoai,muc_A,muc_B,muc_chot,moc_muc,nguon\nX,3,scam,"DP: a\nDP: b",cao,cao,cao,${moc},tu_viet`;
    const issuesOf = (moc: string) => {
      const { header, rows } = parseCsv(mk(moc));
      return rowsToCases(header, rows).issues.map((i) => i.message).join(' | ');
    };
    expect(issuesOf('1:rat_cao')).toContain('sai dạng');
    expect(issuesOf('3:cao')).toContain('vượt số tin');
    expect(issuesOf('2:chu_y;1:cao')).toContain('tăng dần');
    expect(issuesOf('2:chu_y')).toContain('muc_chot');
    expect(issuesOf('1:chu_y;2:cao')).toBe('');
  });
  it('báo thiếu cột', () => {
    const { header, rows } = parseCsv('id,nhom\n1,2\n');
    expect(rowsToCases(header, rows).issues[0]!.message).toContain('thiếu cột');
  });
});

describe('xlsx + ghi CSV', () => {
  // Dựng file .xlsx tối thiểu (zip không nén) ngay trong bộ nhớ
  const zip = (files: Record<string, string>) => {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const [name, text] of Object.entries(files)) {
      const data = Buffer.from(text, 'utf8');
      const n = Buffer.from(name, 'utf8');
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt32LE(data.length, 18);
      lh.writeUInt32LE(data.length, 22);
      lh.writeUInt16LE(n.length, 26);
      locals.push(lh, n, data);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt32LE(data.length, 20);
      ch.writeUInt32LE(data.length, 24);
      ch.writeUInt16LE(n.length, 28);
      ch.writeUInt32LE(offset, 42);
      centrals.push(ch, n);
      offset += 30 + n.length + data.length;
    }
    const cd = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(Object.keys(files).length, 8);
    eocd.writeUInt16LE(Object.keys(files).length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, eocd]);
  };
  const book = zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Khac" sheetId="1" r:id="rId1"/><sheet name="Bo_De" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>id</t></si><si><t>hoi_thoai</t></si><si><r><t>DP: chào</t></r><r><t xml:space="preserve">&#10;TOI: dạ &amp; vâng</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>sai</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="3"><c r="A3"><v>7</v></c><c r="B3" t="s"><v>2</v></c></row></sheetData></worksheet>',
  });
  it('đọc đúng sheet theo tên, chuỗi dùng chung nhiều đoạn, số, xuống dòng, entity; giữ số dòng Excel', async () => {
    const { readXlsxSheet, listSheets } = await import('../lib/xlsx');
    expect(listSheets(book)).toEqual(['Khac', 'Bo_De']);
    const r = readXlsxSheet(book, 'Bo_De');
    expect(r.header).toEqual(['id', 'hoi_thoai']);
    expect(r.rows[0]!.values).toEqual({ id: '7', hoi_thoai: 'DP: chào\nTOI: dạ & vâng' });
    expect(r.rows[0]!.line).toBe(3);
    expect(() => readXlsxSheet(book, 'KhongCo')).toThrow('Các sheet');
  });
  it('toCsv ghi lại đọc ra y nguyên (ngoặc kép, dấu phẩy, xuống dòng)', async () => {
    const { toCsv } = await import('../lib/csv');
    const rowsIn = [{ a: 'x, "y"', b: 'dòng 1\ndòng 2' }];
    const back = parseCsv(toCsv(['a', 'b'], rowsIn));
    expect(back.rows[0]!.values).toEqual(rowsIn[0]);
  });
});

describe('chia dev/test', () => {
  const { header, rows } = parseCsv(template);
  const many = Array.from({ length: 10 }, (_, k) =>
    rowsToCases(header, rows).cases.map((c) => ({ ...c, id: `${c.id}_${k}` })),
  ).flat();
  it('tái lập được, không chồng lấn, ~30% dev mỗi tầng', () => {
    const a = stratifiedSplit(many);
    expect(stratifiedSplit(many)).toEqual(a);
    expect(a.dev.filter((id) => a.test.includes(id))).toEqual([]);
    expect(a.dev.length + a.test.length).toBe(50);
    expect(a.dev.length).toBe(15);
  });
  it('mã khóa đổi khi nội dung ca test đổi', () => {
    const h = hashCases(many);
    const changed = many.map((c, i) => (i === 0 ? { ...c, gold: 'low' as const } : c));
    expect(hashCases(changed)).not.toBe(h);
    expect(hashCases([...many].reverse())).toBe(h);
  });
});

describe('chỉ số', () => {
  const P = (gold: Prediction['gold'], pred: Prediction['pred'], kind: Prediction['kind'] = 'scam'): Prediction => ({
    caseId: Math.random().toString(),
    gold,
    pred,
    kind,
    group: 1,
  });
  it('tính đúng trên ví dụ tính tay', () => {
    const m = computeMetrics([
      P('critical', 'critical'),
      P('critical', 'attention'), // bỏ sót nguy hiểm, chấm thấp
      P('high', null), // lỗi → bỏ sót, chấm thấp
      P('low', 'attention', 'benign_confusable'), // báo nhầm
      P('low', 'low', 'benign'),
    ]);
    expect(m.accuracy).toBeCloseTo(2 / 5);
    expect(m.dangerRecall).toBeCloseTo(1 / 3);
    expect(m.dangerMissRate).toBeCloseTo(2 / 3);
    expect(m.criticalRecall).toBeCloseTo(1 / 2);
    expect(m.underRate).toBeCloseTo(2 / 5);
    expect(m.overRate).toBeCloseTo(1 / 5);
    expect(m.benignFalseAlarm).toBeCloseTo(1 / 2);
    expect(m.confusableFalseAlarm).toBe(1);
    expect(m.noAnswerRate).toBeCloseTo(1 / 5);
    expect(m.ordinalMAE).toBeCloseTo((0 + 2 + 2 + 1 + 0) / 5);
    expect(m.confusion[2]![4]).toBe(1);
  });
  it('kappa: trùng hoàn toàn = 1, ví dụ chuẩn', () => {
    expect(cohenKappa(['a', 'b', 'a'], ['a', 'b', 'a'])).toBe(1);
    // po = 0.5, pe = 0.5 → κ = 0
    expect(cohenKappa(['a', 'a', 'b', 'b'], ['a', 'b', 'a', 'b'])).toBeCloseTo(0);
    expect(meanPairwiseKappa([['x', 'y'], ['x', 'y'], ['x', 'y']])).toBe(1);
  });
});

describe('client OpenRouter (fetch giả)', () => {
  const ok = (content: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
  const make = (responses: (() => Response)[], cap = 100) => {
    const calls: unknown[] = [];
    let i = 0;
    const client = new OpenRouterClient({
      apiKey: 'k',
      cacheDir: mkdtempSync(join(tmpdir(), 'or-')),
      dailyCap: cap,
      minIntervalMs: 0,
      sleep: async () => {},
      fetchImpl: (async (_u: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return responses[Math.min(i++, responses.length - 1)]!();
      }) as typeof fetch,
    });
    return { client, calls };
  };
  const req = { model: 'm:free', system: 's', user: 'u' };

  it('thử lại khi 429, cache trúng thì không gọi mạng', async () => {
    const { client, calls } = make([() => new Response('rate', { status: 429 }), () => ok('{"a":1}')]);
    const r1 = await client.chat(req);
    expect(r1.content).toBe('{"a":1}');
    expect(r1.cached).toBe(false);
    expect(r1.promptTokens).toBe(10);
    const r2 = await client.chat(req);
    expect(r2.cached).toBe(true);
    expect(calls).toHaveLength(2);
    expect(client.usedToday()).toBe(2);
  });
  it('lần lặp khác (variant) không lấy cache của lần trước', async () => {
    const { client, calls } = make([() => ok('{}')]);
    await client.chat(req);
    await client.chat({ ...req, variant: 1 });
    expect(calls).toHaveLength(2);
  });
  it('model không hỗ trợ JSON mode → gọi lại không có response_format', async () => {
    const { client, calls } = make([() => new Response('response_format not supported', { status: 400 }), () => ok('{}')]);
    await client.chat(req);
    expect((calls[0] as { response_format?: unknown }).response_format).toBeDefined();
    expect((calls[1] as { response_format?: unknown }).response_format).toBeUndefined();
  });
  it('dừng khi chạm trần lượt/ngày', async () => {
    const { client } = make([() => ok('{}')], 1);
    await client.chat(req);
    await expect(client.chat({ ...req, user: 'khác' })).rejects.toBeInstanceOf(DailyCapReached);
  });
});

describe('cấu hình so sánh', () => {
  const m: ChatMessage[] = [{ id: 'msg-001', seq: 1, sender: 'other', text: 'Ck vô stk 9988776655 giúp mình nhé' }];
  it('prompt AI-only không chứa tín hiệu luật, prompt hint thì có', () => {
    expect(benchRequest(m, false).user).toContain('<rule_signals>[]</rule_signals>');
    expect(benchRequest(m, true).user).toContain('money_transfer');
    expect(benchRequest(m, false).system).toContain('risk_level');
  });
  it('đọc risk_level; JSON hỏng → không trả lời', () => {
    const req = benchRequest(m, false);
    expect(readAiOutcome('{"signals":[],"summary":"","risk_level":"low"}', req, m, 't').level).toBe('low');
    const bad = readAiOutcome('không phải json', req, m, 't');
    expect(bad.jsonValid).toBe(false);
    expect(bad.level).toBeNull();
  });
  it('hybrid: AI chỉ bổ sung, không hạ; hybrid-veto: AI tự chấm thấp hơn → hạ đúng 1 bậc', () => {
    const req = benchRequest(m, false);
    const ai = readAiOutcome('{"signals":[],"summary":"","risk_level":"low"}', req, m, 't');
    expect(hybridLevel(m, ai)).toBe('attention');
    expect(hybridVetoLevel(m, ai)).toBe('low'); // luật: Cần chú ý → hạ 1 bậc
  });
});

describe('bộ dữ liệu ngoài (nhãn 2 lớp)', () => {
  it('chuyển SMS, cuộc gọi, câu lẻ sang ca; câu trùng chỉ giữ 1', () => {
    const sms = convertSms(['message_id,date,message,label', '7,2026,"Ma OTP la [NUMBER]",0', '8,2026,"Vay nhanh [MONEY] bam link",1', ''].join('\n'));
    expect(sms.map((c) => [c.id, c.kind, c.messages[0]!.sender])).toEqual([
      ['SMS_7', 'benign', 'other'],
      ['SMS_8', 'scam', 'other'],
    ]);
    const tele = convertTele(
      [{ _id: 3, label_name: 'Lừa đảo vay vốn', dialogue: [{ role: 'người gọi', content: 'Chào chị' }, { role: 'người nghe', content: 'Ai đấy' }] }],
      [{ _id: 1, dialogue: [{ role: 'người gọi', content: 'A lô' }] }],
    );
    expect(tele[0]).toMatchObject({ id: 'TELE_S_00003', kind: 'scam', tags: ['Lừa đảo vay vốn'] });
    expect(tele[0]!.messages.map((m) => m.sender)).toEqual(['other', 'self']);
    expect(tele[1]).toMatchObject({ id: 'TELE_H_00001', kind: 'benign' });
    const stx = convertScamtext(['__label__scam a b', '__label__normal c', '__label__normal a b', 'rác', ''].join('\n'));
    expect(stx.map((c) => c.kind)).toEqual(['scam', 'benign']);
  });

  it('thay token [MONEY] bằng giá trị mẫu theo ngữ cảnh', () => {
    expect(fillMoneyTokens('Hạn mức thẻ lên đến [MONEY]')).toBe('Hạn mức thẻ lên đến 10.000.000đ');
    expect(fillMoneyTokens('lương 350-[MONEY]/ngày')).toBe('lương 350-500.000đ/ngày');
    expect(fillMoneyTokens('thiếu cước [MONEY], gọi ([MONEY]/phút)')).toBe('thiếu cước 50.000đ, gọi (50.000đ/phút)');
    expect(fillMoneyTokens('xem phim chất lượng [MONEY], nhiều lưu lượng. Giá SIM [MONEY]')).toBe('xem phim chất lượng 50.000đ, nhiều lưu lượng. Giá SIM 50.000đ');
  });

  it('chỉ số 2 lớp theo ngưỡng', () => {
    const rows = [
      { kind: 'scam', pred: 'high' as const },
      { kind: 'scam', pred: 'attention' as const },
      { kind: 'scam', pred: 'low' as const },
      { kind: 'benign', pred: 'attention' as const },
      { kind: 'benign', pred: 'low' as const },
    ];
    const a = binaryMetrics(rows, 'attention');
    expect([a.tp, a.fn, a.fp, a.tn]).toEqual([2, 1, 1, 1]);
    expect(a.recall).toBeCloseTo(2 / 3);
    expect(a.fpr).toBe(0.5);
    const h = binaryMetrics(rows, 'high');
    expect([h.tp, h.fp]).toEqual([1, 0]);
  });
});

describe('ép dev/test cố định (split_co_dinh / dung_cho)', () => {
  it('ca có split cố định không tham gia chia ngẫu nhiên; giá trị lạ bị báo lỗi', () => {
    const csv = [
      'id,nhom,loai,hoi_thoai,muc_A,muc_B,muc_chot,nguon,split_co_dinh,dung_cho',
      'A1,3,scam,"DP: nạp tiền đi\nTOI: ok",cao,cao,cao,tu_viet,dev,',
      'A2,3,scam,"DP: nạp tiền đi\nTOI: ok",cao,cao,cao,tu_viet,,test',
      'A3,0,benign,"DP: chào bạn\nTOI: chào",thap,thap,thap,tu_viet,,',
      'A4,0,benign,"DP: chào bạn\nTOI: chào",thap,thap,thap,tu_viet,sai,',
    ].join('\n');
    const { header, rows } = parseCsv(csv);
    const { cases, issues } = rowsToCases(header, rows);
    expect(issues.map((i) => i.id)).toEqual(['A4']);
    expect(cases.map((c) => c.fixedSplit)).toEqual(['dev', 'test', undefined]);
    const sp = stratifiedSplit(cases);
    expect(sp.dev).toContain('A1');
    expect(sp.test).toContain('A2');
    expect([...sp.dev, ...sp.test].sort()).toEqual(['A1', 'A2', 'A3']);
  });
});
