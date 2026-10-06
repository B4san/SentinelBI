import fs from 'node:fs';
import path from 'node:path';
import { detectStorageKind, type StorageKind } from '../../server/runtime';
import type { DashboardDataset, DashboardSpec } from './types';

export interface StoredDashboard {
  spec: DashboardSpec;
  datasets: DashboardDataset[];
}

export const dashboardStore = new Map<string, StoredDashboard>();

const DIR = path.join(process.cwd(), 'data', 'dashboards');
const BLOB_PREFIX = 'sentinelbi/dashboards';

export function currentStorageKind(): StorageKind {
  return detectStorageKind(process.env);
}

function persistDir(): string {
  try {
    fs.mkdirSync(DIR, { recursive: true });
  } catch {
    // in-memory only when the filesystem is read-only
  }
  return DIR;
}

function kvConfig() {
  const base = String(process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
  const token = process.env.KV_REST_API_TOKEN || process.env.KV_REST_API_READ_WRITE_TOKEN || '';
  return base && token ? { base, token } : null;
}

async function putKv(id: string, stored: StoredDashboard): Promise<void> {
  const kv = kvConfig();
  if (!kv) return;
  const key = `dashboard:${id}`;
  const res = await fetch(`${kv.base}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kv.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(stored),
  });
  if (!res.ok) {
    throw new Error(`KV set failed (${res.status})`);
  }
}

async function getKv(id: string): Promise<StoredDashboard | undefined> {
  const kv = kvConfig();
  if (!kv) return undefined;
  const key = `dashboard:${id}`;
  const res = await fetch(`${kv.base}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${kv.token}` },
  });
  if (!res.ok) return undefined;
  const payload = await res.json().catch(() => null) as { result?: string | StoredDashboard | null } | null;
  const raw = payload?.result;
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as StoredDashboard;
    } catch {
      return undefined;
    }
  }
  return raw;
}

async function putBlob(id: string, stored: StoredDashboard): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  const { put } = await import('@vercel/blob');
  await put(`${BLOB_PREFIX}/${id}.json`, JSON.stringify(stored), {
    access: 'public',
    addRandomSuffix: false,
    token,
    contentType: 'application/json',
  });
}

async function getBlob(id: string): Promise<StoredDashboard | undefined> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return undefined;
  const { list } = await import('@vercel/blob');
  const listed = await list({ prefix: `${BLOB_PREFIX}/${id}.json`, token, limit: 1 });
  const blob = listed.blobs.find((item) => item.pathname.endsWith(`${id}.json`)) || listed.blobs[0];
  if (!blob?.url) return undefined;
  const res = await fetch(blob.url);
  if (!res.ok) return undefined;
  return res.json() as Promise<StoredDashboard>;
}

function putFs(id: string, stored: StoredDashboard): void {
  const file = path.join(persistDir(), `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(stored, null, 2));
}

function getFs(id: string): StoredDashboard | undefined {
  try {
    const file = path.join(DIR, `${id}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as StoredDashboard;
  } catch {
    return undefined;
  }
}

export async function rememberDashboard(id: string, spec: DashboardSpec, datasets: DashboardDataset[]): Promise<void> {
  const stored = { spec, datasets };
  dashboardStore.set(id, stored);
  const kind = currentStorageKind();
  try {
    if (kind === 'blob') await putBlob(id, stored);
    else if (kind === 'kv') await putKv(id, stored);
    else if (kind === 'fs') putFs(id, stored);
  } catch {
    // Memory remains the source of truth for this invocation.
  }
}

export async function loadDashboard(id: string): Promise<StoredDashboard | undefined> {
  const memory = dashboardStore.get(id);
  if (memory) return memory;
  const kind = currentStorageKind();
  try {
    const loaded =
      kind === 'blob' ? await getBlob(id)
      : kind === 'kv' ? await getKv(id)
      : getFs(id);
    if (loaded) dashboardStore.set(id, loaded);
    return loaded;
  } catch {
    return undefined;
  }
}

export function listStoredDashboardIds(): string[] {
  return [...dashboardStore.keys()];
}
