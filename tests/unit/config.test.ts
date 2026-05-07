import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigManager } from '../../electron/config';

describe('ConfigManager', () => {
  let tmpDir: string;
  let manager: ConfigManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    manager = new ConfigManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('addPortal', () => {
    it('adds a portal and returns it with an id', () => {
      const portal = manager.addPortal({
        name: 'My Clinic',
        url: 'https://myclinic.example.com',
        loginForm: 'two-step',
        twoFactor: 'none',
      });
      expect(portal.id).toBe('my-clinic');
      expect(portal.name).toBe('My Clinic');
      expect(portal.hasCredentials).toBe(false);
      expect(portal.discoveredAt).toBeNull();
      expect(portal.lastExtractedAt).toBeNull();
    });

    it('added portal appears in getPortals()', () => {
      manager.addPortal({ name: 'Portal A', url: 'https://a.com', loginForm: 'single-page', twoFactor: 'email' });
      const portals = manager.getPortals();
      expect(portals).toHaveLength(1);
      expect(portals[0].id).toBe('portal-a');
    });

    it('throws when a portal with the same id already exists', () => {
      manager.addPortal({ name: 'My Portal', url: 'https://a.com', loginForm: 'two-step', twoFactor: 'none' });
      expect(() =>
        manager.addPortal({ name: 'My Portal', url: 'https://b.com', loginForm: 'two-step', twoFactor: 'none' }),
      ).toThrow(/already exists/);
    });

    it('throws when name produces an empty slug', () => {
      expect(() =>
        manager.addPortal({ name: '!!!', url: 'https://a.com', loginForm: 'two-step', twoFactor: 'none' }),
      ).toThrow(/valid slug/);
    });
  });

  describe('getPortal', () => {
    it('returns the portal by id', () => {
      manager.addPortal({ name: 'Test Portal', url: 'https://test.com', loginForm: 'two-step', twoFactor: 'none' });
      const portal = manager.getPortal('test-portal');
      expect(portal).toBeDefined();
      expect(portal?.name).toBe('Test Portal');
    });

    it('returns undefined for unknown id', () => {
      expect(manager.getPortal('nonexistent')).toBeUndefined();
    });
  });

  describe('updatePortal', () => {
    it('updates portal fields', () => {
      manager.addPortal({ name: 'My Portal', url: 'https://a.com', loginForm: 'two-step', twoFactor: 'none' });
      const updated = manager.updatePortal('my-portal', { url: 'https://b.com', hasCredentials: true });
      expect(updated.url).toBe('https://b.com');
      expect(updated.hasCredentials).toBe(true);
    });

    it('throws when portal not found', () => {
      expect(() => manager.updatePortal('ghost', { url: 'https://x.com' })).toThrow(/not found/);
    });
  });

  describe('removePortal', () => {
    it('removes a portal by id', () => {
      manager.addPortal({ name: 'Remove Me', url: 'https://a.com', loginForm: 'two-step', twoFactor: 'none' });
      manager.removePortal('remove-me');
      expect(manager.getPortals()).toHaveLength(0);
    });

    it('throws when portal not found', () => {
      expect(() => manager.removePortal('ghost')).toThrow(/not found/);
    });
  });

  describe('settings', () => {
    it('returns default settings', () => {
      const settings = manager.getSettings();
      expect(settings.showBrowser).toBe(false);
      expect(settings.incrementalExtraction).toBe(true);
    });

    it('updates and returns settings round-trip', () => {
      manager.updateSettings({ showBrowser: true, incrementalExtraction: false, downloadFolder: '/tmp/records' });
      const settings = manager.getSettings();
      expect(settings.showBrowser).toBe(true);
      expect(settings.incrementalExtraction).toBe(false);
      expect(settings.downloadFolder).toBe('/tmp/records');
    });
  });

  describe('persistence', () => {
    it('persists config to disk and loads on new instance', () => {
      manager.addPortal({ name: 'Clinic One', url: 'https://clinic.com', loginForm: 'two-step', twoFactor: 'none' });
      manager.updateSettings({ showBrowser: true });

      // Create a new instance pointing to the same path
      const manager2 = new ConfigManager(tmpDir);
      const portals = manager2.getPortals();
      expect(portals).toHaveLength(1);
      expect(portals[0].name).toBe('Clinic One');
      expect(manager2.getSettings().showBrowser).toBe(true);
    });
  });
});
