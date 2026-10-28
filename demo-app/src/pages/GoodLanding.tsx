export function GoodLanding() {
  return (
    <div className="stack" id="landing-stack" data-audit-spacing>
      <h1>Ship a cleaner checkout</h1>
      <p>Harbor is a demo product with labelled fields, one page heading, and type on the scale.</p>
      <section className="panel" aria-labelledby="trial-heading">
        <h2 id="trial-heading">Start a trial</h2>
        <form className="field" onSubmit={(event) => event.preventDefault()}>
          <label className="field-label" htmlFor="work-email">
            Work email
          </label>
          <input id="work-email" name="email" type="email" autoComplete="email" defaultValue="ada@harbor.example" />
          <button className="btn-primary" type="submit">
            Start trial
          </button>
        </form>
      </section>
    </div>
  );
}
