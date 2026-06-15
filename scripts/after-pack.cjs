/**
 * electron-builder afterPack hook.
 *
 * electron-builder's dependency walker misses transitive dependencies
 * when using pnpm. After packaging, we run `npm install --omit=dev`
 * inside the packaged app to get a complete, flat node_modules with
 * all production dependencies properly resolved.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  const appResourcesDir = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents', 'Resources', 'app'
  );

  // Verify the app directory exists
  if (!fs.existsSync(path.join(appResourcesDir, 'package.json'))) {
    console.log('  • afterPack: skipping — no package.json found at', appResourcesDir);
    return;
  }

  // Remove electron-builder's incomplete node_modules
  const nodeModulesDir = path.join(appResourcesDir, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) {
    fs.rmSync(nodeModulesDir, { recursive: true });
  }

  // Install production deps with npm ci (respects lockfile for reproducible builds)
  console.log('  • installing production dependencies via npm ci...');
  execSync('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', {
    cwd: appResourcesDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });

  // Count what we got
  const pkgCount = fs.readdirSync(nodeModulesDir).filter(f => !f.startsWith('.')).length;
  console.log(`  • installed ${pkgCount} production packages`);
};
