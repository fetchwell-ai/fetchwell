import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PortalEntry {
  id: string;
  name: string;
  url: string;
  loginForm: 'two-step' | 'single-page';
  twoFactor: 'none' | 'email' | 'manual' | 'ui';
  hasCredentials: boolean;
  discoveredAt: string | null;
  lastExtractedAt: string | null;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppConfig {
  downloadFolder: string;
  showBrowser: boolean;
  incrementalExtraction: boolean;
  theme: ThemePreference;
  portals: PortalEntry[];
}

const DEFAULT_CONFIG: AppConfig = {
  downloadFolder: path.join(os.homedir(), 'Documents', 'HealthRecords'),
  showBrowser: false,
  incrementalExtraction: true,
  theme: 'system',
  portals: [],
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class ConfigManager {
  private configPath: string;
  private config: AppConfig;

  constructor(userDataPath: string) {
    this.configPath = path.join(userDataPath, 'config.json');
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<AppConfig>;
        return { ...DEFAULT_CONFIG, ...parsed, portals: parsed.portals ?? [] };
      }
    } catch {
      // Fall through to default
    }
    return { ...DEFAULT_CONFIG, portals: [] };
  }

  save(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  getConfig(): AppConfig {
    return { ...this.config, portals: [...this.config.portals] };
  }

  getPortals(): PortalEntry[] {
    return [...this.config.portals];
  }

  getPortal(id: string): PortalEntry | undefined {
    return this.config.portals.find((p) => p.id === id);
  }

  addPortal(input: Omit<PortalEntry, 'id' | 'hasCredentials' | 'discoveredAt' | 'lastExtractedAt'>): PortalEntry {
    const id = slugify(input.name);
    if (!id) {
      throw new Error('Portal name must produce a valid slug');
    }
    if (this.config.portals.some((p) => p.id === id)) {
      throw new Error(`A portal with id "${id}" already exists`);
    }
    const entry: PortalEntry = {
      id,
      name: input.name,
      url: input.url,
      loginForm: input.loginForm,
      twoFactor: input.twoFactor,
      hasCredentials: false,
      discoveredAt: null,
      lastExtractedAt: null,
    };
    this.config.portals.push(entry);
    this.save();
    return { ...entry };
  }

  updatePortal(id: string, updates: Partial<Omit<PortalEntry, 'id'>>): PortalEntry {
    const index = this.config.portals.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Portal not found: ${id}`);
    }
    this.config.portals[index] = { ...this.config.portals[index], ...updates };
    this.save();
    return { ...this.config.portals[index] };
  }

  removePortal(id: string): void {
    const index = this.config.portals.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Portal not found: ${id}`);
    }
    this.config.portals.splice(index, 1);
    this.save();
  }

  getSettings(): Pick<AppConfig, 'downloadFolder' | 'showBrowser' | 'incrementalExtraction' | 'theme'> {
    return {
      downloadFolder: this.config.downloadFolder,
      showBrowser: this.config.showBrowser,
      incrementalExtraction: this.config.incrementalExtraction,
      theme: this.config.theme ?? 'system',
    };
  }

  updateSettings(updates: Partial<Pick<AppConfig, 'downloadFolder' | 'showBrowser' | 'incrementalExtraction' | 'theme'>>): void {
    if (updates.downloadFolder !== undefined) {
      this.config.downloadFolder = updates.downloadFolder;
    }
    if (updates.showBrowser !== undefined) {
      this.config.showBrowser = updates.showBrowser;
    }
    if (updates.incrementalExtraction !== undefined) {
      this.config.incrementalExtraction = updates.incrementalExtraction;
    }
    if (updates.theme !== undefined) {
      this.config.theme = updates.theme;
    }
    this.save();
  }
}
