import './App.css'
import Shell from './shell/Shell.jsx'
import PublicRoom from './shell/PublicRoom.jsx'

export default function App() {
  const slug = new URLSearchParams(window.location.search).get('r')
  if (slug) return <PublicRoom slug={slug} />
  return <Shell />
}
