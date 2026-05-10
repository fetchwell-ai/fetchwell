/** Portal card — inline guidance line that adapts to the portal's state. */
const PortalCard = ({ portal }) => {
  const { name, url, state, lastFetched, recordCounts } = portal;

  let badge = null, guidance = null, primary = null;

  if (state === "new") {
    badge = <span className="fw-badge default"><span className="dot"></span>Not mapped yet</span>;
    guidance = (
      <div className="guidance info">
        <Icon name="compass" size={16} className="g-ico"/>
        <div className="g-body">
          <p><strong>Next: tell us where your records live.</strong></p>
          <span className="next">Click <em>Map</em> — we'll open the portal in a window so you can sign in and walk through the labs, visits, and messages sections. Takes about 2 minutes.</span>
        </div>
      </div>
    );
    primary = <button className="fw-btn primary sm"><Icon name="compass" size={14}/> Map portal</button>;
  } else if (state === "mapped") {
    badge = <span className="fw-badge info"><span className="dot"></span>Mapped · ready to fetch</span>;
    guidance = (
      <div className="guidance success">
        <Icon name="check" size={16} className="g-ico"/>
        <div className="g-body">
          <p><strong>You're ready for the first extraction.</strong></p>
          <span className="next">Mapping is done — click <em>Fetch records</em> to download everything. Future extractions are incremental and much faster.</span>
        </div>
      </div>
    );
    primary = <button className="fw-btn primary sm"><Icon name="download" size={14}/> Fetch records</button>;
  } else if (state === "fetched") {
    badge = <span className="fw-badge success"><span className="dot"></span>Last fetched {lastFetched}</span>;
    primary = <button className="fw-btn primary sm"><Icon name="download" size={14}/> Fetch again</button>;
  } else if (state === "error") {
    badge = <span className="fw-badge danger"><span className="dot"></span>Login failed</span>;
    guidance = (
      <div className="guidance" style={{background: "var(--fw-crimson-100)", color: "var(--fw-crimson-700)", borderLeftColor: "var(--fw-crimson-600)"}}>
        <Icon name="alert" size={16} className="g-ico"/>
        <div className="g-body">
          <p><strong>The portal didn't accept your credentials.</strong></p>
          <span className="next">Try signing in directly first — sometimes portals require a security challenge. Then update your saved username and password.</span>
        </div>
      </div>
    );
    primary = <button className="fw-btn primary sm">Update credentials</button>;
  }

  return (
    <div className="fw-card fw-portal-card">
      <div className="head">
        <div>
          <h2>{name}</h2>
          <div className="url">{url}</div>
        </div>
        <button className="gear" aria-label="Edit portal"><Icon name="settings" size={18}/></button>
      </div>

      <div className="row">{badge}</div>

      {guidance}

      {state === "fetched" && (
        <div className="fw-portal-meta">
          <div className="item"><Icon name="file" size={14}/><span>Records: <span className="v">{recordCounts.total}</span></span></div>
          <div className="item"><Icon name="clock" size={14}/><span>Mapped: <span className="v">{portal.mappedAt}</span></span></div>
          <div className="item"><Icon name="folder" size={14}/><span style={{fontFamily: "var(--fw-font-mono)"}}>~/Documents/HealthRecords/{portal.id}</span></div>
        </div>
      )}

      <div className="footer">
        {primary}
        {state !== "new" && <button className="fw-btn secondary sm"><Icon name="compass" size={14}/> Re-map</button>}
        <button className="fw-btn danger sm">Remove</button>
      </div>
    </div>
  );
};
window.PortalCard = PortalCard;
