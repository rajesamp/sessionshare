import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(message, status = 400, code = 'invalid_request') { super(message); this.status = status; this.code = code; }
}
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const uid = () => randomUUID();

export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(workspace_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL, type TEXT NOT NULL, published_at INTEGER NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY(workspace_id,seq), UNIQUE(workspace_id,event_id));
      CREATE TABLE IF NOT EXISTS visibility(workspace_id TEXT NOT NULL, seq INTEGER NOT NULL, received_at INTEGER NOT NULL,
        PRIMARY KEY(workspace_id,seq));`);
    this.listeners = new Set();
  }
  create(data) {
    const state = { ...data, id: data.id || uid(), revision: 0, createdAt: Date.now() };
    this.db.prepare('INSERT INTO workspaces VALUES(?,?,?)').run(state.id, 0, JSON.stringify(state));
    return state;
  }
  get(id) {
    const row = this.db.prepare('SELECT data FROM workspaces WHERE id=?').get(id);
    if (!row) throw new AppError('Workspace not found', 404);
    return JSON.parse(row.data);
  }
  list() { return this.db.prepare('SELECT data FROM workspaces').all().map(r => JSON.parse(r.data)); }
  update(id, revision, eventId, type, mutate, request = {}) {
    const fingerprint = hash({ type, request });
    this.db.exec('BEGIN IMMEDIATE');
    let event;
    try {
      const prior = this.db.prepare('SELECT fingerprint,data FROM events WHERE workspace_id=? AND event_id=?').get(id, eventId);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new AppError('Command ID already used for different content', 409, 'idempotency_conflict');
        this.db.exec('COMMIT');
        return { state: this.get(id), event: JSON.parse(prior.data), duplicate: true };
      }
      const state = this.get(id);
      if (state.revision !== revision) throw new AppError('Workspace changed. Refresh before applying this edit.', 409, 'stale_revision');
      const detail = mutate(state) || {};
      state.revision++;
      event = { workspaceId: id, seq: state.revision, eventId, type, publishedAt: Date.now(), detail };
      this.db.prepare('UPDATE workspaces SET revision=?,data=? WHERE id=?').run(state.revision, JSON.stringify(state), id);
      this.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?)').run(id, state.revision, eventId, fingerprint, type, event.publishedAt, JSON.stringify(event));
      this.db.exec('COMMIT');
      for (const listener of this.listeners) { try { listener(event); } catch { /* A subscriber cannot roll back a committed event. */ } }
      return { state, event, duplicate: false };
    } catch (error) { if (this.db.isTransaction) this.db.exec('ROLLBACK'); throw error; }
  }
  events(id, after = 0) {
    return this.db.prepare('SELECT data FROM events WHERE workspace_id=? AND seq>? ORDER BY seq').all(id, after).map(r => JSON.parse(r.data));
  }
  acknowledge(id, seq) {
    if (!Number.isInteger(seq) || seq < 1 || seq > this.get(id).revision) throw new AppError('Invalid event sequence');
    this.db.prepare('INSERT OR IGNORE INTO visibility VALUES(?,?,?)').run(id, seq, Date.now());
  }
  visibility(id) {
    return this.db.prepare(`SELECT v.seq, v.received_at-e.published_at AS renderAckMs FROM visibility v
      JOIN events e ON e.workspace_id=v.workspace_id AND e.seq=v.seq WHERE v.workspace_id=? ORDER BY v.seq DESC LIMIT 100`).all(id);
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  close() { this.db.close(); }
}
