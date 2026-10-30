import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { Tables, TableName } from "../domain/types";
import { ConditionFailedError, type AdjustOptions, type Repository } from "../ports/repository";

/**
 * Repositorio DynamoDB de tabla única. pk = `T#<tabla>`, sk = id.
 * `adjust` usa UpdateItem con ConditionExpression: es atómico en el servidor.
 */
export class DynamoRepository implements Repository {
  private doc: DynamoDBDocumentClient;

  constructor(
    private tableName: string,
    client?: DynamoDBClient,
  ) {
    this.doc = DynamoDBDocumentClient.from(client ?? new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  private pk(table: string) {
    return `T#${table}`;
  }

  async get<K extends TableName>(table: K, id: string) {
    const r = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { pk: this.pk(table), sk: id } }));
    return (r.Item?.data as Tables[K] | undefined) ?? null;
  }

  async put<K extends TableName>(table: K, item: Tables[K]) {
    const id = (item as { id: string }).id;
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: { pk: this.pk(table), sk: id, data: item } }));
    return item;
  }

  async list<K extends TableName>(table: K, predicate?: (item: Tables[K]) => boolean) {
    const out: Tables[K][] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": this.pk(table) },
          ExclusiveStartKey,
        }),
      );
      for (const i of r.Items ?? []) out.push(i.data as Tables[K]);
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return predicate ? out.filter(predicate) : out;
  }

  async remove<K extends TableName>(table: K, id: string) {
    await this.doc.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: this.pk(table), sk: id } }));
  }

  async adjust<K extends TableName>(table: K, id: string, field: string, delta: number, options: AdjustOptions = {}) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw new Error("Nombre de campo inválido");
    // Los campos numéricos que se ajustan se inicializan siempre al crear el registro,
    // por lo que la condición puede compararlos directamente (ConditionExpression no admite if_not_exists).
    const conds = ["attribute_exists(pk)"];
    const values: Record<string, unknown> = { ":d": delta, ":zero": 0 };
    if (options.min !== undefined) {
      conds.push("#data.#f >= :minPre");
      values[":minPre"] = options.min - delta;
    }
    if (options.max !== undefined) {
      conds.push("#data.#f <= :maxPre");
      values[":maxPre"] = options.max - delta;
    }
    const condition = conds.join(" AND ");
    try {
      const r = await this.doc.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: this.pk(table), sk: id },
          UpdateExpression: "SET #data.#f = if_not_exists(#data.#f, :zero) + :d",
          ConditionExpression: condition,
          ExpressionAttributeNames: { "#data": "data", "#f": field },
          ExpressionAttributeValues: values,
          ReturnValues: "UPDATED_NEW",
        }),
      );
      return (r.Attributes?.data as Record<string, number>)[field];
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) throw new ConditionFailedError(`Condición fallida en ${table}/${id}.${field}`);
      throw e;
    }
  }

  async nextCounter(name: string) {
    const r = await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: "COUNTER", sk: name },
        UpdateExpression: "ADD #v :one",
        ExpressionAttributeNames: { "#v": "value" },
        ExpressionAttributeValues: { ":one": 1 },
        ReturnValues: "UPDATED_NEW",
      }),
    );
    return r.Attributes?.value as number;
  }

  async clearAll() {
    // Solo para reinicio de la demo: borra todo el contenido de la tabla de la aplicación.
    const pks = new Set<string>();
    const items: { pk: string; sk: string }[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
    do {
      const r = await this.doc.send(
        new ScanCommand({ TableName: this.tableName, ProjectionExpression: "pk, sk", ExclusiveStartKey }),
      );
      for (const i of r.Items ?? []) {
        pks.add(i.pk);
        items.push({ pk: i.pk, sk: i.sk });
      }
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    for (let i = 0; i < items.length; i += 25) {
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: { [this.tableName]: items.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } })) },
        }),
      );
    }
  }
}
