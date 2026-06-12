const About = () => (
  <>
    <p>
      Right now you probably have a wire feed, two news sites, a markets ticker, a map, and three
      social accounts open in separate tabs. By the time you have checked them all, the first one has
      changed and you start over. And that is only one topic you are following.
    </p>
    <p>
      Vigil puts all of it on one screen. You build the room once and it keeps running. Step away, hit
      pause, and it holds still, so you come back to <strong>where you left off</strong> instead of
      reopening everything. And no more doom scrolling social media hoping to catch the one update that
      matters.
    </p>
    <p>
      Then Vigil does the watching for you. It briefs you each morning or week on what changed, alerts
      you the moment something you are tracking moves, and leaves a short read in your inbox for the
      days you cannot sit in front of it.
    </p>

    <h2>The room</h2>
    <p>
      The problem is the tabs. A wire feed, two news sites, a markets ticker, a map, a couple of social
      accounts, all open at once, and by the time you have checked them the first one has already moved.
      Vigil puts all of it on one screen, arranged how you think. You build the room once and it keeps
      running. One switch pauses everything, so you can step away and come back to exactly where you left
      off, with no doom scrolling to catch the one update that matters.
    </p>

    <h2>The brief</h2>
    <p>
      When you want a read on what changed, Vigil reads your own room and writes a short, plain summary
      on the spot. No fixed daily or weekly schedule, you generate one whenever you need it, up to the
      number your plan includes. Every line links to the source it came from, so you can open the
      original and judge it for yourself. It summarizes what your sources said. It never decides for you.
    </p>

    <h2>The alerts</h2>
    <p>
      Some things you cannot afford to miss. Name the places, people, and keywords that matter, and when
      something new matching them lands in your room, Vigil tells you, in the app or by email. Teams can
      route the same alerts straight into Slack. A quiet, cited heads up, never a false alarm.
    </p>

    <p>
      <strong>Built for the people who watch the world for a living.</strong> The analysts, field teams,
      and newsrooms who want one calm, reliable picture of it, not twenty tabs and a wall of alarms.
    </p>

    <h2>How we handle the truth</h2>
    <p>
      Vigil tracks, it does not verify. The brief and alerts are cited summaries of your own sources,
      with a link to each original, never independent claims.
    </p>
  </>
)

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
    <p>Email: [CONTACT EMAIL]</p>
  </>
)

export const INFO_PAGES = {
  about: { title: 'About Vigil', node: <About /> },
  faq: { title: 'FAQ', node: <Faq /> },
}
