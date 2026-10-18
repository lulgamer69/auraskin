import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../utils/httpError.js';

const databasePath = join(dirname(fileURLToPath(import.meta.url)), '../../data/aura-feedback.sqlite');

export function createFeedbackService({ database = null } = {}) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = database ?? new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS call_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
  const insertFeedback = db.prepare(
    'INSERT INTO call_feedback (session_id, rating, comment) VALUES (?, ?, ?)',
  );
  const findFeedback = db.prepare(
    'SELECT rating, comment, created_at AS createdAt FROM call_feedback WHERE session_id = ?',
  );

  function submit({ sessionId, rating, comment = '' }) {
    if (!['up', 'down'].includes(rating)) {
      throw new HttpError(400, 'INVALID_FEEDBACK_RATING', 'Choose thumbs up or thumbs down to send feedback.');
    }
    if (typeof comment !== 'string' || comment.length > 1000) {
      throw new HttpError(400, 'INVALID_FEEDBACK_COMMENT', 'Feedback must be 1,000 characters or fewer.');
    }
    if (rating === 'down' && !comment.trim()) {
      throw new HttpError(400, 'FEEDBACK_COMMENT_REQUIRED', 'Tell us what we could have done better.');
    }
    try {
      insertFeedback.run(sessionId, rating, comment.trim());
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new HttpError(409, 'FEEDBACK_ALREADY_SUBMITTED', 'Thanks, we already saved feedback for this call.');
      }
      throw error;
    }
    return findFeedback.get(sessionId);
  }

  return { submit, close: () => { if (!database) db.close(); } };
}
