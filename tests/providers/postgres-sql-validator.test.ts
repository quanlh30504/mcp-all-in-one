import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReadonlySql, type SqlPolicy } from '../../src/providers/postgres/sql-validator.js';

const policy: SqlPolicy = {
  schemasAllowlist: ['public'],
  tableAllowlist: [],
  tableDenylist: ['pg_*', 'audit.secret_events'],
  columnDenylist: ['users.password_hash'],
  blockedFunctions: [],
  maxQueryLength: 50000
};

test('accepts one parameterized SELECT and reports relations', () => {
  const result = validateReadonlySql(
    'SELECT id, email FROM public.users WHERE id = $1',
    [42],
    policy
  );
  assert.equal(result.parameterCount, 1);
  assert.deepEqual(result.relations, ['public.users']);
  assert.match(result.normalizedSql, /^SELECT/i);
});

test('accepts read-only CTEs but rejects data-modifying CTEs', () => {
  assert.doesNotThrow(() => validateReadonlySql(
    'WITH active AS (SELECT id FROM public.users) SELECT id FROM active', [], policy
  ));
  assert.throws(() => validateReadonlySql(
    'WITH removed AS (DELETE FROM public.users RETURNING id) SELECT id FROM removed', [], policy
  ), /modifying CTE/i);
});

test('rejects write, multiple statements and locking SELECT', () => {
  assert.throws(() => validateReadonlySql('UPDATE public.users SET name = $1', ['x'], policy), /SELECT\/WITH/);
  assert.throws(() => validateReadonlySql('SELECT 1; SELECT 2', [], policy), /Exactly one/);
  assert.throws(() => validateReadonlySql('SELECT id FROM public.users FOR UPDATE', [], policy), /locking clauses/);
});

test('enforces schema, table and column policy', () => {
  assert.throws(() => validateReadonlySql('SELECT id FROM private.users', [], policy), /Schema is not allowlisted/);
  assert.throws(() => validateReadonlySql('SELECT id FROM audit.secret_events', [], {
    ...policy, schemasAllowlist: ['public', 'audit']
  }), /denied by policy/);
  assert.throws(() => validateReadonlySql('SELECT password_hash FROM public.users', [], policy), /Column is denied/);
  assert.throws(() => validateReadonlySql('SELECT * FROM public.users', [], policy), /Wildcard column/);
});

test('blocks side-effect and data-exfiltration functions', () => {
  for (const sql of [
    "SELECT pg_catalog.pg_read_file('/etc/passwd')",
    "SELECT set_config('transaction_read_only', 'off', false)",
    "SELECT dblink('host=example.com', 'select 1')",
    "SELECT net.http_get('https://example.com')"
  ]) {
    assert.throws(() => validateReadonlySql(sql, [], policy), /Function is blocked/);
  }
});

test('requires exact sequential positional parameters', () => {
  assert.throws(() => validateReadonlySql('SELECT $1', [], policy), /expects 1/);
  assert.throws(() => validateReadonlySql('SELECT $2', [1, 2], policy), /sequential/);
  assert.throws(() => validateReadonlySql('SELECT 1', [1], policy), /expects 0/);
});
