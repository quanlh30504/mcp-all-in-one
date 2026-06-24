import { astVisitor, parse, toSql, type Statement } from 'pgsql-ast-parser';

export interface SqlPolicy {
  schemasAllowlist: string[];
  tableAllowlist: string[];
  tableDenylist: string[];
  columnDenylist: string[];
  blockedFunctions: string[];
  maxQueryLength: number;
}

export interface SqlAnalysis {
  normalizedSql: string;
  parameterCount: number;
  relations: string[];
  functions: string[];
}

const ALLOWED_STATEMENTS = new Set(['select', 'with', 'with recursive', 'union', 'union all']);

const DEFAULT_BLOCKED_FUNCTIONS = [
  'set_config',
  'current_setting',
  'nextval',
  'setval',
  'pg_notify',
  'pg_advisory_*',
  'pg_try_advisory_*',
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'pg_stat_file',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_reload_conf',
  'pg_rotate_logfile',
  'pg_log_backend_memory_contexts',
  'pg_promote',
  'pg_create_restore_point',
  'pg_switch_wal',
  'pg_wal_*',
  'pg_replication_*',
  'lo_import',
  'lo_export',
  'dblink*',
  'http*',
  'curl*',
  'net.http_*',
  'aws_lambda.*',
  'vault.*'
];

export function validateReadonlySql(sql: unknown, parameters: unknown, policy: SqlPolicy): SqlAnalysis {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('sql must be a non-empty string.');
  if (sql.length > policy.maxQueryLength) throw new Error(`SQL exceeds max_query_length (${policy.maxQueryLength}).`);
  if (!Array.isArray(parameters)) throw new Error('parameters must be an array.');

  let statements: Statement[];
  try {
    statements = parse(sql);
  } catch {
    throw new Error('SQL could not be parsed as a supported PostgreSQL statement.');
  }
  if (statements.length !== 1) throw new Error('Exactly one SQL statement is allowed.');
  const statement = statements[0];
  if (!ALLOWED_STATEMENTS.has(statement.type)) throw new Error('Only SELECT/WITH queries are allowed.');

  const cteNames = new Set<string>();
  const relations = new Set<string>();
  const functions = new Set<string>();
  const columns = new Set<string>();
  const parameterIndexes = new Set<number>();
  let mutationFound = false;
  let lockingClauseFound = false;

  const visitor = astVisitor(map => ({
    with: value => {
      for (const binding of value.bind) cteNames.add(normalize(binding.alias.name));
      map.super().with(value);
    },
    withRecursive: value => {
      cteNames.add(normalize(value.alias.name));
      map.super().withRecursive(value);
    },
    update: value => { mutationFound = true; map.super().update(value); },
    insert: value => { mutationFound = true; map.super().insert(value); },
    delete: value => { mutationFound = true; map.super().delete(value); },
    selection: value => {
      if (value.for) lockingClauseFound = true;
      map.super().selection(value);
    },
    fromTable: value => {
      const tableName = normalize(value.name.name);
      if (value.name.schema || !cteNames.has(tableName)) {
        relations.add(qualifiedName(value.name.schema, value.name.name));
      }
      map.super().fromTable(value);
    },
    call: value => {
      functions.add(qualifiedName(value.function.schema, value.function.name));
      map.super().call(value);
    },
    ref: value => {
      const prefix = value.table ? qualifiedName(value.table.schema, value.table.name) : '';
      columns.add(prefix ? `${prefix}.${normalize(String(value.name))}` : normalize(String(value.name)));
      map.super().ref(value);
    },
    parameter: value => {
      const match = /^\$(\d+)$/.exec(value.name);
      if (!match || Number(match[1]) < 1) throw new Error('Only positional PostgreSQL parameters ($1, $2, ...) are allowed.');
      parameterIndexes.add(Number(match[1]));
      map.super().parameter(value);
    }
  }));
  visitor.statement(statement);

  if (mutationFound) throw new Error('Data-modifying CTEs are not allowed.');
  if (lockingClauseFound) throw new Error('SELECT locking clauses are not allowed.');

  validateParameters(parameterIndexes, parameters.length);
  validateRelations([...relations], policy);
  validateColumns([...columns], policy.columnDenylist);
  validateFunctions([...functions], [...DEFAULT_BLOCKED_FUNCTIONS, ...policy.blockedFunctions]);

  return {
    normalizedSql: toSql.statement(statement),
    parameterCount: parameters.length,
    relations: [...relations].sort(),
    functions: [...functions].sort()
  };
}

function validateParameters(indexes: Set<number>, suppliedCount: number): void {
  const maximum = indexes.size ? Math.max(...indexes) : 0;
  for (let index = 1; index <= maximum; index += 1) {
    if (!indexes.has(index)) throw new Error('SQL parameters must be sequential from $1.');
  }
  if (maximum !== suppliedCount) {
    throw new Error(`SQL expects ${maximum} parameter(s), but ${suppliedCount} were supplied.`);
  }
}

function validateRelations(relations: string[], policy: SqlPolicy): void {
  const allowedSchemas = new Set(policy.schemasAllowlist.map(normalize));
  for (const relation of relations) {
    const parts = relation.split('.');
    const schema = parts.length > 1 ? parts[0] : undefined;
    const table = parts.at(-1) ?? relation;
    if (schema && !allowedSchemas.has(schema)) throw new Error(`Schema is not allowlisted: ${schema}`);
    if (matchesAny(relation, policy.tableDenylist) || matchesAny(table, policy.tableDenylist)) {
      throw new Error(`Table is denied by policy: ${relation}`);
    }
    if (policy.tableAllowlist.length &&
        !matchesAny(relation, policy.tableAllowlist) &&
        !matchesAny(table, policy.tableAllowlist)) {
      throw new Error(`Table is not allowlisted: ${relation}`);
    }
  }
}

function validateColumns(columns: string[], denylist: string[]): void {
  if (!denylist.length) return;
  for (const column of columns) {
    if (column === '*' || column.endsWith('.*')) {
      throw new Error('Wildcard column selection is not allowed when column_denylist is configured.');
    }
    const columnName = column.split('.').at(-1) ?? column;
    if (matchesAny(column, denylist) || matchesAny(columnName, denylist) ||
        denylist.some(pattern => normalize(pattern).endsWith(`.${columnName}`))) {
      throw new Error(`Column is denied by policy: ${column}`);
    }
  }
}

function validateFunctions(functions: string[], blocked: string[]): void {
  for (const functionName of functions) {
    const shortName = functionName.split('.').at(-1) ?? functionName;
    if (matchesAny(functionName, blocked) || matchesAny(shortName, blocked)) {
      throw new Error(`Function is blocked by policy: ${functionName}`);
    }
  }
}

function matchesAny(value: string, patterns: string[]): boolean {
  return patterns.some(pattern => globMatches(value, pattern));
}

function globMatches(value: string, pattern: string): boolean {
  const expression = normalize(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${expression}$`, 'i').test(normalize(value));
}

function qualifiedName(schema: string | undefined, name: string): string {
  return schema ? `${normalize(schema)}.${normalize(name)}` : normalize(name);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
