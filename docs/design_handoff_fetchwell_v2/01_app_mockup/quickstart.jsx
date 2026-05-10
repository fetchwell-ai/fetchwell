/** QuickStart — B: Get-started checklist card. Lives at top of main pane. */
const QuickStart = ({ steps, onStepClick, onDismiss, collapsed }) => {
  const done = steps.filter(s => s.done).length;
  const total = steps.length;
  const allDone = done === total;

  if (collapsed && allDone) {
    return (
      <div className="qs-collapsed" style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "var(--fw-moss-100)", color: "var(--fw-moss-700)",
        padding: "10px 14px", borderRadius: 10, marginBottom: 28,
        fontSize: 13, fontWeight: 500,
      }}>
        <Icon name="check" size={16}/>
        <span>You're all set up. <button onClick={onDismiss} style={{background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0, font: "inherit"}}>Dismiss</button></span>
      </div>
    );
  }

  return (
    <div className="fw-quickstart">
      <div className="qs-head">
        <div>
          <div className="qs-eyebrow">Get started</div>
          <h3>{allDone ? "You're all set up." : "Three quick steps to your first records."}</h3>
        </div>
        <div style={{display: "flex", alignItems: "center", gap: 12}}>
          <span className="qs-prog">{done} / {total}</span>
          <button className="qs-dismiss" onClick={onDismiss} aria-label="Dismiss"><Icon name="x" size={14}/></button>
        </div>
      </div>
      <ul className="fw-qs-steps">
        {steps.map((s, i) => {
          const cls = "fw-qs-step" + (s.done ? " is-done" : (s.current ? " is-current" : ""));
          return (
            <li key={s.k}>
              <button className={cls} onClick={() => !s.done && onStepClick(s.k)}>
                <span className="qs-check">{s.done && <Icon name="check" size={12}/>}</span>
                <span className="qs-label">{s.label}</span>
                {s.meta && <span className="qs-meta">{s.meta}</span>}
                {!s.done && <Icon name="arrow-right" size={14} className="qs-arrow"/>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
window.QuickStart = QuickStart;
