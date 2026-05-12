import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigManager } from '../../electron/config';
import { CredentialsManager, SafeStorageBackend } from '../../electron/credentials';

// ---------------------------------------------------------------------------
// XOR round-trip logic (mirrors the encode-key script and bundled-key module)
// ---------------------------------------------------------------------------

function xorEncode(plaintext: string, mask: number[]): number[] {
  const keyBytes = Array.from(Buffer.from(plaintext, 'utf8'));
  return keyBytes.map((b, i) => b ^ mask[i % mask.length]);
}

function xorDecode(data: number[], mask: number[]): string {
  const bytes = data.map((b, i) => b ^ mask[i % mask.length]);
  return Buffer.from(bytes).toString('utf8');
}

describe('XOR encoding round-trip', () => {
  it('encodes and decodes a short key correctly', () => {
    const key = 'sk-ant-test-key-abcdef';
    const mask = [0x5a, 0x3f, 0xc1, 0x72, 0x88];
    const encoded = xorEncode(key, mask);
    expect(xorDecode(encoded, mask)).toBe(key);
  });

  it('encodes and decodes a long key with a short mask (cycling)', () => {
    const key = 'sk-ant-api03-' + 'x'.repeat(80);
    const mask = Array.from({ length: 32 }, (_, i) => (i * 7 + 13) % 256);
    const encoded = xorEncode(key, mask);
    expect(xorDecode(encoded, mask)).toBe(key);
  });

  it('encoding is deterministic for same inputs', () => {
    const key = 'sk-ant-deterministic';
    const mask = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = xorEncode(key, mask);
    const b = xorEncode(key, mask);
    expect(a).toEqual(b);
  });

  it('different masks produce different encoded data', () => {
    const key = 'sk-ant-same-key';
    const mask1 = [0x10, 0x20, 0x30];
    const mask2 = [0x11, 0x22, 0x33];
    const encoded1 = xorEncode(key, mask1);
    const encoded2 = xorEncode(key, mask2);
    // The encoded data should differ
    expect(encoded1).not.toEqual(encoded2);
    // But both decode back to the same key
    expect(xorDecode(encoded1, mask1)).toBe(key);
    expect(xorDecode(encoded2, mask2)).toBe(key);
  });

  it('handles unicode characters in the key correctly', () => {
    const key = 'sk-ant-üñícode';
    const mask = [0xab, 0xcd, 0xef];
    const encoded = xorEncode(key, mask);
    expect(xorDecode(encoded, mask)).toBe(key);
  });
});

// ---------------------------------------------------------------------------
// ConfigManager: apiKeySource default and round-trip
// ---------------------------------------------------------------------------

describe('ConfigManager — apiKeySource', () => {
  let tmpDir: string;
  let manager: ConfigManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundled-key-test-'));
    manager = new ConfigManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns apiKeySource: "bundled" by default', () => {
    const settings = manager.getSettings();
    expect(settings.apiKeySource).toBe('bundled');
  });

  it('can update apiKeySource to "custom"', () => {
    manager.updateSettings({ apiKeySource: 'custom' });
    const settings = manager.getSettings();
    expect(settings.apiKeySource).toBe('custom');
  });

  it('persists apiKeySource through disk round-trip', () => {
    manager.updateSettings({ apiKeySource: 'custom' });
    const manager2 = new ConfigManager(tmpDir);
    expect(manager2.getSettings().apiKeySource).toBe('custom');
  });

  it('defaults to "bundled" when loading old config without apiKeySource field', () => {
    // Write a config file that simulates an older saved config without the field
    const configPath = path.join(tmpDir, 'config.json');
    const oldConfig = {
      downloadFolder: '/tmp/records',
      showBrowser: false,
      incrementalExtraction: true,
      theme: 'system',
      portals: [],
    };
    fs.writeFileSync(configPath, JSON.stringify(oldConfig), 'utf-8');

    const manager2 = new ConfigManager(tmpDir);
    expect(manager2.getSettings().apiKeySource).toBe('bundled');
  });
});

// ---------------------------------------------------------------------------
// apiKeyConfigured logic (simulated — mirrors ipc-handlers.ts getSettings)
// ---------------------------------------------------------------------------

const mockStorage: SafeStorageBackend = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s, 'utf-8'),
  decryptString: (b: Buffer) => b.toString('utf-8'),
};

/**
 * Simulate the apiKeyConfigured logic from ipc-handlers.ts getSettings:
 * - bundled: true if hasBundledApiKey() would return true
 * - custom: true only if a custom key is stored
 *
 * Since getBundledApiKey() uses a module-level require that loads the
 * generated file (which doesn't exist in tests), we test the conditional
 * logic using a helper that accepts the source and hasCustomKey flag.
 */
function resolveApiKeyConfigured(
  apiKeySource: 'bundled' | 'custom',
  hasBundled: boolean,
  hasCustom: boolean,
): boolean {
  return apiKeySource === 'bundled' ? hasBundled : hasCustom;
}

describe('apiKeyConfigured resolution logic', () => {
  it('returns true when apiKeySource is "bundled" and bundled key is present', () => {
    expect(resolveApiKeyConfigured('bundled', true, false)).toBe(true);
  });

  it('returns true when apiKeySource is "bundled" even if custom key is also stored', () => {
    expect(resolveApiKeyConfigured('bundled', true, true)).toBe(true);
  });

  it('returns false when apiKeySource is "bundled" but no bundled key available', () => {
    expect(resolveApiKeyConfigured('bundled', false, false)).toBe(false);
  });

  it('returns true when apiKeySource is "custom" and a custom key is stored', () => {
    expect(resolveApiKeyConfigured('custom', false, true)).toBe(true);
  });

  it('returns false when apiKeySource is "custom" and no custom key is stored', () => {
    expect(resolveApiKeyConfigured('custom', false, false)).toBe(false);
  });

  it('returns false when apiKeySource is "custom" without a stored key (bundled key irrelevant)', () => {
    // Even if bundled key is available, custom mode requires a custom key
    expect(resolveApiKeyConfigured('custom', true, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: ConfigManager + CredentialsManager for custom key check
// ---------------------------------------------------------------------------

describe('apiKeySource "custom" with CredentialsManager', () => {
  let tmpDir: string;
  let configManager: ConfigManager;
  let credManager: CredentialsManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundled-key-creds-test-'));
    configManager = new ConfigManager(tmpDir);
    credManager = new CredentialsManager(tmpDir, mockStorage);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getSettings returns apiKeySource "bundled" by default', () => {
    const settings = configManager.getSettings();
    expect(settings.apiKeySource).toBe('bundled');
  });

  it('switching to "custom" without a stored key means apiKeyConfigured would be false', () => {
    configManager.updateSettings({ apiKeySource: 'custom' });
    const settings = configManager.getSettings();
    expect(settings.apiKeySource).toBe('custom');
    // No custom key set
    expect(credManager.hasApiKey()).toBe(false);
    // So apiKeyConfigured should be false
    const apiKeyConfigured = resolveApiKeyConfigured('custom', false, credManager.hasApiKey());
    expect(apiKeyConfigured).toBe(false);
  });

  it('switching to "custom" with a stored key means apiKeyConfigured would be true', () => {
    configManager.updateSettings({ apiKeySource: 'custom' });
    credManager.setApiKey('sk-ant-test-key-12345');
    const settings = configManager.getSettings();
    expect(settings.apiKeySource).toBe('custom');
    const apiKeyConfigured = resolveApiKeyConfigured('custom', false, credManager.hasApiKey());
    expect(apiKeyConfigured).toBe(true);
  });
});
