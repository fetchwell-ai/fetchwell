import { execSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function globalSetup(): void {
  const root = path.join(__dirname, '..', '..');
  console.log('Building app for e2e tests...');
  execSync('vite build && tsc -p electron/tsconfig.json', {
    cwd: root,
    stdio: 'inherit',
  });
  console.log('Build complete.');
}
