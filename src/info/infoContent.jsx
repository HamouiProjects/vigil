const Faq = () => (
  <>
    <h2>What is Vigil?</h2>
    <p>
      One calm screen for everything you track (wire feeds, news, markets, a map, social accounts), built
      once and always running, with a single pause.
    </p>

    <h2>Does Vigil verify what it shows?</h2>
    <p>
      No. Vigil tracks, it does not verify. The brief and alerts are cited lists of what your own sources
      said, each linking to the original so you can judge it yourself. Vigil never decides for you.
    </p>

    <h2>What does it cost?</h2>
    <p>
      Vigil is in early access. There is a real free tier, and paid plans are coming. Nothing is charged
      during early access, nothing auto-renews, and the subscription never turns on by itself.
    </p>

    <h2>Who is it for?</h2>
    <p>
      Analysts, field teams, and newsrooms who want one reliable picture of the world, not twenty tabs and
      a wall of alarms.
    </p>

    <h2>Is my data private?</h2>
    <p>
      See our <a href="/?p=privacy">Privacy policy</a> for what we collect, why, and your rights.
    </p>

    <h2>How do I get in touch?</h2>
    <p>
      Use the contact form on the <a href="/?p=pricing">Pricing page</a>.
    </p>
  </>
)

export const INFO_PAGES = {
  faq: { title: 'FAQ', node: <Faq /> },
}
