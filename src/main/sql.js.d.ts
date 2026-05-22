declare module 'sql.js' {
  function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database
  }

  interface Database {
    run(sql: string, params?: unknown[]): void
    exec(sql: string): QueryExecResult[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }

  interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }

  interface Statement {
    bind(params?: unknown[]): boolean
    step(): boolean
    getAsObject<T = Record<string, unknown>>(): T
    free(): boolean
  }

  export default initSqlJs
  export { SqlJsStatic, Database, Statement, QueryExecResult }
}
