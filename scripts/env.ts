/**
 * .env.local 파일을 읽어 환경 변수로 넣습니다.
 * (GitHub Actions와 Vercel에서는 이미 환경 변수가 들어 있으므로 아무 일도 하지 않습니다)
 */
import fs from 'node:fs';

export function loadEnvFile(path = '.env.local'): void {
  if (!fs.existsSync(path)) return;
  const raw = fs.readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // 이미 설정된 환경 변수는 덮어쓰지 않습니다.
    if (!process.env[key]) process.env[key] = value;
  }
}
