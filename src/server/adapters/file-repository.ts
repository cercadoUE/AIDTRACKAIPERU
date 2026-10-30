import fs from "node:fs";
import path from "node:path";
import { MemoryRepository } from "./memory-repository";

/** Repositorio local persistido en un archivo JSON (data/local/db.json, ignorado por Git). */
export class FileRepository extends MemoryRepository {
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string = path.join(process.cwd(), "data", "local", "db.json")) {
    super();
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as {
        tables: Record<string, [string, unknown][]>;
        counters: Record<string, number>;
      };
      for (const [name, rows] of Object.entries(raw.tables)) this.store.set(name, new Map(rows));
      this.counters = new Map(Object.entries(raw.counters));
    } catch (e) {
      console.error("[FileRepository] no se pudo leer la base local; se inicia vacía", e);
    }
  }

  protected override changed() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 150);
  }

  flush() {
    const tables: Record<string, [string, unknown][]> = {};
    for (const [name, t] of this.store) tables[name] = [...t.entries()];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ tables, counters: Object.fromEntries(this.counters) }));
    fs.renameSync(tmp, this.file);
  }
}
