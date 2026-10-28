export function NewFeature() {
  return (
    <div className="stack" id="invite-stack" data-audit-spacing>
      <h1>Invite a teammate</h1>
      <p>Share a demo workspace. No email is sent.</p>
      <section className="panel" aria-labelledby="invite-heading">
        <h2 id="invite-heading">Workspace invite</h2>
        <form className="field" onSubmit={(event) => event.preventDefault()}>
          <input id="invite-email" name="invite" type="email" autoComplete="email" />
          <button className="btn-primary" type="submit">
            Send invite
          </button>
        </form>
      </section>
    </div>
  );
}
