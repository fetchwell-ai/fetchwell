import * as fs from 'fs';
import * as path from 'path';

export interface PortalCredentials {
  username: string;
  password: string;
}

/** Raw on-disk format: encrypted values stored as base64 strings */
interface CredentialsFileFormat {
  apiKey?: string;
  portals: Record<string, { username: string; password: string }>;
}

/**
 * Interface for the encryption/decryption backend.
 * In production this is Electron's safeStorage; in tests it can be a no-op stub.
 */
export interface SafeStorageBackend {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class CredentialsManager {
  private credentialsPath: string;
  private storage: SafeStorageBackend;

  constructor(userDataPath: string, storage: SafeStorageBackend) {
    this.credentialsPath = path.join(userDataPath, 'credentials.enc.json');
    this.storage = storage;
  }

  private readFile(): CredentialsFileFormat {
    try {
      if (fs.existsSync(this.credentialsPath)) {
        const raw = fs.readFileSync(this.credentialsPath, 'utf-8');
        return JSON.parse(raw) as CredentialsFileFormat;
      }
    } catch {
      // Fall through to empty store
    }
    return { portals: {} };
  }

  private writeFile(data: CredentialsFileFormat): void {
    const dir = path.dirname(this.credentialsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.credentialsPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private encrypt(value: string): string {
    if (!this.storage.isEncryptionAvailable()) {
      throw new Error('System keychain is not available — cannot store credentials securely');
    }
    const buf = this.storage.encryptString(value);
    return buf.toString('base64');
  }

  private decrypt(base64: string): string {
    const buf = Buffer.from(base64, 'base64');
    return this.storage.decryptString(buf);
  }

  // --- API key ---

  setApiKey(apiKey: string): void {
    const data = this.readFile();
    data.apiKey = this.encrypt(apiKey);
    this.writeFile(data);
  }

  getApiKey(): string | null {
    const data = this.readFile();
    if (!data.apiKey) return null;
    try {
      return this.decrypt(data.apiKey);
    } catch {
      return null;
    }
  }

  hasApiKey(): boolean {
    const data = this.readFile();
    return !!data.apiKey;
  }

  clearApiKey(): void {
    const data = this.readFile();
    delete data.apiKey;
    this.writeFile(data);
  }

  // --- Portal credentials ---

  setPortalCredentials(portalId: string, credentials: PortalCredentials): void {
    const data = this.readFile();
    data.portals[portalId] = {
      username: this.encrypt(credentials.username),
      password: this.encrypt(credentials.password),
    };
    this.writeFile(data);
  }

  getPortalCredentials(portalId: string): PortalCredentials | null {
    const data = this.readFile();
    const entry = data.portals[portalId];
    if (!entry) return null;
    try {
      return {
        username: this.decrypt(entry.username),
        password: this.decrypt(entry.password),
      };
    } catch {
      return null;
    }
  }

  hasPortalCredentials(portalId: string): boolean {
    const data = this.readFile();
    return !!data.portals[portalId];
  }

  clearPortalCredentials(portalId: string): void {
    const data = this.readFile();
    delete data.portals[portalId];
    this.writeFile(data);
  }
}

/**
 * Validate an Anthropic API key by format.
 * A real API call would require importing the Anthropic SDK — we avoid that for now.
 */
export function validateApiKeyFormat(key: string): boolean {
  return typeof key === 'string' && key.trim().startsWith('sk-ant-') && key.trim().length > 10;
}
