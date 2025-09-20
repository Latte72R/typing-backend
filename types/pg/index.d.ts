declare module 'pg' {
  import type { EventEmitter } from 'node:events';

  interface QueryResultRow {
    [column: string]: unknown;
  }

  interface QueryConfig {
    text: string;
    values?: unknown[];
  }

  interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[];
    rowCount: number;
  }

  interface PoolConfig {
    connectionString?: string;
    user?: string;
    database?: string;
    password?: string;
    port?: number;
    host?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
    max?: number;
    idleTimeoutMillis?: number;
    application_name?: string;
    keepAlive?: boolean;
  }

  class PoolClient extends EventEmitter {
    query<R extends QueryResultRow = QueryResultRow>(queryText: string | QueryConfig, values?: unknown[]): Promise<QueryResult<R>>;
    release(err?: Error): void;
  }

  class Pool extends EventEmitter {
    constructor(config?: PoolConfig);

    query<R extends QueryResultRow = QueryResultRow>(queryText: string | QueryConfig, values?: unknown[]): Promise<QueryResult<R>>;

    connect(): Promise<PoolClient>;

    end(): Promise<void>;
  }

  export { Pool, PoolClient, PoolConfig, QueryConfig, QueryResult, QueryResultRow };
}
