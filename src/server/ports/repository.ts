import type { Tables, TableName } from "../domain/types";

export class ConditionFailedError extends Error {
  constructor(message = "Condición no satisfecha") {
    super(message);
    this.name = "ConditionFailedError";
  }
}

export interface AdjustOptions {
  /** El valor resultante no puede ser menor que este mínimo. */
  min?: number;
  /** El valor resultante no puede superar este máximo. */
  max?: number;
}

/**
 * Puerto de persistencia. Implementado por memoria, archivo (local) y DynamoDB (AWS).
 * `adjust` DEBE ser atómico y condicional: es la base contra la doble asignación.
 */
export interface Repository {
  get<K extends TableName>(table: K, id: string): Promise<Tables[K] | null>;
  put<K extends TableName>(table: K, item: Tables[K]): Promise<Tables[K]>;
  list<K extends TableName>(table: K, predicate?: (item: Tables[K]) => boolean): Promise<Tables[K][]>;
  remove<K extends TableName>(table: K, id: string): Promise<void>;
  /** Suma `delta` a un campo numérico respetando límites; lanza ConditionFailedError si no se cumplen. */
  adjust<K extends TableName>(
    table: K,
    id: string,
    field: string,
    delta: number,
    options?: AdjustOptions,
  ): Promise<number>;
  /** Contador atómico incremental. */
  nextCounter(name: string): Promise<number>;
  /** Borra todo (solo para reinicio de datos de demostración y pruebas). */
  clearAll(): Promise<void>;
}
