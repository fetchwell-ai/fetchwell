import { contextBridge } from 'electron';

const notImplemented = async (): Promise<never> => {
  throw new Error('Not implemented');
};

contextBridge.exposeInMainWorld('electronAPI', {
  getPortals: notImplemented,
  addPortal: notImplemented,
  updatePortal: notImplemented,
  removePortal: notImplemented,
  getSettings: notImplemented,
  updateSettings: notImplemented,
  validateApiKey: notImplemented,
  runDiscovery: notImplemented,
  runExtraction: notImplemented,
  onProgress: notImplemented,
  on2FARequest: notImplemented,
  submit2FACode: notImplemented,
  chooseFolder: notImplemented,
});
