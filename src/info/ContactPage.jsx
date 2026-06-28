import '../legal/legal.css'
import ContactForm from '../components/ContactForm.jsx'

export default function ContactPage() {
  return (
    <div className="legal">
      <header className="legal-chrome">
        <a className="legal-wordmark" href="/">VIGIL</a>
      </header>
      <main className="legal-main">
        <article className="legal-article">
          <h1 className="legal-title">Contact</h1>
          <ContactForm showHeading={false} />
        </article>
        <nav className="legal-foot">
          <a href="/?p=about">About</a>
          <a href="/?p=faq">FAQ</a>
          <a href="/?p=pricing">Pricing</a>
          <a href="/?p=privacy">Privacy</a>
          <a href="/?p=terms">Terms</a>
          <a href="/">Back to Vigil</a>
        </nav>
      </main>
    </div>
  )
}
