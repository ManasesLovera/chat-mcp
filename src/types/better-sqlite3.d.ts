declare module "better-sqlite3" {
  export class Statement {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export default class Database {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
  }
}
