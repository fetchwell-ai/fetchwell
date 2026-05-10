/** App — top-level. Combines A (sidebar settings), B (QuickStart), C (inline guidance). */
const { useState } = React;

const PORTALS = [
  {
    id: "ucsf", name: "UCSF Medical Center", url: "mychart.ucsfmedicalcenter.org",
    state: "fetched", lastFetched: "May 7", mappedAt: "Apr 24",
    statusColor: "var(--fw-moss-600)",
    recordCounts: {labs: 12, visits: 8, medications: 5, messages: 3, total: 28},
  },
  {
    id: "stanford", name: "Stanford Health Care", url: "mychart.stanfordhealthcare.org",
    state: "mapped", mappedAt: "May 8",
    statusColor: "var(--fw-sage-700)",
  },
  {
    id: "kaiser", name: "Kaiser Permanente", url: "kp.org",
    state: "new",
    statusColor: "var(--fw-ink-300)",
  },
];

const App = () => {
  const [activeId, setActiveId] = useState(null);                  // null = "All portals" overview
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [settingsActive, setSettingsActive] = useState(null);
  const [qsDismissed, setQsDismissed] = useState(false);

  const onSelectPortal = (id) => { setSettingsActive(null); setActiveId(id); };
  const onSelectSettings = (k) => { setActiveId(null); setSettingsActive(k); };

  const anyPortal = PORTALS.length > 0;
  const anyMapped = PORTALS.some(p => p.state === "mapped" || p.state === "fetched");
  const anyFetched = PORTALS.some(p => p.state === "fetched");
  const apiKeyOk = true;

  const steps = [
    {k: "api",   label: "Add your Anthropic API key",   done: apiKeyOk,  meta: apiKeyOk ? "Validated" : null},
    {k: "add",   label: "Add a patient portal",         done: anyPortal, meta: anyPortal ? `${PORTALS.length} added` : null, current: !anyPortal},
    {k: "map",   label: "Map records on each portal",   done: anyFetched, current: anyPortal && !anyFetched, meta: anyMapped && !anyFetched ? "Try Stanford →" : null},
    {k: "fetch", label: "Run your first extraction",    done: anyFetched, current: false, meta: anyFetched ? "May 7" : null},
  ];

  const activePortal = PORTALS.find(p => p.id === activeId);

  return (
    <div className="fw-app">
      <Sidebar
        portals={PORTALS}
        activeId={activeId}
        onSelect={onSelectPortal}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        settingsActive={settingsActive}
        onSettingsSelect={onSelectSettings}
      />
      <main className="fw-content">
        {settingsActive
          ? <SettingsPane k={settingsActive}/>
          : activePortal
            ? <PortalDetailPane portal={activePortal} onBack={() => setActiveId(null)}/>
            : <PortalsPane portals={PORTALS} qs={steps} qsDismissed={qsDismissed} setQsDismissed={setQsDismissed} onOpen={onSelectPortal}/>}
      </main>
    </div>
  );
};

const PortalsPane = ({ portals, qs, qsDismissed, setQsDismissed, onOpen }) => (
  <div className="fw-page">
    <div className="fw-page-head">
      <div>
        <h1>Your portals</h1>
        <p className="lede">Records stay on this Mac. Fetchwell only sends anonymized navigation requests to Anthropic.</p>
      </div>
      <div className="actions">
        <button className="fw-btn primary"><Icon name="plus" size={14}/> Add portal</button>
      </div>
    </div>

    {!qsDismissed && (
      <QuickStart
        steps={qs}
        onStepClick={() => {}}
        onDismiss={() => setQsDismissed(true)}
        collapsed={false}
      />
    )}

    <div style={{display: "flex", flexDirection: "column", gap: 16}}>
      {portals.map(p => <div key={p.id} onClick={() => onOpen(p.id)} style={{cursor: "default"}}><PortalCard portal={p}/></div>)}
    </div>
  </div>
);

/** Per-portal detail view — header, record breakdown, history, danger zone. */
const PortalDetailPane = ({ portal, onBack }) => {
  const { name, url, state, lastFetched, mappedAt, recordCounts } = portal;
  const counts = recordCounts || {labs: 0, visits: 0, medications: 0, messages: 0, total: 0};

  // Mock history — in a real app this comes from the extraction log.
  const history = state === "fetched" ? [
    {when: "May 7, 2026 · 12:04",  what: "Incremental fetch", added: 3, status: "ok"},
    {when: "Apr 30, 2026 · 09:18", what: "Incremental fetch", added: 1, status: "ok"},
    {when: "Apr 24, 2026 · 15:42", what: "First extraction",  added: 24, status: "ok"},
    {when: "Apr 24, 2026 · 15:38", what: "Mapping completed", added: null, status: "ok"},
  ] : state === "mapped" ? [
    {when: `${mappedAt}, 2026 · 10:22`, what: "Mapping completed", added: null, status: "ok"},
  ] : [];

  return (
    <div className="fw-page fw-portal-detail">
      {/* Breadcrumb */}
      <button className="fw-crumb" onClick={onBack}>
        <Icon name="arrow-right" size={14} style={{transform: "rotate(180deg)"}}/>
        <span>All portals</span>
      </button>

      {/* Header */}
      <div className="fw-page-head" style={{alignItems: "center"}}>
        <div>
          <h1 style={{marginBottom: 6}}>{name}</h1>
          <div className="fw-portal-detail-meta">
            <span className="m-url">{url}</span>
            <span className="dot-sep">·</span>
            {state === "fetched" && <><span>Last fetched <strong>{lastFetched}</strong></span><span className="dot-sep">·</span></>}
            {(state === "fetched" || state === "mapped") && <span>Mapped <strong>{mappedAt}</strong></span>}
            {state === "new" && <span style={{color: "var(--fw-fg-muted)"}}>Not mapped yet</span>}
          </div>
        </div>
        <div className="actions">
          {state === "new" && <button className="fw-btn primary"><Icon name="compass" size={14}/> Map portal</button>}
          {state === "mapped" && <button className="fw-btn primary"><Icon name="download" size={14}/> Fetch records</button>}
          {state === "fetched" && <>
            <button className="fw-btn secondary"><Icon name="compass" size={14}/> Re-map</button>
            <button className="fw-btn primary"><Icon name="download" size={14}/> Fetch again</button>
          </>}
        </div>
      </div>

      {/* Record breakdown */}
      {state === "fetched" && (
        <section className="fw-detail-section">
          <h2>Records</h2>
          <div className="fw-record-grid">
            {[
              {k: "labs",        label: "Lab results",   icon: "activity", count: counts.labs,        color: "moss"},
              {k: "visits",      label: "Visit notes",   icon: "file",     count: counts.visits,      color: "sage"},
              {k: "medications", label: "Medications",   icon: "key",      count: counts.medications, color: "ochre"},
              {k: "messages",    label: "Messages",      icon: "info",     count: counts.messages,    color: "ink"},
            ].map(r => (
              <div key={r.k} className={"fw-record-tile is-" + r.color}>
                <div className="ico"><Icon name={r.icon} size={18}/></div>
                <div className="count">{r.count}</div>
                <div className="lbl">{r.label}</div>
              </div>
            ))}
          </div>
          <div className="fw-folder-row">
            <Icon name="folder" size={14}/>
            <span style={{fontFamily: "var(--fw-font-mono)"}}>~/Documents/HealthRecords/{portal.id}</span>
            <button className="fw-btn ghost sm">Reveal in Finder</button>
          </div>
        </section>
      )}

      {/* Empty state for new portal */}
      {state === "new" && (
        <section className="fw-detail-section">
          <div className="fw-card" style={{padding: "32px 28px"}}>
            <div style={{display: "flex", gap: 16, alignItems: "flex-start"}}>
              <div style={{flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: "var(--fw-sage-100)", color: "var(--fw-sage-700)", display: "flex", alignItems: "center", justifyContent: "center"}}>
                <Icon name="compass" size={20}/>
              </div>
              <div style={{flex: 1}}>
                <h3 style={{margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: "var(--fw-ink-900)"}}>Map this portal first</h3>
                <p style={{margin: "0 0 14px", fontSize: 14, lineHeight: "22px", color: "var(--fw-ink-700)"}}>
                  Mapping is a one-time walk-through. Fetchwell opens {name} in a window — you sign in, then click through the labs, visits, medications, and messages sections. Fetchwell remembers the navigation so future extractions are automatic.
                </p>
                <button className="fw-btn primary"><Icon name="compass" size={14}/> Start mapping</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Mapped, ready */}
      {state === "mapped" && (
        <section className="fw-detail-section">
          <div className="fw-card guidance-success">
            <div style={{display: "flex", gap: 12, alignItems: "flex-start"}}>
              <Icon name="check" size={18} style={{color: "var(--fw-moss-600)", marginTop: 2, flexShrink: 0}}/>
              <div>
                <h3 style={{margin: "0 0 6px", fontSize: 15, fontWeight: 600}}>Mapped and ready to fetch</h3>
                <p style={{margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--fw-ink-700)"}}>
                  Click <em>Fetch records</em> to run the first extraction. It usually takes 30–90 seconds depending on how many records the portal has.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="fw-detail-section">
          <h2>History</h2>
          <ul className="fw-history">
            {history.map((h, i) => (
              <li key={i} className="fw-history-row">
                <span className={"hdot ok"}></span>
                <div className="hbody">
                  <div className="what">{h.what}{h.added ? <span className="added"> · +{h.added} new</span> : null}</div>
                  <div className="when">{h.when}</div>
                </div>
                <button className="fw-btn ghost sm">View log</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Schedule (mapped or fetched) */}
      {(state === "mapped" || state === "fetched") && (
        <section className="fw-detail-section">
          <h2>Schedule</h2>
          <div className="fw-card" style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16}}>
            <div>
              <div style={{fontSize: 14, fontWeight: 500, color: "var(--fw-ink-900)", marginBottom: 2}}>Auto-fetch every week</div>
              <div style={{fontSize: 13, color: "var(--fw-fg-muted)"}}>Next run: Friday, May 14 · 09:00</div>
            </div>
            <div className="fw-toggle on" aria-checked="true" role="switch"><span className="thumb"/></div>
          </div>
        </section>
      )}

      {/* Credentials & danger zone */}
      <section className="fw-detail-section">
        <h2>Credentials</h2>
        <div className="fw-card">
          <div className="fw-field" style={{marginBottom: 12}}>
            <label className="lbl">Username</label>
            <input className="fw-input" defaultValue="patient@example.com"/>
          </div>
          <div className="fw-field" style={{marginBottom: 14}}>
            <label className="lbl">Password</label>
            <input className="fw-input" type="password" defaultValue="••••••••••••"/>
            <span className="help">Stored in macOS Keychain — never sent to Anthropic.</span>
          </div>
          <button className="fw-btn secondary sm">Update credentials</button>
        </div>
      </section>

      <section className="fw-detail-section">
        <h2 style={{color: "var(--fw-crimson-600)"}}>Danger zone</h2>
        <div className="fw-card" style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, borderColor: "#E0B8B7"}}>
          <div>
            <div style={{fontSize: 14, fontWeight: 500, color: "var(--fw-ink-900)", marginBottom: 2}}>Remove this portal</div>
            <div style={{fontSize: 13, color: "var(--fw-fg-muted)"}}>Stops auto-fetch and forgets the mapping. Downloaded files stay on disk.</div>
          </div>
          <button className="fw-btn danger sm">Remove portal</button>
        </div>
      </section>
    </div>
  );
};

const SETTINGS_COPY = {
  appearance: {title: "Appearance",        desc: "Match your system, or pick a side."},
  key:        {title: "Anthropic API key", desc: "Used to power navigation. Billed against your own account."},
  storage:    {title: "Storage location",  desc: "Where downloaded PDFs are saved on this Mac."},
  privacy:    {title: "Privacy & data",    desc: "What leaves your machine, and what stays."},
  about:      {title: "About Fetchwell",   desc: "Version, licenses, acknowledgements."},
};

const applyTheme = (mode) => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", dark);
};

const SettingsPane = ({ k }) => {
  const meta = SETTINGS_COPY[k] || SETTINGS_COPY.appearance;
  const [theme, setTheme] = React.useState(() => localStorage.getItem("fw-theme") || "system");
  React.useEffect(() => { applyTheme(theme); localStorage.setItem("fw-theme", theme); }, [theme]);
  return (
    <div className="fw-page fw-settings-page">
      <div className="fw-page-head">
        <div>
          <h1>{meta.title}</h1>
          <p className="lede">{meta.desc}</p>
        </div>
      </div>
      <div className="fw-card" style={{maxWidth: 560}}>
        {k === "appearance" && (
          <div className="col">
            <div className="fw-seg">
              {[
                {v: "system", label: "System", ico: "monitor"},
                {v: "light",  label: "Light",  ico: "sun"},
                {v: "dark",   label: "Dark",   ico: "moon"},
              ].map(o => (
                <button key={o.v}
                  className={"fw-seg-btn" + (theme === o.v ? " is-active" : "")}
                  onClick={() => setTheme(o.v)}>
                  <Icon name={o.ico} size={14}/> {o.label}
                </button>
              ))}
            </div>
            <span className="help">System follows your macOS appearance.</span>
          </div>
        )}
        {k === "key" && (
          <div className="col">
            <div className="fw-field">
              <label className="lbl">Key</label>
              <input className="fw-input" defaultValue="sk-ant-•••••••••••••••••••••"/>
              <span className="help">Validated · billed to your Anthropic account.</span>
            </div>
            <div className="row"><button className="fw-btn primary sm">Save</button><button className="fw-btn ghost sm">Get a key →</button></div>
          </div>
        )}
        {k === "storage" && (
          <div className="col">
            <div className="fw-field">
              <label className="lbl">Folder</label>
              <input className="fw-input" defaultValue="~/Documents/HealthRecords"/>
              <span className="help">Each portal gets its own subfolder.</span>
            </div>
            <div className="row"><button className="fw-btn secondary sm"><Icon name="folder" size={14}/> Choose…</button></div>
          </div>
        )}
        {k === "privacy" && (
          <p style={{fontSize: 14, lineHeight: "22px", color: "var(--fw-ink-700)", margin: 0}}>
            Your records never leave this Mac. The only thing sent off-device is anonymized navigation requests to Anthropic's API, billed against your key. Logs are stored locally and you can wipe them at any time.
          </p>
        )}
        {k === "about" && (
          <div className="col">
            <div style={{fontFamily: "var(--fw-font-mono)", fontSize: 13}}>fetchwell 0.1.0 · build 2026.05.08</div>
            <div style={{fontSize: 13, color: "var(--fw-fg-muted)"}}>An app that fetches your medical records, locally. Made with care.</div>
          </div>
        )}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
