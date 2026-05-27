import { useState } from 'react'
import WHeader from '../shared/WHeader'


const CONFLICT_REGIONS = [
  { id: 'worldwide',    label: '🌍 WORLDWIDE',     src: 'https://liveuamap.com'                    },
  { id: 'ukraine',      label: '🇺🇦 UKRAINE',      src: 'https://liveuamap.com/en/ukraine'         },
  { id: 'middleeast',   label: '🌙 MIDDLE EAST',   src: 'https://liveuamap.com/en/middleeast'      },
  { id: 'israel',       label: '🇮🇱 ISRAEL/GAZA',  src: 'https://liveuamap.com/en/israel'          },
  { id: 'syria',        label: '🇸🇾 SYRIA',        src: 'https://liveuamap.com/en/syria'           },
  { id: 'yemen',        label: '🇾🇪 YEMEN',        src: 'https://liveuamap.com/en/yemen'           },
  { id: 'sudan',        label: '🇸🇩 SUDAN',        src: 'https://liveuamap.com/en/sudan'           },
  { id: 'africa',       label: '🌍 AFRICA',        src: 'https://liveuamap.com/en/africa'          },
  { id: 'libya',        label: '🇱🇾 LIBYA',        src: 'https://liveuamap.com/en/libya'           },
  { id: 'iraq',         label: '🇮🇶 IRAQ',         src: 'https://liveuamap.com/en/iraq'            },
  { id: 'afghanistan',  label: '🇦🇫 AFGHANISTAN',  src: 'https://liveuamap.com/en/afghanistan'     },
  { id: 'asia',         label: '🌏 ASIA',          src: 'https://liveuamap.com/en/asia'            },
  { id: 'myanmar',      label: '🇲🇲 MYANMAR',      src: 'https://liveuamap.com/en/myanmar'         },
  { id: 'latinamerica', label: '🌎 LATIN AMERICA', src: 'https://liveuamap.com/en/latinamerica'    },
  { id: 'usa',          label: '🇺🇸 USA',          src: 'https://liveuamap.com/en/usa'             },
  { id: 'russia',       label: '🇷🇺 RUSSIA',       src: 'https://liveuamap.com/en/russia'          },
]

export const REGION_SLUG_MAP = {
  ukraine: 'ukraine', kyiv: 'ukraine',
  sudan: 'sudan', khartoum: 'sudan',
  syria: 'syria', idlib: 'syria',
  yemen: 'yemen',
  israel: 'israel', palestine: 'israel', gaza: 'israel',
  iraq: 'iraq', baghdad: 'iraq',
  libya: 'libya', tripoli: 'libya',
  afghanistan: 'afghanistan', kabul: 'afghanistan',
  myanmar: 'myanmar', rangoon: 'myanmar',
  russia: 'russia', moscow: 'russia',
  usa: 'usa',
  myanmar2: 'myanmar', pakistan: 'asia', india: 'asia', philippines: 'asia',
  drc: 'africa', nigeria: 'africa', ethiopia: 'africa', mozambique: 'africa', mali: 'africa',
}

export function InfoTooltip({ text, wide }) {
  return (
    <span className="info-tip-wrap">
      <span className="info-tip-btn">?</span>
      <span className={`info-tip-box${wide ? ' info-tip-box-wide' : ''}`}>{text}</span>
    </span>
  )
}

export default function ConflictFeed({ onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const [isLive, setIsLive] = useState(true)

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="CONFLICT" isLive={isLive} workspacePaused={workspacePaused} onToggleLive={() => setIsLive(v => !v)} onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
      <iframe
        src="https://liveuamap.com"
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="CONFLICT"
        allowFullScreen
      />
    </div>
  )
}
