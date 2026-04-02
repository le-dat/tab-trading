import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load .env with ${VAR} variable interpolation support.
 * Variables are resolved in order — later vars can reference earlier ones.
 */
function loadEnvWithInterpolation(envPath: string) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex);
    let value = trimmed.slice(eqIndex + 1);

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Expand ${VAR} references using already-set process.env
    value = value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] ?? '';
    });

    process.env[key] = value;
  }
}

loadEnvWithInterpolation(path.join(process.cwd(), '.env'));

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5434/${process.env.POSTGRES_DB}`,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: true,
});
