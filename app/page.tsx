import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page home-page">
      <section className="home-center">
        <div className="stack" style={{ maxWidth: 860, width: "100%" }}>
          <section className="hero" style={{ marginBottom: 0 }}>
            <h1 className="hero-title">Bidroom</h1>
            <p className="hero-subtitle">
              Trips, tournaments, and now a curated directory of organized group bike rides.
            </p>
            <div className="row" style={{ justifyContent: "center" }}>
              <Link className="button" href="/rides">
                Browse rides
              </Link>
              <Link className="button secondary" href="/login">
                Sign in
              </Link>
            </div>
          </section>

          <section className="grid-2">
            <article className="card" style={{ textAlign: "left" }}>
              <div className="section-title">New</div>
              <div className="stack" style={{ gap: 10 }}>
                <strong>Group bike rides</strong>
                <p className="muted" style={{ margin: 0 }}>
                  Start with Bay Area club calendars, recurring shop rides, and community routes sourced from official
                  pages.
                </p>
                <div className="row">
                  <Link className="button secondary" href="/rides">
                    Open rides
                  </Link>
                </div>
              </div>
            </article>

            <article className="card" style={{ textAlign: "left" }}>
              <div className="section-title">Core Tools</div>
              <div className="stack" style={{ gap: 10 }}>
                <strong>Trips and tournaments</strong>
                <p className="muted" style={{ margin: 0 }}>
                  Keep using Bidroom for trip coordination and live tournament management once you sign in.
                </p>
                <div className="row">
                  <Link className="button secondary" href="/login">
                    Sign in to continue
                  </Link>
                </div>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
