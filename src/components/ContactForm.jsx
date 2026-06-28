import { useState } from 'react'
import '../pricing/pricing.css'

function isValidEmail(value) {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.includes('@')
}

export default function ContactForm({ showHeading = true }) {
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [contactLoading, setContactLoading] = useState(false)
  const [contactSuccess, setContactSuccess] = useState(null)
  const [contactError, setContactError] = useState(null)

  async function handleContact() {
    if (contactLoading || contactSuccess) return
    const name = contactName.trim()
    const email = contactEmail.trim()
    const message = contactMessage.trim()
    if (!name) {
      setContactError('Please enter your name.')
      return
    }
    if (!isValidEmail(email)) {
      setContactError('Please enter a valid email address.')
      return
    }
    if (!message) {
      setContactError('Please enter a message.')
      return
    }
    setContactLoading(true)
    setContactError(null)
    try {
      const res = await fetch('/api/jobs?action=contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })
      if (res.status === 429) {
        setContactError('Too many attempts. Try again in a minute.')
        setContactLoading(false)
        return
      }
      if (!res.ok) {
        setContactError('Something went wrong. Please try again.')
        setContactLoading(false)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!data.ok) {
        setContactError('Something went wrong. Please try again.')
        setContactLoading(false)
        return
      }
      setContactSuccess('Thank you. We will read your message and reply by email.')
      setContactName('')
      setContactEmail('')
      setContactMessage('')
    } catch {
      setContactError('Something went wrong. Please try again.')
    } finally {
      setContactLoading(false)
    }
  }

  return (
    <section className="pricing-contact" aria-labelledby={showHeading ? 'pricing-contact-heading' : undefined}>
      {showHeading && (
        <h2 id="pricing-contact-heading" className="pricing-contact-title">Contact</h2>
      )}
      <p className="pricing-contact-lede">
        Questions about plans, seats, or early access? Send a note and we will reply by email.
      </p>
      {contactSuccess ? (
        <p className="pricing-feedback pricing-feedback-ok">{contactSuccess}</p>
      ) : (
        <div className="pricing-contact-fields">
          <label className="pricing-label">
            Name
            <input
              type="text"
              className="pricing-input"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              disabled={contactLoading}
            />
          </label>
          <label className="pricing-label">
            Email
            <input
              type="email"
              className="pricing-input"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              disabled={contactLoading}
            />
          </label>
          <label className="pricing-label">
            Message
            <textarea
              className="pricing-input pricing-textarea"
              value={contactMessage}
              onChange={(e) => setContactMessage(e.target.value)}
              disabled={contactLoading}
            />
          </label>
          {contactError && (
            <p className="pricing-feedback pricing-feedback-err">{contactError}</p>
          )}
          <button
            type="button"
            className="pricing-btn pricing-btn-primary"
            onClick={handleContact}
            disabled={contactLoading}
          >
            {contactLoading ? 'Sending' : 'Send message'}
          </button>
        </div>
      )}
    </section>
  )
}
