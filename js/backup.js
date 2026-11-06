// Backups: full JSON export/import (including photos) and CSV export.
import * as db from './db.js';
import { S, COLLECTIONS, load, saveSettings } from './store.js';
import { subjectById, subjectLabel, topicById, topicLabel, today } from './logic.js';
import { download } from './ui.js';

const FORMAT = 1;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(url) {
  const [head, b64] = url.split(',');
  const type = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportAll() {
  const photos = await db.getAll('photos');
  const data = {
    profile: S.profile,
    settings: S.settings,
    meta: Object.entries(S.meta).filter(([k]) => k !== 'active').map(([id, value]) => ({ id, value })),
    photos: await Promise.all(photos.map(async (p) => ({ id: p.id, type: p.type, createdAt: p.createdAt, dataUrl: await blobToDataUrl(p.blob) }))),
  };
  for (const c of COLLECTIONS) data[c] = S[c];
  const out = { app: 'study-hq', format: FORMAT, exportedAt: new Date().toISOString(), data };
  download(`study-hq-backup-${today()}.json`, JSON.stringify(out), 'application/json');
  saveSettings({ lastBackupAt: new Date().toISOString() });
}

/** Parse and check a backup file. Returns the parsed object or throws a friendly error. */
export async function readBackup(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { throw new Error('That file isn’t a Study HQ backup (it isn’t valid JSON).'); }
  if (!obj || obj.app !== 'study-hq' || !obj.data) throw new Error('That file isn’t a Study HQ backup.');
  if (obj.format > FORMAT) throw new Error('This backup is from a newer version of Study HQ.');
  return obj;
}

export function backupSummary(obj) {
  const d = obj.data;
  return {
    exportedAt: obj.exportedAt,
    subjects: (d.subjects || []).length,
    mistakes: (d.mistakes || []).length,
    sessions: (d.sessions || []).length,
    photos: (d.photos || []).length,
  };
}

/** Full restore: replaces everything in this browser with the backup. */
export async function restoreBackup(obj) {
  const d = obj.data;
  await db.clearStores();
  if (d.profile) await db.put('profile', d.profile);
  if (d.settings) await db.put('settings', { ...d.settings, lastBackupAt: d.settings.lastBackupAt || obj.exportedAt });
  if (d.meta && d.meta.length) await db.putMany('meta', d.meta);
  for (const c of COLLECTIONS) if (Array.isArray(d[c]) && d[c].length) await db.putMany(c, d[c]);
  if (Array.isArray(d.photos) && d.photos.length) {
    await db.putMany('photos', d.photos.map((p) => ({ id: p.id, type: p.type, createdAt: p.createdAt, blob: dataUrlToBlob(p.dataUrl) })));
  }
  await load();
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportMistakesCsv() {
  const head = ['Date', 'Subject', 'Topic', 'Source and question', 'What went wrong', 'Fix / rule', 'Type', 'Difficulty', 'Marks lost', 'Status', 'Next redo', 'Link', 'Notes'];
  const rows = [...S.mistakes].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((m) => [
    m.date, subjectLabel(subjectById(m.subjectId)), topicLabel(topicById(m.topicId)), m.source, m.wrong, m.fix,
    m.type, m.difficulty, m.marksLost, m.status, m.status === 'open' ? m.dueAt : '', m.link, m.notes,
  ]);
  const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  download(`study-hq-mistakes-${today()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

export async function eraseEverything() {
  await db.clearStores();
  await load();
}
