import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const migDir = join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations')
const facts = readFileSync(join(migDir, '0026_gmvmax_daily_facts.sql'), 'utf8')
const outputs = readFileSync(join(migDir, '0027_gmvmax_skill_outputs.sql'), 'utf8')
const both = [facts, outputs]

test('08 migrations are additive (create if not exists; no drop table / drop column)', () => {
  for (const sql of both) {
    assert.match(sql, /create table if not exists/i)
    assert.doesNotMatch(sql, /drop\s+table/i)
    assert.doesNotMatch(sql, /alter\s+table[\s\S]*drop\s+column/i)
  }
})

test('09 RLS enabled + owner read policy (own workspace only)', () => {
  for (const sql of both) {
    assert.match(sql, /enable row level security/i)
    assert.match(sql, /owner_read[\s\S]*for select using[\s\S]*w\.user_id = auth\.uid\(\)/i)
  }
})

test('10 browser write denied (no insert/update/delete policy or grant to authenticated)', () => {
  for (const sql of both) {
    assert.doesNotMatch(sql, /for\s+(insert|update|delete)/i)
    assert.doesNotMatch(sql, /grant[^;]*(insert|update|delete)[^;]*to authenticated/i)
    assert.match(sql, /grant select on [^;]* to authenticated/i)
  }
})

test('11 anon denied (no grant to anon)', () => {
  for (const sql of both) assert.doesNotMatch(sql, /to anon/i)
})

test('12 service role manages (grant all to service_role)', () => {
  for (const sql of both) assert.match(sql, /grant all\s+on [^;]* to service_role/i)
})

test('13 workspace uniqueness in identity index', () => {
  for (const sql of both) assert.match(sql, /unique index[\s\S]*identity[\s\S]*workspace_id/i)
})

test('14 deterministic signature dedupe in identity index', () => {
  for (const sql of both) assert.match(sql, /unique index[\s\S]*deterministic_signature/i)
})

test('15 no token / secret / raw MCP payload columns', () => {
  for (const sql of both) assert.doesNotMatch(sql, /\b(access_token|refresh_token|client_secret|service_role_key|raw_mcp|raw_payload)\b/i)
})

test('15b skill_outputs enforces execution_allowed=false via CHECK', () => {
  assert.match(outputs, /check\s*\(\s*coalesce\(\(payload->>'execution_allowed'\)::boolean, false\) = false\)/i)
})

test('11b skill_outputs has scope_type/status/severity/confidence CHECKs', () => {
  assert.match(outputs, /scope_type_chk check \(scope_type in/i)
  assert.match(outputs, /status_chk check \(status in/i)
  assert.match(outputs, /severity_chk\s+check \(severity in/i)
  assert.match(outputs, /confidence_chk check \(confidence in/i)
})

test('11c store_id application-level invariant documented (no stores FK)', () => {
  for (const sql of both) assert.match(sql, /STORE_ID INVARIANT/i)
})

test('11d no execution-state column; only reviewed/dismissed/snoozed', () => {
  assert.doesNotMatch(outputs, /\bexecuted_at\b|\bexecution_state\b|\bapplied_at\b/i)
  for (const c of ['reviewed_at', 'dismissed_at', 'snoozed_until']) assert.match(outputs, new RegExp(c))
})
