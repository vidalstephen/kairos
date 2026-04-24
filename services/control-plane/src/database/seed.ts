/**
 * Seed script: inserts default tool_registry entries if they don't already exist.
 * Run via: pnpm migration:seed  (see package.json)
 */
/* eslint-disable no-console */
import 'reflect-metadata';
import { AppDataSource } from './data-source.js';

const DEFAULT_TOOLS = [
  {
    name: 'shell_exec',
    version: '1.0.0',
    tier: 'T2',
    manifest: {
      description: 'Execute a shell command in the sandboxed executor',
      params: { command: { type: 'string' }, timeout_ms: { type: 'number' } },
      capabilities: ['shell'],
      network_policy: 'none',
    },
  },
  {
    name: 'file_read',
    version: '1.0.0',
    tier: 'T0',
    manifest: {
      description: 'Read the contents of a file from the workspace',
      params: { path: { type: 'string' } },
      capabilities: ['fs:read'],
      network_policy: 'none',
    },
  },
  {
    name: 'file_write',
    version: '1.0.0',
    tier: 'T1',
    manifest: {
      description: 'Write content to a file in the workspace',
      params: { path: { type: 'string' }, content: { type: 'string' } },
      capabilities: ['fs:write'],
      network_policy: 'none',
    },
  },
  {
    name: 'file_list',
    version: '1.0.0',
    tier: 'T0',
    manifest: {
      description: 'List files in a directory',
      params: { path: { type: 'string' } },
      capabilities: ['fs:read'],
      network_policy: 'none',
    },
  },
  {
    name: 'memory_recall',
    version: '1.0.0',
    tier: 'T0',
    manifest: {
      description: 'Query the memory layer for relevant entries',
      params: { query: { type: 'string' }, scope: { type: 'string' } },
      capabilities: ['memory:read'],
      network_policy: 'none',
    },
  },
  {
    name: 'memory_store',
    version: '1.0.0',
    tier: 'T1',
    manifest: {
      description: 'Store a new entry in the memory layer',
      params: {
        content: { type: 'string' },
        scope: { type: 'string' },
        source_type: { type: 'string' },
      },
      capabilities: ['memory:write'],
      network_policy: 'none',
    },
  },
] as const;

async function seed(): Promise<void> {
  await AppDataSource.initialize();

  const repo = AppDataSource.getRepository('tool_registry');

  for (const tool of DEFAULT_TOOLS) {
    const exists = await repo.findOne({ where: { name: tool.name } });
    if (exists == null) {
      await repo.save(repo.create(tool));
      console.log(`Seeded tool: ${tool.name}`);
    } else {
      console.log(`Tool already exists, skipping: ${tool.name}`);
    }
  }

  await AppDataSource.destroy();
  console.log('Seed complete.');
}

seed().catch((err: unknown) => {
  console.error('Seed failed', err);
  process.exit(1);
});
