// Per-route document head metadata for the ?p= info routes and public rooms.
// The app navigates via full page loads (window.location.href), so each route is
// a fresh document: index.html ships the default "Vigil" head, then this runs
// once on mount to patch the title, canonical, and og/twitter tags for the
// active route.
//
// HONEST LIMIT: social-card crawlers (Twitter, Slack, Facebook, LinkedIn) read
// the static index.html BEFORE any JS runs, so they still see the default root
// card on every ?p= route. JS-rendering crawlers (Googlebot) do pick up these
// per-route values, and browser tabs get the right title. Per-route social-card
// previews need prerender or SSR (parked, decision-gated).

const SITE = 'https://thevigilroom.com'
const DEFAULT_TITLE = 'Vigil'
const DEFAULT_DESC =
  'A calm operations room for watching geopolitical and OSINT sources in one place. A screen you can pause. Vigil tracks, it does not verify.'

// page key (the ?p= value) -> { title, desc, path }.
const ROUTES = {
  about: {
    title: 'About · Vigil',
    desc: 'What Vigil is, why it exists, and how the room, the brief, and the alerts fit together. Vigil tracks, it does not verify.',
    path: '/?p=about',
  },
  pricing: {
    title: 'Pricing · Vigil',
    desc: 'Vigil plans. Real-time data and the full widget library are free. Briefs, scheduled delivery, alerts, and team are the paid layer.',
    path: '/?p=pricing',
  },
  contact: {
    title: 'Contact · Vigil',
    desc: 'Get in touch with Vigil.',
    path: '/?p=contact',
  },
  faq: {
    title: 'FAQ · Vigil',
    desc: 'Common questions about Vigil, the room, the brief, and the alerts.',
    path: '/?p=faq',
  },
  privacy: {
    title: 'Privacy · Vigil',
    desc: 'How Vigil handles your data, including third-party processing for AI briefs and source suggestions.',
    path: '/?p=privacy',
  },
  terms: {
    title: 'Terms · Vigil',
    desc: 'The terms of use for Vigil.',
    path: '/?p=terms',
  },
  impressum: {
    title: 'Impressum · Vigil',
    desc: 'Legal disclosure for Vigil.',
    path: '/?p=impressum',
  },
}

function setMeta(selector, value) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    const m = selector.match(/\[(property|name)="([^"]+)"\]/)
    if (m) el.setAttribute(m[1], m[2])
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function applyHead(title, desc, url) {
  document.title = title
  setCanonical(url)
  setMeta('meta[name="description"]', desc)
  setMeta('meta[property="og:url"]', url)
  setMeta('meta[property="og:title"]', title)
  setMeta('meta[property="og:description"]', desc)
  setMeta('meta[name="twitter:title"]', title)
  setMeta('meta[name="twitter:description"]', desc)
}

// legalPage = the raw ?p= value (or null); slug = the ?r= value (or null).
export function applyRouteHead(legalPage, slug) {
  const route = legalPage ? ROUTES[legalPage] : null

  if (route) {
    applyHead(route.title, route.desc, SITE + route.path)
    return
  }

  if (slug) {
    // Shared throwaway room. A tab title, but canonical points back to root so
    // share slugs are never treated as canonical indexable pages.
    applyHead('Shared room · Vigil', DEFAULT_DESC, SITE + '/')
    return
  }

  // Root / app. The static index.html head already carries these; reassert in
  // case a prior route patched them in the same document.
  applyHead(DEFAULT_TITLE, DEFAULT_DESC, SITE + '/')
}
