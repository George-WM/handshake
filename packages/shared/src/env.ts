import { existsSync } from "node:fs";
import path from "node:path";

// Load .env from the repo root regardless of which app is running.
// Uses Node 24's built-in loader — no dotenv dependency.
const envPath = path.resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `[env] Missing required environment variable: ${name}\n` +
        `      Copy .env.example to .env and fill in ${name}.`,
    );
    process.exit(1);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}
