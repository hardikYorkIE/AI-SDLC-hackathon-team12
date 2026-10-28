export function BrokenDashboard() {
  return (
    <div className="stack" id="dashboard-stack" data-audit-spacing>
      <div className="title-row">
        <div>
          <h1 id="dashboard-title">Dashboard</h1>
          <h1 id="revenue-heading" className="secondary-title">
            Revenue this week
          </h1>
        </div>
        <div className="title-actions">
          <button id="notify-button" className="icon-btn" type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <circle cx="12" cy="12" r="8" fill="currentColor" />
            </svg>
          </button>
          <button className="btn-primary" type="button">
            Export
          </button>
        </div>
      </div>
      <section id="stat-grid" className="panel spacing-off-7" data-audit-spacing aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading">Pipeline</h2>
        <p>$12,400 in demo deals. Nothing here is a real customer.</p>
      </section>
      <aside id="filters" className="panel spacing-off-15" data-audit-spacing aria-labelledby="filters-heading">
        <h2 id="filters-heading">Filters</h2>
        <p>Open demo deals only.</p>
      </aside>
    </div>
  );
}
