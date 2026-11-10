import Database from '@tauri-apps/plugin-sql';
import {
  BlockAttempt,
  Category,
  ClassificationRule,
  DailySummary,
  FocusSession,
  TaskItem,
} from '@focuswatch/shared-types';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CLASSIFICATION_RULES,
  DEFAULT_BLOCKED_DOMAINS,
  ALLOWED_EXCEPTIONS,
} from '@focuswatch/domain-rules';

export class DatabaseService {
  private db: Database | null = null;
  private isTauriAvailable = false;

  public async init(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && '__TAURI__' in window) {
        this.isTauriAvailable = true;
        this.db = await Database.load('sqlite:focuswatch.db');
        await this.runMigrations();
        await this.seedDefaults();
      } else {
        console.warn('Tauri environment not detected; operating in local web mode with WebStorage fallback');
      }
    } catch (err) {
      console.error('Failed to initialize SQLite database, using fallback storage:', err);
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) return;

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        expected_output TEXT,
        estimated_minutes INTEGER DEFAULT 45,
        priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
        status TEXT CHECK(status IN ('backlog', 'in_progress', 'completed', 'archived')) DEFAULT 'backlog',
        effort TEXT DEFAULT 'low',
        impact TEXT DEFAULT 'high',
        due_date TEXT,
        tags TEXT DEFAULT '[]',
        subtasks TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        linked_session_id TEXT
      );

      CREATE TABLE IF NOT EXISTS focus_sessions (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        expected_output TEXT,
        planned_minutes INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        planned_end_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        strictness TEXT NOT NULL,
        block_rule_set_id TEXT,
        completed_outcome TEXT,
        completion_note TEXT,
        task_id TEXT,
        ai_summary TEXT,
        ai_key_highlights TEXT,
        ai_productivity_rating INTEGER
      );

      CREATE TABLE IF NOT EXISTS block_attempts (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        timestamp TEXT NOT NULL,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        action TEXT NOT NULL,
        unlock_reason TEXT,
        unlock_minutes INTEGER,
        FOREIGN KEY(session_id) REFERENCES focus_sessions(id)
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        productivity_weight REAL NOT NULL,
        type TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS classification_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        target TEXT NOT NULL,
        match_type TEXT NOT NULL,
        pattern TEXT NOT NULL,
        category_id TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(category_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_summaries (
        date TEXT PRIMARY KEY,
        active_seconds INTEGER NOT NULL,
        focused_seconds INTEGER NOT NULL,
        productive_seconds INTEGER NOT NULL,
        distracting_seconds INTEGER NOT NULL,
        neutral_seconds INTEGER NOT NULL,
        context_switches INTEGER NOT NULL,
        block_attempts INTEGER NOT NULL,
        unlocks INTEGER NOT NULL,
        sessions_started INTEGER NOT NULL,
        sessions_completed INTEGER NOT NULL,
        outputs_completed INTEGER NOT NULL,
        focus_score REAL NOT NULL,
        generated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deleted_task_ids (
        id TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL
      );
    `);

    // Safely add columns if running on an existing SQLite DB
    const alterQueries = [
      'ALTER TABLE tasks ADD COLUMN effort TEXT DEFAULT \'low\';',
      'ALTER TABLE tasks ADD COLUMN impact TEXT DEFAULT \'high\';',
      'ALTER TABLE tasks ADD COLUMN due_date TEXT;',
      'ALTER TABLE focus_sessions ADD COLUMN task_id TEXT;',
      'ALTER TABLE focus_sessions ADD COLUMN ai_summary TEXT;',
      'ALTER TABLE focus_sessions ADD COLUMN ai_key_highlights TEXT;',
      'ALTER TABLE focus_sessions ADD COLUMN ai_productivity_rating INTEGER;',
      'ALTER TABLE focus_sessions ADD COLUMN block_websites INTEGER;',
      'ALTER TABLE focus_sessions ADD COLUMN paused_at TEXT;',
      'ALTER TABLE focus_sessions ADD COLUMN total_paused_ms INTEGER DEFAULT 0;',
      'ALTER TABLE focus_sessions ADD COLUMN pause_updated_at TEXT;',
      'ALTER TABLE focus_sessions ADD COLUMN difficulty INTEGER;',
      'ALTER TABLE focus_sessions ADD COLUMN estimate_accuracy TEXT;',
      'ALTER TABLE focus_sessions ADD COLUMN would_do_differently TEXT;',
      'ALTER TABLE focus_sessions ADD COLUMN did_other_tasks INTEGER;',
      'ALTER TABLE focus_sessions ADD COLUMN other_tasks_note TEXT;',
      'ALTER TABLE focus_sessions ADD COLUMN category_id TEXT;',
      'ALTER TABLE tasks ADD COLUMN category_id TEXT;',
    ];
    for (const query of alterQueries) {
      try {
        await this.db.execute(query);
      } catch {
        // Column likely already exists
      }
    }
  }

  private async seedDefaults(): Promise<void> {
    if (!this.db) return;

    // Seed Categories
    const existingCats: any[] = await this.db.select('SELECT COUNT(*) as count FROM categories');
    if (existingCats[0]?.count === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        await this.db.execute(
          'INSERT INTO categories (id, name, productivity_weight, type) VALUES ($1, $2, $3, $4)',
          [cat.id, cat.name, cat.productivityWeight, cat.type]
        );
      }
    }

    // Seed Rules
    const existingRules: any[] = await this.db.select('SELECT COUNT(*) as count FROM classification_rules');
    if (existingRules[0]?.count === 0) {
      for (const rule of DEFAULT_CLASSIFICATION_RULES) {
        await this.db.execute(
          'INSERT INTO classification_rules (id, name, target, match_type, pattern, category_id, priority, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [rule.id, rule.name, rule.target, rule.matchType, rule.pattern, rule.categoryId, rule.priority, rule.enabled ? 1 : 0]
        );
      }
    }
  }

  // --- Classification Rules ---
  public async getBlockedDomains(): Promise<string[]> {
    if (this.db) {
      try {
        const rows: any[] = await this.db.select("SELECT value_json FROM settings WHERE key = 'blocked_domains'");
        if (rows.length > 0) {
          return JSON.parse(rows[0].value_json);
        }
      } catch {}
    }
    const stored = localStorage.getItem('focuswatch_blocked_domains');
    if (stored) {
      try { return JSON.parse(stored); } catch {}
    }
    return DEFAULT_BLOCKED_DOMAINS;
  }

  public async saveBlockedDomains(domains: string[]): Promise<void> {
    const clean = Array.from(new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean)));
    if (this.db) {
      try {
        await this.db.execute(
          "INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES ('blocked_domains', $1, $2)",
          [JSON.stringify(clean), new Date().toISOString()]
        );
      } catch {}
    }
    localStorage.setItem('focuswatch_blocked_domains', JSON.stringify(clean));
  }

  public async getAllowedExceptions(): Promise<string[]> {
    if (this.db) {
      try {
        const rows: any[] = await this.db.select("SELECT value_json FROM settings WHERE key = 'allowed_exceptions'");
        if (rows.length > 0) {
          return JSON.parse(rows[0].value_json);
        }
      } catch {}
    }
    const stored = localStorage.getItem('focuswatch_allowed_exceptions');
    if (stored) {
      try { return JSON.parse(stored); } catch {}
    }
    return ALLOWED_EXCEPTIONS;
  }

  public async saveAllowedExceptions(domains: string[]): Promise<void> {
    const clean = Array.from(new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean)));
    if (this.db) {
      try {
        await this.db.execute(
          "INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES ('allowed_exceptions', $1, $2)",
          [JSON.stringify(clean), new Date().toISOString()]
        );
      } catch {}
    }
    localStorage.setItem('focuswatch_allowed_exceptions', JSON.stringify(clean));
  }

  public async getClassificationRules(): Promise<ClassificationRule[]> {
    if (this.db) {
      const rows: any[] = await this.db.select('SELECT * FROM classification_rules ORDER BY priority DESC');
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        target: r.target,
        matchType: r.match_type,
        pattern: r.pattern,
        categoryId: r.category_id,
        priority: r.priority,
        enabled: Boolean(r.enabled),
      }));
    } else {
      const stored = localStorage.getItem('classification_rules');
      if (stored) return JSON.parse(stored);
      localStorage.setItem('classification_rules', JSON.stringify(DEFAULT_CLASSIFICATION_RULES));
      return DEFAULT_CLASSIFICATION_RULES;
    }
  }

  public async saveRule(rule: ClassificationRule): Promise<void> {
    if (this.db) {
      await this.db.execute(
        `INSERT OR REPLACE INTO classification_rules
        (id, name, target, match_type, pattern, category_id, priority, enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [rule.id, rule.name, rule.target, rule.matchType, rule.pattern, rule.categoryId, rule.priority, rule.enabled ? 1 : 0]
      );
    } else {
      const rules = await this.getClassificationRules();
      const idx = rules.findIndex((r) => r.id === rule.id || (r.pattern === rule.pattern && r.target === rule.target));
      if (idx >= 0) {
        rules[idx] = rule;
      } else {
        rules.unshift(rule);
      }
      localStorage.setItem('classification_rules', JSON.stringify(rules));
    }
  }

  // --- Tasks ---
  public async saveTask(task: TaskItem): Promise<void> {
    if (this.db) {
      await this.db.execute(
        `INSERT OR REPLACE INTO tasks
        (id, title, description, expected_output, estimated_minutes, priority, status, effort, impact, due_date, tags, subtasks, created_at, updated_at, completed_at, linked_session_id, category_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          task.id,
          task.title,
          task.description || null,
          task.expectedOutput || null,
          task.estimatedMinutes,
          task.priority,
          task.status,
          task.effort || 'low',
          task.impact || 'high',
          task.dueDate || null,
          JSON.stringify(task.tags || []),
          JSON.stringify(task.subtasks || []),
          task.createdAt,
          task.updatedAt,
          task.completedAt || null,
          task.linkedSessionId || null,
          task.categoryId || null,
        ]
      );
    } else {
      localStorage.setItem(`task_${task.id}`, JSON.stringify(task));
    }
  }

  public async getTaskById(id: string): Promise<TaskItem | null> {
    if (this.db) {
      const rows: any[] = await this.db.select('SELECT * FROM tasks WHERE id = $1 LIMIT 1', [id]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        title: r.title,
        description: r.description || undefined,
        expectedOutput: r.expected_output || undefined,
        estimatedMinutes: r.estimated_minutes,
        priority: r.priority,
        status: r.status,
        effort: r.effort || 'low',
        impact: r.impact || 'high',
        dueDate: r.due_date || undefined,
        tags: JSON.parse(r.tags || '[]'),
        subtasks: JSON.parse(r.subtasks || '[]'),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        completedAt: r.completed_at || undefined,
        linkedSessionId: r.linked_session_id || undefined,
        categoryId: r.category_id || undefined,
      };
    } else {
      const raw = localStorage.getItem(`task_${id}`);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    }
  }

  public async getAllTasks(): Promise<TaskItem[]> {
    if (this.db) {
      try {
        const rows: any[] = await this.db.select('SELECT * FROM tasks ORDER BY created_at DESC');
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description || undefined,
          expectedOutput: r.expected_output || undefined,
          estimatedMinutes: r.estimated_minutes,
          priority: r.priority,
          status: r.status,
          effort: r.effort || 'low',
          impact: r.impact || 'high',
          dueDate: r.due_date || undefined,
          tags: JSON.parse(r.tags || '[]'),
          subtasks: JSON.parse(r.subtasks || '[]'),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          completedAt: r.completed_at || undefined,
          linkedSessionId: r.linked_session_id || undefined,
        categoryId: r.category_id || undefined,
        }));
      } catch {
        return [];
      }
    } else {
      const tasks: TaskItem[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('task_')) {
          try {
            const item = JSON.parse(localStorage.getItem(key) || '');
            if (item && item.id && item.title) {
              tasks.push(item);
            }
          } catch {}
        }
      }
      return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  public async addDeletedTaskId(id: string): Promise<void> {
    if (this.db) {
      try {
        await this.db.execute(
          'INSERT OR REPLACE INTO deleted_task_ids (id, deleted_at) VALUES ($1, $2)',
          [id, new Date().toISOString()]
        );
      } catch {}
    } else {
      const stored = localStorage.getItem('deleted_task_ids');
      const list: string[] = stored ? JSON.parse(stored) : [];
      if (!list.includes(id)) {
        list.push(id);
        localStorage.setItem('deleted_task_ids', JSON.stringify(list));
      }
    }
  }

  public async getDeletedTaskIds(): Promise<Set<string>> {
    if (this.db) {
      try {
        const rows: any[] = await this.db.select('SELECT id FROM deleted_task_ids');
        return new Set(rows.map((r) => r.id));
      } catch {
        return new Set();
      }
    } else {
      const stored = localStorage.getItem('deleted_task_ids');
      return new Set(stored ? JSON.parse(stored) : []);
    }
  }

  public async deleteTask(id: string): Promise<void> {
    await this.addDeletedTaskId(id);
    if (this.db) {
      await this.db.execute('DELETE FROM tasks WHERE id = $1', [id]);
    } else {
      localStorage.removeItem(`task_${id}`);
    }
  }

  // --- Focus Sessions ---
  public async saveFocusSession(session: FocusSession): Promise<void> {
    if (this.db) {
      await this.db.execute(
        `INSERT OR REPLACE INTO focus_sessions
        (id, task, expected_output, planned_minutes, started_at, planned_end_at, ended_at, status, strictness, block_rule_set_id, completed_outcome, completion_note, task_id, ai_summary, ai_key_highlights, ai_productivity_rating,
         block_websites, paused_at, total_paused_ms, pause_updated_at, difficulty, estimate_accuracy, would_do_differently, did_other_tasks, other_tasks_note, category_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          session.id,
          session.task,
          session.expectedOutput || null,
          session.plannedMinutes,
          session.startedAt,
          session.plannedEndAt,
          session.endedAt || null,
          session.status,
          session.strictness,
          session.blockRuleSetId,
          session.completedOutcome || null,
          session.completionNote || null,
          session.taskId || null,
          session.aiSummary || null,
          session.aiKeyHighlights ? JSON.stringify(session.aiKeyHighlights) : null,
          session.aiProductivityRating || null,
          session.blockWebsites === undefined ? null : session.blockWebsites ? 1 : 0,
          session.pausedAt || null,
          session.totalPausedMs || 0,
          session.pauseUpdatedAt || null,
          session.difficulty || null,
          session.estimateAccuracy || null,
          session.wouldDoDifferently || null,
          session.didOtherTasks === undefined ? null : session.didOtherTasks ? 1 : 0,
          session.otherTasksNote || null,
          session.categoryId || null,
        ]
      );
    } else {
      localStorage.setItem(`session_${session.id}`, JSON.stringify(session));
      if (session.status === 'active') {
        localStorage.setItem('active_session_id', session.id);
      } else {
        localStorage.removeItem('active_session_id');
      }
    }
  }

  private mapSessionRow(r: any): FocusSession {
    return {
      id: r.id,
      taskId: r.task_id || undefined,
      task: r.task,
      expectedOutput: r.expected_output,
      plannedMinutes: r.planned_minutes,
      startedAt: r.started_at,
      plannedEndAt: r.planned_end_at,
      endedAt: r.ended_at,
      status: r.status,
      strictness: r.strictness,
      blockRuleSetId: r.block_rule_set_id,
      blockWebsites: r.block_websites === null || r.block_websites === undefined ? undefined : Boolean(r.block_websites),
      completedOutcome: r.completed_outcome,
      completionNote: r.completion_note,
      pausedAt: r.paused_at || undefined,
      totalPausedMs: r.total_paused_ms || 0,
      pauseUpdatedAt: r.pause_updated_at || undefined,
      difficulty: r.difficulty || undefined,
      estimateAccuracy: r.estimate_accuracy || undefined,
      wouldDoDifferently: r.would_do_differently || undefined,
      didOtherTasks: r.did_other_tasks === null || r.did_other_tasks === undefined ? undefined : Boolean(r.did_other_tasks),
      otherTasksNote: r.other_tasks_note || undefined,
      categoryId: r.category_id || undefined,
      aiSummary: r.ai_summary || undefined,
      aiKeyHighlights: r.ai_key_highlights ? JSON.parse(r.ai_key_highlights) : undefined,
      aiProductivityRating: r.ai_productivity_rating || undefined,
    };
  }

  public async getActiveSession(): Promise<FocusSession | null> {
    if (this.db) {
      const rows: any[] = await this.db.select("SELECT * FROM focus_sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1");
      if (rows.length === 0) return null;
      return this.mapSessionRow(rows[0]);
    } else {
      const activeId = localStorage.getItem('active_session_id');
      if (!activeId) return null;
      const raw = localStorage.getItem(`session_${activeId}`);
      if (!raw) return null;
      const parsed: FocusSession = JSON.parse(raw);
      return parsed.status === 'active' ? parsed : null;
    }
  }

  public async getAllFocusSessions(): Promise<FocusSession[]> {
    if (this.db) {
      try {
        const rows: any[] = await this.db.select('SELECT * FROM focus_sessions ORDER BY started_at DESC');
        return rows.map((r) => this.mapSessionRow(r));
      } catch {
        return [];
      }
    } else {
      const sessions: FocusSession[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('session_')) {
          try {
            const item = JSON.parse(localStorage.getItem(key) || '');
            if (item && item.id && item.task) {
              sessions.push(item);
            }
          } catch {}
        }
      }
      return sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    }
  }

  public async deleteFocusSession(id: string): Promise<void> {
    if (this.db) {
      await this.db.execute('DELETE FROM focus_sessions WHERE id = $1', [id]);
    } else {
      localStorage.removeItem(`session_${id}`);
      const activeId = localStorage.getItem('active_session_id');
      if (activeId === id) {
        localStorage.removeItem('active_session_id');
      }
    }
  }

  // --- Block Attempts ---
  public async logBlockAttempt(attempt: BlockAttempt): Promise<void> {
    if (this.db) {
      await this.db.execute(
        `INSERT INTO block_attempts
        (id, session_id, timestamp, url, domain, rule_id, action, unlock_reason, unlock_minutes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          attempt.id,
          attempt.sessionId || null,
          attempt.timestamp,
          attempt.url,
          attempt.domain,
          attempt.ruleId,
          attempt.action,
          attempt.unlockReason || null,
          attempt.unlockMinutes || null,
        ]
      );
    } else {
      const attempts = JSON.parse(localStorage.getItem('block_attempts') || '[]');
      attempts.push(attempt);
      localStorage.setItem('block_attempts', JSON.stringify(attempts));
    }
  }

  public async getAllBlockAttempts(): Promise<BlockAttempt[]> {
    if (this.db) {
      try {
        const rows: any[] = await this.db.select('SELECT * FROM block_attempts ORDER BY timestamp DESC');
        return rows.map((r) => ({
          id: r.id,
          sessionId: r.session_id,
          timestamp: r.timestamp,
          url: r.url,
          domain: r.domain,
          ruleId: r.rule_id,
          action: r.action,
          unlockReason: r.unlock_reason,
          unlockMinutes: r.unlock_minutes,
        }));
      } catch {
        return [];
      }
    } else {
      return JSON.parse(localStorage.getItem('block_attempts') || '[]');
    }
  }

  public async getBlockAttemptsForSession(sessionId: string): Promise<BlockAttempt[]> {
    if (this.db) {
      const rows: any[] = await this.db.select('SELECT * FROM block_attempts WHERE session_id = $1 ORDER BY timestamp DESC', [sessionId]);
      return rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        timestamp: r.timestamp,
        url: r.url,
        domain: r.domain,
        ruleId: r.rule_id,
        action: r.action,
        unlockReason: r.unlock_reason,
        unlockMinutes: r.unlock_minutes,
      }));
    } else {
      const attempts: BlockAttempt[] = JSON.parse(localStorage.getItem('block_attempts') || '[]');
      return attempts.filter((a) => a.sessionId === sessionId);
    }
  }
}

export const dbService = new DatabaseService();
