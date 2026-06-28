import './legal.css'
import { LEGAL_PAGES } from './legalContent.jsx'

export default function LegalPage({ page }) {
  const entry = LEGAL_PAGES[page]
  if (!entry) {
    if (typeof window !== 'undefined') window.location.replace('/')
    return null
  }
  return (
    <div className="legal">
      <header className="legal-chrome">
        <a className="legal-wordmark" href="/">VIGIL</a>
      </header>
      <main className="legal-main">
        <article className="legal-article">
          <h1 className="legal-title">{entry.title}</h1>
          {entry.node}
        </article>
        <nav className="legal-foot">
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
