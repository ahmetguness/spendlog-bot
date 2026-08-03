import type BetterSqlite3 from "better-sqlite3";

export class ProcessedUpdateRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  has(updateId: number): boolean {
    const row = this.sqlite
      .prepare("SELECT update_id FROM processed_telegram_updates WHERE update_id = ?")
      .get(updateId);
    return row !== undefined;
  }

  mark(updateId: number): void {
    this.sqlite
      .prepare(
        "INSERT OR IGNORE INTO processed_telegram_updates(update_id, processed_at) VALUES(?, ?)",
      )
      .run(updateId, new Date().toISOString());
  }
}
