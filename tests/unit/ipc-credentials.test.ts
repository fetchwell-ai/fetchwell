/**
 * Tests for IPC credential security changes:
 * - getPortalCredentials returns { username, hasPassword } — no plaintext password
 * - updatePortal username-only path re-uses existing password
 *
 * We test the logic at the CredentialsManager level since the IPC layer
 * wraps these calls directly and cannot be easily unit-tested without
 * a running Electron app.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CredentialsManager, SafeStorageBackend } from '../../electron/credentials';

const mockStorage: SafeStorageBackend = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s, 'utf-8'),
  decryptString: (b: Buffer) => b.toString('utf-8'),
};

let tmpDir: string;
let manager: CredentialsManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-creds-test-'));
  manager = new CredentialsManager(tmpDir, mockStorage);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getPortalCredentials masking (IPC logic)', () => {
  it('maps credentials to { username, hasPassword: true } when password is set', () => {
    manager.setPortalCredentials('portal-1', { username: 'user@example.com', password: 'secret123' });

    // Simulate what the IPC handler does: fetch creds and mask the password
    const portalCreds = manager.getPortalCredentials('portal-1');
    expect(portalCreds).not.toBeNull();
    const masked = portalCreds
      ? { username: portalCreds.username, hasPassword: portalCreds.password.length > 0 }
      : null;

    expect(masked).toEqual({ username: 'user@example.com', hasPassword: true });
    // Confirm the plaintext password is NOT present in the masked result
    expect(masked).not.toHaveProperty('password');
  });

  it('maps credentials to { username, hasPassword: false } when password is empty string', () => {
    manager.setPortalCredentials('portal-1', { username: 'user@example.com', password: '' });

    const portalCreds = manager.getPortalCredentials('portal-1');
    expect(portalCreds).not.toBeNull();
    const masked = portalCreds
      ? { username: portalCreds.username, hasPassword: portalCreds.password.length > 0 }
      : null;

    expect(masked).toEqual({ username: 'user@example.com', hasPassword: false });
  });

  it('returns null when no credentials are stored', () => {
    const portalCreds = manager.getPortalCredentials('ghost-portal');
    expect(portalCreds).toBeNull();
  });
});

describe('updatePortal username-only path (IPC logic)', () => {
  it('re-uses existing password when only username is updated', () => {
    manager.setPortalCredentials('portal-1', { username: 'olduser@example.com', password: 'existing-secret' });

    // Simulate the username-only update path in the IPC handler
    const newUsername = 'newuser@example.com';
    const existing = manager.getPortalCredentials('portal-1');
    if (existing) {
      manager.setPortalCredentials('portal-1', {
        username: newUsername,
        password: existing.password,
      });
    }

    const updated = manager.getPortalCredentials('portal-1');
    expect(updated).not.toBeNull();
    expect(updated?.username).toBe('newuser@example.com');
    // Password is preserved
    expect(updated?.password).toBe('existing-secret');
  });

  it('does not update credentials when username-only path finds no existing credentials', () => {
    // No existing creds — the handler skips the update
    const existing = manager.getPortalCredentials('new-portal');
    expect(existing).toBeNull();
    // Handler skips setPortalCredentials when existing is null
    expect(manager.hasPortalCredentials('new-portal')).toBe(false);
  });

  it('replaces both username and password when both are provided', () => {
    manager.setPortalCredentials('portal-1', { username: 'olduser', password: 'oldpass' });

    manager.setPortalCredentials('portal-1', { username: 'newuser', password: 'newpass' });

    const updated = manager.getPortalCredentials('portal-1');
    expect(updated?.username).toBe('newuser');
    expect(updated?.password).toBe('newpass');
  });
});
