/**
 * UI strings for the FetchWell app.
 * Edit this file to change any user-facing text.
 */

export const strings = {
  // ── Brand ────────────────────────────────────────────────────────────────
  brand: {
    name: 'fetchwell',
    version: 'v0.1.0',
    buildVersion: 'fetchwell 0.1.0 \u00B7 build 2026.05.08',
    badge: 'local-only',
    tagline: 'An app that uses an AI assistant to fetch your medical records from all your patient portals and store them locally on your computer.',
  },

  // ── Sidebar ──────────────────────────────────────────────────────────────
  sidebar: {
    portalsLabel: 'Portals',
    settingsLabel: 'Settings',
    noPortals: 'No portals yet',
    addPortal: 'Add portal',
    settings: {
      appearance: 'Appearance',
      apiKey: 'Anthropic API key',
      browser: 'Browser',
      storage: 'Storage location',
      privacy: 'Privacy & data',
      about: 'About Fetchwell',
    },
  },

  // ── Get Started (empty state — no portals) ────────────────────────────────
  getStarted: {
    label: 'Get started',
    title: 'Add your first health portal',
    description: 'Click here to configure your first health portal and start downloading your data.',
  },

  // ── Add Portal form ───────────────────────────────────────────────────────
  addPortal: {
    twoFactorNote: 'If your portal requires two-factor authentication, we\u2019ll prompt you to enter the code during sign-in.',
  },

  // ── Settings pages ───────────────────────────────────────────────────────
  settings: {
    appearance: {
      title: 'Appearance',
      lede: 'Match your system, or pick a side.',
      system: 'System',
      light: 'Light',
      dark: 'Dark',
      hint: 'System follows your macOS appearance.',
    },

    apiKey: {
      title: 'Anthropic API key',
      lede: 'Fetchwell gets your medical records by having an AI assistant log into your portal and download your records as PDFs. Anthropic\'s Claude is the AI assistant and Fetchwell uses a secure API Key to communicate with it. You can use Fetchwell with our key, or use your own if you prefer.',
      sourceBundled: "Fetchwell's key",
      sourceCustom: 'Your own key',
      bundledConfirmation: 'Included \u2014 no setup required, but may come with usage limits.',
      configured: 'API key configured',
      mask: '*****************',
      labelNew: 'New API key',
      labelDefault: 'API key',
      placeholder: 'sk-ant-...',
      hint: 'Starts with sk-ant-. Get one at',
      hintDomain: 'console.anthropic.com',
      buttonChange: 'Change',
      buttonSave: 'Save',
      buttonSaved: 'Saved',
      buttonGetKey: 'Get a key',
      buttonCancel: 'Cancel',
      buttonValidating: 'Validating...',
      errorRequired: 'API key is required',
      errorInvalid: 'Invalid API key format. Make sure it starts with sk-ant-',
      errorSaving: 'An error occurred while saving. Try again.',
    },

    browser: {
      title: 'Browser',
      lede: 'You can watch the AI assistant as it navigates your portal. Be careful not to interact with the browser while Fetchwell is running, as that may interfere with the assistant\'s operation.',
      showBrowserLabel: 'Show browser window',
      showBrowserDescription: 'Display the browser window during record fetching.',
    },

    storage: {
      title: 'Storage location',
      lede: 'Fetchwell downloads PDF files and stores them on your computer in this location.',
      noFolder: 'No folder selected',
      buttonChoose: 'Choose...',
      saved: 'Saved',
      hint: 'Each portal gets its own subfolder.',
    },

    privacy: {
      title: 'Privacy & data',
      lede: 'What happens to your health data.',
      body: "Fetchwell never sees your data. We don't have servers, we don't have a cloud. Your data is downloaded directly to your computer as PDFs. Your passwords are stored locally and encrypted by Electron using base64-encoded ciphertext. Your data is fetched by Claude, an AI assistant built by Anthropic that runs in their cloud and uses a web browser to navigate your health portal. That assistant will 'see' your health data when it processes your requests. Fetchwell is not affiliated with Anthropic.",
    },

    about: {
      title: 'About Fetchwell',
      lede: 'Fetchwell is source-available software distributed under the PolyForm Noncommercial License. The code repository is available at https://github.com/fetchwell-ai/fetchwell.',
    },
  },
} as const;
