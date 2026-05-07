import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CredentialsManager, SafeStorageBackend } from '../../electron/credentials';

/** Mock SafeStorageBackend: uses plain base64 encode/decode (no real encryption) */
const mockStorage: SafeStorageBackend = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s, 'utf-8'),
  decryptString: (b: Buffer) => b.toString('utf-8'),
};

/** Mock SafeStorageBackend that reports encryption unavailable */
const unavailableStorage: SafeStorageBackend = {
  isEncryptionAvailable: () => false,
  encryptString: (_s: string) => { throw new Error('encryption unavailable'); },
  decryptString: (_b: Buffer) => { throw new Error('encryption unavailable'); },
};

let tmpDir: string;
let manager: CredentialsManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-test-'));
  manager = new CredentialsManager(tmpDir, mockStorage);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CredentialsManager', () => {
  describe('API key', () => {
    it('set and get API key round-trip', () => {
      manager.setApiKey('sk-ant-test-key-12345');
      expect(manager.getApiKey()).toBe('sk-ant-test-key-12345');
    });

    it('hasApiKey() returns false when no key is set', () => {
      expect(manager.hasApiKey()).toBe(false);
    });

    it('hasApiKey() returns true after setting a key', () => {
      manager.setApiKey('sk-ant-test-key-12345');
      expect(manager.hasApiKey()).toBe(true);
    });

    it('getApiKey() returns null when no key set', () => {
      expect(manager.getApiKey()).toBeNull();
    });

    it('clearApiKey() removes the key', () => {
      manager.setApiKey('sk-ant-test-key-12345');
      manager.clearApiKey();
      expect(manager.hasApiKey()).toBe(false);
      expect(manager.getApiKey()).toBeNull();
    });
  });

  describe('portal credentials', () => {
    it('set and get portal credentials round-trip', () => {
      manager.setPortalCredentials('my-portal', { username: 'user@example.com', password: 'secret123' });
      const creds = manager.getPortalCredentials('my-portal');
      expect(creds).not.toBeNull();
      expect(creds?.username).toBe('user@example.com');
      expect(creds?.password).toBe('secret123');
    });

    it('hasPortalCredentials() returns false when none set', () => {
      expect(manager.hasPortalCredentials('my-portal')).toBe(false);
    });

    it('hasPortalCredentials() returns true after setting credentials', () => {
      manager.setPortalCredentials('my-portal', { username: 'user', password: 'pass' });
      expect(manager.hasPortalCredentials('my-portal')).toBe(true);
    });

    it('getPortalCredentials() returns null for unknown portal', () => {
      expect(manager.getPortalCredentials('ghost')).toBeNull();
    });

    it('clearPortalCredentials() removes credentials for a portal', () => {
      manager.setPortalCredentials('my-portal', { username: 'user', password: 'pass' });
      manager.clearPortalCredentials('my-portal');
      expect(manager.hasPortalCredentials('my-portal')).toBe(false);
      expect(manager.getPortalCredentials('my-portal')).toBeNull();
    });

    it('stores credentials independently per portal', () => {
      manager.setPortalCredentials('portal-a', { username: 'userA', password: 'passA' });
      manager.setPortalCredentials('portal-b', { username: 'userB', password: 'passB' });

      const credsA = manager.getPortalCredentials('portal-a');
      const credsB = manager.getPortalCredentials('portal-b');
      expect(credsA?.username).toBe('userA');
      expect(credsB?.username).toBe('userB');
    });
  });

  describe('encryption unavailable', () => {
    it('throws when setting API key with unavailable encryption', () => {
      const unavailableManager = new CredentialsManager(tmpDir, unavailableStorage);
      expect(() => unavailableManager.setApiKey('sk-ant-test')).toThrow(/keychain|secure/i);
    });

    it('throws when setting portal credentials with unavailable encryption', () => {
      const unavailableManager = new CredentialsManager(tmpDir, unavailableStorage);
      expect(() =>
        unavailableManager.setPortalCredentials('portal', { username: 'u', password: 'p' }),
      ).toThrow(/keychain|secure/i);
    });
  });
});
