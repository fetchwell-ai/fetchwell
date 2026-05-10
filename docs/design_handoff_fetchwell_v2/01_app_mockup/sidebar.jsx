/** Sidebar — A: Settings nested as a collapsible section */
const Sidebar = ({ portals, activeId, onSelect, settingsOpen, setSettingsOpen, settingsActive, onSettingsSelect }) => {
  const isPortalActive = activeId !== null && activeId !== undefined && !settingsActive;
  return (
    <aside className="fw-sidebar">
      <div className="fw-titlebar">
        <svg width="22" height="22" viewBox="0 0 96 96" aria-hidden="true">
          <circle cx="48" cy="48" r="46" fill="#1F4D3E"/>
          <path d="M22 64 C 30 32, 56 22, 74 26 C 70 40, 60 52, 46 58 C 36 62, 28 64, 22 64 Z" fill="#F4EFE6"/>
          <path d="M56 34 C 64 30, 72 28, 74 26 C 72 36, 66 44, 58 48 Z" fill="#B47834"/>
        </svg>
        <span className="brand">fetchwell</span>
      </div>

      <div className="fw-side-section"><span className="label">Portals</span></div>
      <div className="fw-side-list" style={{flex: "0 0 auto"}}>
        {portals.map(p => (
          <button key={p.id}
            className={"fw-side-row" + (isPortalActive && p.id === activeId ? " is-active" : "")}
            onClick={() => onSelect(p.id)}>
            <span className="dot" style={{background: p.statusColor}}></span>
            <span className="name">{p.name}</span>
          </button>
        ))}
        <button className="fw-side-row" onClick={() => onSelect("__add")} style={{color: "var(--fw-fg-muted)"}}>
          <Icon name="plus" size={14}/> <span className="name">Add portal</span>
        </button>
      </div>

      <div className="fw-side-section collapsible" data-open={settingsOpen}
           onClick={() => setSettingsOpen(!settingsOpen)}>
        <Icon name="chevron-right" size={12} className="chev"/>
        <span className="label">Settings</span>
      </div>
      {settingsOpen && (
        <div className="fw-side-sub">
          {[
            {k: "appearance", ico: "moon",   label: "Appearance"},
            {k: "key",        ico: "key",    label: "Anthropic API key"},
            {k: "storage",    ico: "folder", label: "Storage location"},
            {k: "privacy",    ico: "shield", label: "Privacy & data"},
            {k: "about",      ico: "info",   label: "About Fetchwell"},
          ].map(s => (
            <button key={s.k}
              className={"fw-side-row" + (settingsActive === s.k ? " is-active" : "")}
              onClick={() => onSettingsSelect(s.k)}>
              <Icon name={s.ico} size={14} className="ico"/>
              <span className="name">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="spacer"></div>
      <div className="fw-side-foot">
        <div style={{padding: "8px 10px", fontSize: 11, color: "var(--fw-fg-subtle)", display: "flex", justifyContent: "space-between"}}>
          <span>v0.1.0</span>
          <span style={{fontFamily: "var(--fw-font-mono)", fontVariationSettings: '"MONO" 1, "CASL" 1'}}>local-only</span>
        </div>
      </div>
    </aside>
  );
};
window.Sidebar = Sidebar;
