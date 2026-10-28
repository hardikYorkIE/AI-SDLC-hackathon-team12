export function BrokenCheckout() {
  return (
    <form
      className="stack"
      id="checkout-stack"
      data-audit-spacing
      onSubmit={(event) => event.preventDefault()}
    >
      <h1>Checkout</h1>
      <p>Demo order. No card is charged.</p>
      <section className="panel" aria-labelledby="payment-heading">
        <h2 id="payment-heading">Payment</h2>
        <div className="field">
          <input id="card-number" name="card" inputMode="numeric" />
        </div>
        <p id="billing-note" className="body-copy" data-audit-font>
          Funds are held for review. This note is demo copy set at 13px.
        </p>
        <button id="pay-button" className="btn-primary checkout-submit" type="submit">
          Pay $48.00
        </button>
      </section>
    </form>
  );
}
