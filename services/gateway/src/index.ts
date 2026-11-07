// @safechat/gateway — AI Gateway trên AWS Lambda (native Node http, không phụ thuộc package ngoài)
// Phụ trách: Danh, nhánh danh/gateway-aws
// Hợp đồng API: @safechat/contracts (đã định nghĩa ở packages/contracts/src/index.ts)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORT = Number(process.env.PORT) || 3000;

type Method = 'GET' | 'POST' | 'OPTIONS';
type ClientKind = 'extension' | 'android' | 'web';
type RiskLevel = 'low' | 'attention' | 'high' | 'critical';

interface HealthResponse { status: 'ok'; version: string; }
interface CreateDeviceResponse { token: string; expiresAt: string; }
interface ApiError { error: { code: string; message: string; retryAfterSec?: number }; }
interface MetricsSummary {
  date: string; calls: number; costUsd: number; latencyP50Ms: number;
  latencyP95Ms: number; rejectedQuotes: number;
  byModel: Record<string, { calls: number; costUsd: number }>;
}

const ERROR_BAD_REQUEST = 400;
const ERROR_UNAUTHORIZED = 401;
const ERROR_QUOTA_EXCEEDED = 429;
const ERROR_BUDGET_EXCEEDED = 503;
const ERROR_MODEL_UNAVAILABLE = 503;
const ERROR_TIMEOUT = 504;
const ERROR_INTERNAL = 500;

const ALLOWED_ORIGINS = new Set([
  process.env.WEB_ORIGIN ?? '',
  process.env.ANDROID_ORIGIN ?? '',
  process.env.EXTENSION_ORIGIN ?? '',
].filter(Boolean));

function corsHeaders(origin: string | undefined): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Vary'] = 'Origin';
  } else {
    h['Access-Control-Allow-Origin'] = '*';
  }
  return h;
}

function json(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload).toString(),
    ...corsHeaders(origin),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw.length === 0 ? {} : JSON.parse(raw));
      } catch {
        reject(new Error('Yêu cầu không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

function isClientKind(v: unknown): v is ClientKind {
  return v === 'extension' || v === 'android' || v === 'web';
}

function isRiskLevel(v: unknown): v is RiskLevel {
  return v === 'low' || v === 'attention' || v === 'high' || v === 'critical';
}

function isArrayOfString(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function validateCreateDevice(body: unknown): { ok: true; data: { client: ClientKind; clientVersion: string } } | { ok: false; message: string } {
  if (!body || typeof body !== 'object') return { ok: false, message: 'Yêu cầu không hợp lệ' };
  const b = body as Record<string, unknown>;
  if (!isClientKind(b.client)) return { ok: false, message: 'Trường client không hợp lệ' };
  if (typeof b.clientVersion !== 'string' || b.clientVersion.length === 0) return { ok: false, message: 'Trường clientVersion không hợp lệ' };
  return { ok: true, data: { client: b.client, clientVersion: b.clientVersion } };
}

function validateFeedback(body: unknown): { ok: true } | { ok: false; message: string } {
  if (!body || typeof body !== 'object') return { ok: false, message: 'Yêu cầu không hợp lệ' };
  const b = body as Record<string, unknown>;
  if (!isClientKind(b.client)) return { ok: false, message: 'Trường client không hợp lệ' };
  if (!isRiskLevel(b.level)) return { ok: false, message: 'Trường level không hợp lệ' };
  if (!isArrayOfString(b.signalTypes)) return { ok: false, message: 'Trường signalTypes không hợp lệ' };
  if (b.verdict !== 'correct' && b.verdict !== 'false_alarm' && b.verdict !== 'missed') return { ok: false, message: 'Trường verdict không hợp lệ' };
  return { ok: true };
}

type Handler = (req: IncomingMessage, res: ServerResponse, body: unknown, origin?: string) => Promise<void> | void;

const routes: Record<string, Partial<Record<Method, Handler>>> = {
  '/healthz': {
    GET: (_req, res, _body, origin) => {
      const health: HealthResponse = { status: 'ok', version: '0.5.0' };
      json(res, 200, health, origin);
    },
  },
  '/v1/devices': {
    POST: async (req, res, body, origin) => {
      const v = validateCreateDevice(body);
      if (!v.ok) {
        const err: ApiError = { error: { code: 'BAD_REQUEST', message: v.message } };
        json(res, ERROR_BAD_REQUEST, err, origin);
        return;
      }
      const token = `sc_${crypto.randomUUID().replace(/-/g, '')}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const resp: CreateDeviceResponse = { token, expiresAt };
      json(res, 201, resp, origin);
    },
  },
  '/v1/analyses': {
    POST: async (_req, res, _body, origin) => {
      const err: ApiError = { error: { code: 'MODEL_UNAVAILABLE', message: 'Gateway chưa cấu hình model' } };
      json(res, ERROR_MODEL_UNAVAILABLE, err, origin);
    },
  },
  '/v1/feedback': {
    POST: async (req, res, body, origin) => {
      const v = validateFeedback(body);
      if (!v.ok) {
        const err: ApiError = { error: { code: 'BAD_REQUEST', message: v.message } };
        json(res, ERROR_BAD_REQUEST, err, origin);
        return;
      }
      json(res, 200, { ok: true }, origin);
    },
  },
  '/v1/metrics/summary': {
    GET: (_req, res, _body, origin) => {
      const summary: MetricsSummary = {
        date: new Date().toISOString().slice(0, 10), calls: 0, costUsd: 0,
        latencyP50Ms: 0, latencyP95Ms: 0, rejectedQuotes: 0, byModel: {},
      };
      json(res, 200, summary, origin);
    },
  },
};

async function handler(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  const method = (req.method ?? 'GET') as Method;
  const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  if (method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  const route = routes[path]?.[method];
  if (!route) {
    const err: ApiError = { error: { code: 'BAD_REQUEST', message: 'Không tìm thấy endpoint' } };
      json(res, ERROR_BAD_REQUEST, err, origin);
    return;
  }

  try {
    const body = method === 'POST' ? await readBody(req) : {};
    await route(req, res, body, origin);
  } catch {
    const err: ApiError = { error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } };
    json(res, ERROR_INTERNAL, err, origin);
  }
}

const server = createServer(handler);

export function start() {
  server.listen(PORT, () => {
    console.log(`Gateway listening on :${PORT}`);
  });
}

export function stop() {
  server.close();
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  start();
}
