const Impressum = () => (
  <>
    <p>Information pursuant to § 5 DDG (Digitale-Dienste-Gesetz) and § 18 MStV.</p>

    <h2>Operator (Diensteanbieter)</h2>
    <p>
      [FULL LEGAL NAME]<br />
      [STREET AND NUMBER]<br />
      [POSTAL CODE] [CITY]<br />
      Germany
    </p>

    <h2>Contact</h2>
    <p>
      Email: [CONTACT EMAIL]<br />
      (Optional) Phone: [PHONE]
    </p>

    <h2>Responsible for content pursuant to § 18 (2) MStV</h2>
    <p>[FULL LEGAL NAME], address as above.</p>

    <h2>Business and tax details</h2>
    <p>
      Vigil is currently operated by a single operator in an early-access phase and is not yet
      entered in a commercial register. The following will be added once the business is registered:
    </p>
    <ul>
      <li>Legal form: [pending registration, for example sole proprietorship / Einzelunternehmen]</li>
      <li>Register court and number: [pending registration]</li>
      <li>VAT identification number pursuant to § 27a UStG: [pending registration]</li>
    </ul>

    <h2>Online dispute resolution</h2>
    <p>
      The European Commission provides a platform for online dispute resolution (ODR) at{' '}
      <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer noopener">https://ec.europa.eu/consumers/odr</a>.
      We are neither obligated nor willing to participate in dispute resolution proceedings before a
      consumer arbitration board.
    </p>
  </>
)

const Privacy = () => (
  <>
    <p className="legal-updated">Last updated: [DATE]</p>

    <h2>1. Who is responsible</h2>
    <p>The controller for the processing of your personal data is:</p>
    <p>
      [FULL LEGAL NAME]<br />
      [STREET AND NUMBER], [POSTAL CODE] [CITY], Germany<br />
      Email: [CONTACT EMAIL]
    </p>

    <h2>2. What we collect</h2>
    <ul>
      <li><strong>Account data:</strong> your email address and an authentication credential. Passwords are never stored in plain text. Authentication and storage are handled by Supabase (see sub-processors).</li>
      <li><strong>Room and workspace configuration:</strong> the widgets, sources, keywords, saved articles, and alert rules you set up. This is the content of your account.</li>
      <li><strong>Early-access signups:</strong> if you submit your email for early access, we store that email and the place you submitted it from (for example "landing" or "upgrade").</li>
      <li><strong>Usage analytics:</strong> aggregate, cookieless usage measurement via Vercel Analytics. This does not set tracking cookies and is not used to identify you personally.</li>
    </ul>
    <p>We do not sell your data, and we do not run advertising.</p>

    <h2>3. Why we process it, and the legal basis</h2>
    <ul>
      <li>To provide the service you sign up for (account, rooms, brief, alerts): Art. 6 (1) (b) GDPR (performance of a contract).</li>
      <li>To keep the service secure and working, and to understand aggregate usage: Art. 6 (1) (f) GDPR (legitimate interest in a secure, functioning product). Our analytics is cookieless to keep this interest proportionate.</li>
      <li>Where we ask for your consent (for example an early-access signup): Art. 6 (1) (a) GDPR (consent), which you may withdraw at any time.</li>
    </ul>

    <h2>4. Sub-processors</h2>
    <p>We use the following providers to run the service. Each processes data only as needed to provide its function.</p>
    <ul>
      <li><strong>Supabase</strong> (authentication and database, hosted in the EU, eu-central-1): account, room configuration, alert rules.</li>
      <li><strong>Vercel</strong> (hosting and cookieless analytics): serves the application and measures aggregate usage.</li>
      <li><strong>Resend</strong> (email delivery): sends transactional email, alert digests, and briefs you request.</li>
      <li><strong>Stripe</strong> (payment processing): currently in TEST mode only. No real payments are processed and no card data is collected at this time.</li>
      <li><strong>DeepSeek</strong> (the brief language model): when you generate a brief, the public titles, sources, and URLs of the items in your room are sent to generate a summary. No account data or other personal data is sent. See the transfer note in section 5.</li>
      <li><strong>MapTiler</strong> (map tiles): serves map imagery for the Atlas widget.</li>
      <li><strong>SerpApi</strong> (search-interest data): provides the relative search-interest figures shown in the Trends widget.</li>
      <li><strong>RSS2JSON</strong> (feed proxy): helps fetch and normalize the public RSS and social feeds you add.</li>
    </ul>

    <h2>5. International transfers</h2>
    <p>
      Most processing happens within the EU. One exception: the brief language model (DeepSeek) runs on
      infrastructure outside the EU, including in China. When you generate a brief, only the public titles,
      sources, and URLs of your room's items are sent to it. No account data or other personal data is included.
    </p>

    <h2>6. How long we keep it</h2>
    <p>
      We keep account and room data for as long as your account exists. If you delete your account, the
      associated data is removed. Early-access signup emails are kept until you ask us to remove them or until
      the early-access period ends. Operational logs are kept only as long as needed for security and reliability.
    </p>

    <h2>7. Your rights</h2>
    <p>
      Under the GDPR you have the right to access, rectify, erase, restrict, and port your personal data, and to
      object to certain processing. To exercise any of these, email [CONTACT EMAIL].
    </p>
    <p>
      You also have the right to lodge a complaint with a supervisory authority. The competent authority for
      Berlin is the Berliner Beauftragte für Datenschutz und Informationsfreiheit (BlnBDI).
    </p>

    <h2>8. Cookies and analytics</h2>
    <p>
      We do not use tracking or advertising cookies. We use only the storage strictly necessary to keep you
      signed in and to remember your settings. Usage analytics (Vercel) is cookieless and aggregate.
    </p>

    <h2>9. Changes</h2>
    <p>
      We may update this policy as the service develops. The "last updated" date above reflects the current version.
    </p>

    <h2>10. Contact</h2>
    <p>Questions about this policy or your data: [CONTACT EMAIL].</p>
  </>
)

const Terms = () => (
  <>
    <p className="legal-updated">Last updated: [DATE]</p>

    <h2>1. About these terms</h2>
    <p>
      These terms govern your use of Vigil ("the service"), operated by [FULL LEGAL NAME], [CITY], Germany. By
      creating an account or using the service, you agree to them. If you do not agree, do not use the service.
    </p>

    <h2>2. What Vigil is</h2>
    <p>
      Vigil is an operational risk-intelligence tool. It gathers the public sources you choose into one room, and
      can produce a summary brief and alerts over those sources. Vigil is currently in an early-access phase and is
      offered as is while it develops.
    </p>

    <h2>3. The honest stance: Vigil tracks, it does not verify</h2>
    <p>
      This is central, so it is stated plainly. Vigil aggregates and summarizes the sources you configure.{' '}
      <strong>It does not verify, fact-check, or guarantee the accuracy, completeness, or timeliness of any source,
      headline, summary, brief, or alert.</strong> The brief is a cited summary of your room's own sources. Alerts
      are a cited list of new matching items. Search-interest figures are relative interest, not volume. None of
      these is a statement of fact, a verification, advice, or a recommendation. You are responsible for
      independently verifying any information before relying on or acting on it. To the extent permitted by law, we
      accept no liability for decisions made in reliance on the service's output.
    </p>

    <h2>4. Your account</h2>
    <p>
      You may use the service as a guest (an anonymous session) or with a registered account. You are responsible
      for keeping your credentials secure and for activity under your account. A guest session is tied to your
      browser and is not a durable record. Creating or signing in to an account is what preserves your room across
      devices.
    </p>

    <h2>5. Acceptable use</h2>
    <p>
      You agree not to: use the service unlawfully; attempt to disrupt, overload, or gain unauthorized access to
      the service or its infrastructure; misuse the source-fetching features to scrape or attack third parties; or
      use the service to infringe others' rights.
    </p>

    <h2>6. Subscriptions and billing</h2>
    <p>
      During the early-access phase the service is provided free of charge. Payment processing is in TEST mode only.{' '}
      <strong>The service will never start charging you automatically.</strong> No subscription switches on, renews,
      or charges a card unless you explicitly choose to subscribe through a clearly marked checkout. Paid access
      during this phase, where granted, is provided at the operator's discretion for testing and feedback. Pricing
      and paid features will be introduced separately, with their own clear terms, once the business is registered.
    </p>

    <h2>7. Third-party sources and content</h2>
    <p>
      The sources, feeds, and embeds you add are provided by third parties. We do not control, endorse, or take
      responsibility for their content. Your use of them may be subject to their own terms.
    </p>

    <h2>8. Disclaimers and liability</h2>
    <p>
      The service is provided as is and as available, without warranties of any kind to the extent permitted by law.
      Nothing in these terms limits liability that cannot be limited under German law (including for injury to life,
      body, or health, or for intent and gross negligence). Subject to that, our liability for slight negligence is
      limited to the breach of essential contractual obligations and to foreseeable, typical damage.
    </p>

    <h2>9. Termination</h2>
    <p>
      You may stop using the service and delete your account at any time. We may suspend or end access where these
      terms are breached or where required to protect the service or others.
    </p>

    <h2>10. Changes</h2>
    <p>
      We may update these terms as the service develops. The "last updated" date reflects the current version.
      Continued use after a change means you accept the updated terms.
    </p>

    <h2>11. Governing law</h2>
    <p>German law applies. Place of jurisdiction is [CITY], to the extent legally permissible.</p>

    <h2>12. Contact</h2>
    <p>[CONTACT EMAIL]</p>
  </>
)

export const LEGAL_PAGES = {
  impressum: { title: 'Impressum', node: <Impressum /> },
  privacy: { title: 'Privacy Policy', node: <Privacy /> },
  terms: { title: 'Terms of Service', node: <Terms /> },
}
