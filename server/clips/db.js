const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const CLIPS_DB_DIR = path.join(__dirname, '../../db');
if (!fs.existsSync(CLIPS_DB_DIR)) fs.mkdirSync(CLIPS_DB_DIR, { recursive: true });

const db = new Database(path.join(CLIPS_DB_DIR, 'clips.db'));

db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id      TEXT NOT NULL,
        source_path TEXT NOT NULL,
        source_name TEXT,
        source_url  TEXT,
        start_sec   REAL NOT NULL DEFAULT 0,
        end_sec     REAL NOT NULL DEFAULT 0,
        duration    REAL NOT NULL DEFAULT 0,
        title       TEXT,
        caption     TEXT,
        aspect_ratio TEXT DEFAULT '9:16',
        status      TEXT DEFAULT 'pending',
        output_path TEXT,
        thumbnail   TEXT,
        score       INTEGER DEFAULT 0,
        approved    INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clip_jobs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id      TEXT UNIQUE NOT NULL,
        source_path TEXT,
        source_name TEXT,
        source_url  TEXT,
        duration    REAL,
        prompt      TEXT,
        status      TEXT DEFAULT 'pending',
        created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS edit_jobs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id          TEXT UNIQUE NOT NULL,
        source_path     TEXT NOT NULL,
        source_name     TEXT,
        duration        REAL DEFAULT 0,
        silence_thresh  REAL DEFAULT 1.5,
        remove_fillers  INTEGER DEFAULT 1,
        status          TEXT DEFAULT 'pending',
        segments_json   TEXT,
        transcript_json TEXT,
        created_at      TEXT DEFAULT (datetime('now'))
    );
`);

const saveJob = ({ job_id, source_path, source_name, source_url, duration, prompt }) => {
    return db.prepare(`
        INSERT OR REPLACE INTO clip_jobs (job_id, source_path, source_name, source_url, duration, prompt, status)
        VALUES (?, ?, ?, ?, ?, ?, 'processing')
    `).run(job_id, source_path, source_name || null, source_url || null, duration || 0, prompt || '');
};

const updateJobStatus = (job_id, status) => {
    db.prepare('UPDATE clip_jobs SET status = ? WHERE job_id = ?').run(status, job_id);
};

const getJob = (job_id) => db.prepare('SELECT * FROM clip_jobs WHERE job_id = ?').get(job_id);

const listJobs = () => db.prepare('SELECT * FROM clip_jobs ORDER BY created_at DESC LIMIT 50').all();

const saveClip = ({ job_id, source_path, source_name, source_url, start_sec, end_sec, duration, title, caption, aspect_ratio, status, output_path, thumbnail, score }) => {
    return db.prepare(`
        INSERT INTO clips (job_id, source_path, source_name, source_url, start_sec, end_sec, duration, title, caption, aspect_ratio, status, output_path, thumbnail, score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(job_id, source_path, source_name || null, source_url || null, start_sec, end_sec, duration, title || '', caption || '', aspect_ratio || '9:16', status || 'pending', output_path || null, thumbnail || null, score || 0);
};

const updateClip = (id, fields) => {
    const allowed = ['title', 'caption', 'status', 'output_path', 'thumbnail', 'score', 'approved'];
    const sets = allowed.filter(k => k in fields).map(k => `${k} = ?`).join(', ');
    const vals = allowed.filter(k => k in fields).map(k => fields[k]);
    if (!sets) return;
    db.prepare(`UPDATE clips SET ${sets} WHERE id = ?`).run(...vals, id);
};

const getClip = (id) => db.prepare('SELECT * FROM clips WHERE id = ?').get(id);

const listClips = (job_id) => {
    if (job_id) return db.prepare('SELECT * FROM clips WHERE job_id = ? ORDER BY start_sec ASC').all(job_id);
    return db.prepare('SELECT * FROM clips ORDER BY created_at DESC LIMIT 200').all();
};

const deleteClip = (id) => db.prepare('DELETE FROM clips WHERE id = ?').run(id);

const deleteJob = (job_id) => {
    db.prepare('DELETE FROM clips WHERE job_id = ?').run(job_id);
    db.prepare('DELETE FROM clip_jobs WHERE job_id = ?').run(job_id);
};

// ── Edit Jobs (Gatilho de Edição) ─────────────────────────────────────────────
const saveEditJob = ({ job_id, source_path, source_name, duration, silence_thresh, remove_fillers }) => {
    return db.prepare(`
        INSERT OR REPLACE INTO edit_jobs (job_id, source_path, source_name, duration, silence_thresh, remove_fillers, status)
        VALUES (?, ?, ?, ?, ?, ?, 'processing')
    `).run(job_id, source_path, source_name || null, duration || 0, silence_thresh ?? 1.5, remove_fillers ? 1 : 0);
};

const updateEditJob = (job_id, fields) => {
    const allowed = ['status', 'segments_json', 'transcript_json', 'duration'];
    const sets = allowed.filter(k => k in fields).map(k => `${k} = ?`).join(', ');
    const vals = allowed.filter(k => k in fields).map(k => fields[k]);
    if (!sets) return;
    db.prepare(`UPDATE edit_jobs SET ${sets} WHERE job_id = ?`).run(...vals, job_id);
};

const getEditJob = (job_id) => db.prepare('SELECT * FROM edit_jobs WHERE job_id = ?').get(job_id);

const listEditJobs = () => db.prepare('SELECT * FROM edit_jobs ORDER BY created_at DESC LIMIT 50').all();

const deleteEditJob = (job_id) => db.prepare('DELETE FROM edit_jobs WHERE job_id = ?').run(job_id);

module.exports = { db, saveJob, updateJobStatus, getJob, listJobs, saveClip, updateClip, getClip, listClips, deleteClip, deleteJob, saveEditJob, updateEditJob, getEditJob, listEditJobs, deleteEditJob };
