import IntroGlobe from '../brand/IntroGlobe.jsx'
import './about.css'

export default function AboutPage() {
  return (
    <div className="about">
      <header className="about-chrome">
        <a className="about-wordmark" href="/">VIGIL</a>
      </header>

      <main className="about-main">
        <section className="about-hero" aria-labelledby="about-title">
          <div className="about-hero-globe">
            <IntroGlobe className="about-globe-canvas" centerX={0.5} />
          </div>
          <div className="about-hero-veil" aria-hidden="true" />
          <h1 id="about-title" className="about-title">About Vigil</h1>
        </section>

        <article className="about-article">
          <p>
            Most tools hand you an empty workspace and expect you to wire up feeds, maps, markets, and
            social accounts yourself. Vigil is different. You step into a furnished room: the sources you
            actually watch, already arranged on one screen, running while you work and freezable on pause
            when you step away.
          </p>

          <h2>The room</h2>
          <p>
            The room is one screen. Feeds, map, markets, and social accounts sit where your eye already
            moves. Leave it running, hit pause when you need to, and it holds still so you pick up where
            you stopped instead of reopening a dozen tabs.
          </p>

          <h2>The brief</h2>
          <p>
            When you want a read on what changed, Vigil reads your own room and writes a short, plain
            summary on the go. Every line links to the source it came from, so you can open the original
            and judge it for yourself. It summarizes what your sources said. It never decides for you.
          </p>

          <h2>The alerts</h2>
          <p>
            Some things you cannot afford to miss. Name the places, people, and keywords that matter, and
            when something new matching them lands in your room, Vigil flags it in its daily digest, in
            the app, by email, or straight into Slack for teams. A quiet, cited heads up.
          </p>

          <p>
            <strong>Built for people who watch the world for a living.</strong> The analysts, field teams,
            and newsrooms who need one calm, reliable picture, not twenty tabs and a wall of alarms.
          </p>

          <h2>Honest by design</h2>
          <p>
            Vigil tracks, it does not verify. The brief and alerts are cited summaries of your own sources,
            with a link to each original, never independent claims.
          </p>

          <p className="about-data-note">
            Your room and account data are stored in the EU. Delete your account and everything with it at
            any time, in the app.
          </p>
        </article>

        <nav className="about-foot">
          <a href="/?p=about">About</a>
          <a href="/?p=faq">FAQ</a>
          <a href="/?p=pricing">Pricing</a>
          <a href="/?p=impressum">Impressum</a>
          <a href="/?p=privacy">Privacy</a>
          <a href="/?p=terms">Terms</a>
          <a href="/">Back to Vigil</a>
        </nav>
      </main>
    </div>
  )
}
