import type { Tables, TableName } from "../domain/types";
import { ConditionFailedError, type AdjustOptions, type Repository } from "../ports/repository";

type Store = Map<string, Map<string, unknown>>;

/**
 * Repositorio en memoria. Al no haber `await` entre lectura y escritura dentro de
 * `adjust`, cada operación es atómica en el único hilo de Node.
 */
export class MemoryRepository implements Repository {
  protected store: Store = new Map();
  protected counters = new Map<string, number>();

  protected table(name: string) {
    let t = this.store.get(name);
    if (!t) {
      t = new Map();
      this.store.set(name, t);
    }
    return t;
  }

  protected changed(): void {
    /* gancho para persistencia */
  }

  async get<K extends TableName>(table: K, id: string) {
    const v = this.table(table).get(id);
    return v ? (structuredClone(v) as Tables[K]) : null;
  }

  async put<K extends TableName>(table: K, item: Tables[K]) {
    this.table(table).set((item as { id: string }).id, structuredClone(item));
    this.changed();
    return item;
  }

  async list<K extends TableName>(table: K, predicate?: (item: Tables[K]) => boolean) {
    const all = [...this.table(table).values()].map((v) => structuredClone(v) as Tables[K]);
    return predicate ? all.filter(predicate) : all;
  }

  async remove<K extends TableName>(table: K, id: string) {
    this.table(table).delete(id);
    this.changed();
  }

  async adjust<K extends TableName>(table: K, id: string, field: string, delta: number, options: AdjustOptions = {}) {
    const row = this.table(table).get(id) as Record<string, unknown> | undefined;
    if (!row) throw new ConditionFailedError(`No existe ${table}/${id}`);
    const current = typeof row[field] === "number" ? (row[field] as number) : 0;
    const next = current + delta;
    if (options.min !== undefined && next < options.min) throw new ConditionFailedError(`${field} quedaría por debajo de ${options.min}`);
    if (options.max !== undefined && next > options.max) throw new ConditionFailedError(`${field} superaría ${options.max}`);
    row[field] = next;
    this.changed();
    return next;
  }

  async nextCounter(name: string) {
    const n = (this.counters.get(name) ?? 0) + 1;
    this.counters.set(name, n);
    this.changed();
    return n;
  }

  async clearAll() {
    this.store.clear();
    this.counters.clear();
    this.changed();
  }
}
