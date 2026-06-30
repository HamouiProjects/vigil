// ICAO Annex 10 address blocks — flightaware/dump1090 public_html/flags.js (readsb/tar1090 table)
const ICAO_COUNTRY_RANGES = [
  [0x700000, 0x700FFF, 'Afghanistan'],
  [0x501000, 0x5013FF, 'Albania'],
  [0xA0000, 0xA7FFF, 'Algeria'],
  [0x90000, 0x90FFF, 'Angola'],
  [0xCA000, 0xCA3FF, 'Antigua and Barbuda'],
  [0xE00000, 0xE3FFFF, 'Argentina'],
  [0x600000, 0x6003FF, 'Armenia'],
  [0x7C0000, 0x7FFFFF, 'Australia'],
  [0x440000, 0x447FFF, 'Austria'],
  [0x600800, 0x600BFF, 'Azerbaijan'],
  [0xA8000, 0xA8FFF, 'Bahamas'],
  [0x894000, 0x894FFF, 'Bahrain'],
  [0x702000, 0x702FFF, 'Bangladesh'],
  [0xAA000, 0xAA3FF, 'Barbados'],
  [0x510000, 0x5103FF, 'Belarus'],
  [0x448000, 0x44FFFF, 'Belgium'],
  [0xAB000, 0xAB3FF, 'Belize'],
  [0x94000, 0x943FF, 'Benin'],
  [0x680000, 0x6803FF, 'Bhutan'],
  [0xE94000, 0xE94FFF, 'Bolivia'],
  [0x513000, 0x5133FF, 'Bosnia and Herzegovina'],
  [0x30000, 0x303FF, 'Botswana'],
  [0xE40000, 0xE7FFFF, 'Brazil'],
  [0x895000, 0x8953FF, 'Brunei Darussalam'],
  [0x450000, 0x457FFF, 'Bulgaria'],
  [0x9C000, 0x9CFFF, 'Burkina Faso'],
  [0x32000, 0x32FFF, 'Burundi'],
  [0x70E000, 0x70EFFF, 'Cambodia'],
  [0x34000, 0x34FFF, 'Cameroon'],
  [0xC00000, 0xC3FFFF, 'Canada'],
  [0x96000, 0x963FF, 'Cape Verde'],
  [0x6C000, 0x6CFFF, 'Central African Republic'],
  [0x84000, 0x84FFF, 'Chad'],
  [0xE80000, 0xE80FFF, 'Chile'],
  [0x780000, 0x7BFFFF, 'China'],
  [0xAC000, 0xACFFF, 'Colombia'],
  [0x35000, 0x353FF, 'Comoros'],
  [0x36000, 0x36FFF, 'Congo'],
  [0x901000, 0x9013FF, 'Cook Islands'],
  [0xAE000, 0xAEFFF, 'Costa Rica'],
  [0x38000, 0x38FFF, "Cote d'Ivoire"],
  [0x501C00, 0x501FFF, 'Croatia'],
  [0xB0000, 0xB0FFF, 'Cuba'],
  [0x4C8000, 0x4C83FF, 'Cyprus'],
  [0x498000, 0x49FFFF, 'Czech Republic'],
  [0x720000, 0x727FFF, "Democratic People's Republic of Korea"],
  [0x8C000, 0x8CFFF, 'Democratic Republic of the Congo'],
  [0x458000, 0x45FFFF, 'Denmark'],
  [0x98000, 0x983FF, 'Djibouti'],
  [0xC4000, 0xC4FFF, 'Dominican Republic'],
  [0xE84000, 0xE84FFF, 'Ecuador'],
  [0x10000, 0x17FFF, 'Egypt'],
  [0xB2000, 0xB2FFF, 'El Salvador'],
  [0x42000, 0x42FFF, 'Equatorial Guinea'],
  [0x202000, 0x2023FF, 'Eritrea'],
  [0x511000, 0x5113FF, 'Estonia'],
  [0x40000, 0x40FFF, 'Ethiopia'],
  [0xC88000, 0xC88FFF, 'Fiji'],
  [0x460000, 0x467FFF, 'Finland'],
  [0x380000, 0x3BFFFF, 'France'],
  [0x3E000, 0x3EFFF, 'Gabon'],
  [0x9A000, 0x9AFFF, 'Gambia'],
  [0x514000, 0x5143FF, 'Georgia'],
  [0x3C0000, 0x3FFFFF, 'Germany'],
  [0x44000, 0x44FFF, 'Ghana'],
  [0x468000, 0x46FFFF, 'Greece'],
  [0xCC000, 0xCC3FF, 'Grenada'],
  [0xB4000, 0xB4FFF, 'Guatemala'],
  [0x46000, 0x46FFF, 'Guinea'],
  [0x48000, 0x483FF, 'Guinea-Bissau'],
  [0xB6000, 0xB6FFF, 'Guyana'],
  [0xB8000, 0xB8FFF, 'Haiti'],
  [0xBA000, 0xBAFFF, 'Honduras'],
  [0x470000, 0x477FFF, 'Hungary'],
  [0x4CC000, 0x4CCFFF, 'Iceland'],
  [0x800000, 0x83FFFF, 'India'],
  [0x8A0000, 0x8A7FFF, 'Indonesia'],
  [0x730000, 0x737FFF, 'Iran, Islamic Republic of'],
  [0x728000, 0x72FFFF, 'Iraq'],
  [0x4CA000, 0x4CAFFF, 'Ireland'],
  [0x738000, 0x73FFFF, 'Israel'],
  [0x300000, 0x33FFFF, 'Italy'],
  [0xBE000, 0xBEFFF, 'Jamaica'],
  [0x840000, 0x87FFFF, 'Japan'],
  [0x740000, 0x747FFF, 'Jordan'],
  [0x683000, 0x6833FF, 'Kazakhstan'],
  [0x4C000, 0x4CFFF, 'Kenya'],
  [0xC8E000, 0xC8E3FF, 'Kiribati'],
  [0x706000, 0x706FFF, 'Kuwait'],
  [0x601000, 0x6013FF, 'Kyrgyzstan'],
  [0x708000, 0x708FFF, "Lao People's Democratic Republic"],
  [0x502C00, 0x502FFF, 'Latvia'],
  [0x748000, 0x74FFFF, 'Lebanon'],
  [0x4A000, 0x4A3FF, 'Lesotho'],
  [0x50000, 0x50FFF, 'Liberia'],
  [0x18000, 0x1FFFF, 'Libyan Arab Jamahiriya'],
  [0x503C00, 0x503FFF, 'Lithuania'],
  [0x4D0000, 0x4D03FF, 'Luxembourg'],
  [0x54000, 0x54FFF, 'Madagascar'],
  [0x58000, 0x58FFF, 'Malawi'],
  [0x750000, 0x757FFF, 'Malaysia'],
  [0x5A000, 0x5A3FF, 'Maldives'],
  [0x5C000, 0x5CFFF, 'Mali'],
  [0x4D2000, 0x4D23FF, 'Malta'],
  [0x900000, 0x9003FF, 'Marshall Islands'],
  [0x5E000, 0x5E3FF, 'Mauritania'],
  [0x60000, 0x603FF, 'Mauritius'],
  [0xD0000, 0xD7FFF, 'Mexico'],
  [0x681000, 0x6813FF, 'Micronesia, Federated States of'],
  [0x4D4000, 0x4D43FF, 'Monaco'],
  [0x682000, 0x6823FF, 'Mongolia'],
  [0x516000, 0x5163FF, 'Montenegro'],
  [0x20000, 0x27FFF, 'Morocco'],
  [0x6000, 0x6FFF, 'Mozambique'],
  [0x704000, 0x704FFF, 'Myanmar'],
  [0x201000, 0x2013FF, 'Namibia'],
  [0xC8A000, 0xC8A3FF, 'Nauru'],
  [0x70A000, 0x70AFFF, 'Nepal'],
  [0x480000, 0x487FFF, 'Netherlands, Kingdom of the'],
  [0xC80000, 0xC87FFF, 'New Zealand'],
  [0xC0000, 0xC0FFF, 'Nicaragua'],
  [0x62000, 0x62FFF, 'Niger'],
  [0x64000, 0x64FFF, 'Nigeria'],
  [0x478000, 0x47FFFF, 'Norway'],
  [0x70C000, 0x70C3FF, 'Oman'],
  [0x760000, 0x767FFF, 'Pakistan'],
  [0x684000, 0x6843FF, 'Palau'],
  [0xC2000, 0xC2FFF, 'Panama'],
  [0x898000, 0x898FFF, 'Papua New Guinea'],
  [0xE88000, 0xE88FFF, 'Paraguay'],
  [0xE8C000, 0xE8CFFF, 'Peru'],
  [0x758000, 0x75FFFF, 'Philippines'],
  [0x488000, 0x48FFFF, 'Poland'],
  [0x490000, 0x497FFF, 'Portugal'],
  [0x6A000, 0x6A3FF, 'Qatar'],
  [0x718000, 0x71FFFF, 'Republic of Korea'],
  [0x504C00, 0x504FFF, 'Republic of Moldova'],
  [0x4A0000, 0x4A7FFF, 'Romania'],
  [0x100000, 0x1FFFFF, 'Russian Federation'],
  [0x6E000, 0x6EFFF, 'Rwanda'],
  [0xC8C000, 0xC8C3FF, 'Saint Lucia'],
  [0xBC000, 0xBC3FF, 'Saint Vincent and the Grenadines'],
  [0x902000, 0x9023FF, 'Samoa'],
  [0x500000, 0x5003FF, 'San Marino'],
  [0x9E000, 0x9E3FF, 'Sao Tome and Principe'],
  [0x710000, 0x717FFF, 'Saudi Arabia'],
  [0x70000, 0x70FFF, 'Senegal'],
  [0x4C0000, 0x4C7FFF, 'Serbia'],
  [0x74000, 0x743FF, 'Seychelles'],
  [0x76000, 0x763FF, 'Sierra Leone'],
  [0x768000, 0x76FFFF, 'Singapore'],
  [0x505C00, 0x505FFF, 'Slovakia'],
  [0x506C00, 0x506FFF, 'Slovenia'],
  [0x897000, 0x8973FF, 'Solomon Islands'],
  [0x78000, 0x78FFF, 'Somalia'],
  [0x8000, 0xFFFF, 'South Africa'],
  [0x340000, 0x37FFFF, 'Spain'],
  [0x770000, 0x777FFF, 'Sri Lanka'],
  [0x7C000, 0x7CFFF, 'Sudan'],
  [0xC8000, 0xC8FFF, 'Suriname'],
  [0x7A000, 0x7A3FF, 'Swaziland'],
  [0x4A8000, 0x4AFFFF, 'Sweden'],
  [0x4B0000, 0x4B7FFF, 'Switzerland'],
  [0x778000, 0x77FFFF, 'Syrian Arab Republic'],
  [0x515000, 0x5153FF, 'Tajikistan'],
  [0x880000, 0x887FFF, 'Thailand'],
  [0x512000, 0x5123FF, 'The former Yugoslav Republic of Macedonia'],
  [0x88000, 0x88FFF, 'Togo'],
  [0xC8D000, 0xC8D3FF, 'Tonga'],
  [0xC6000, 0xC6FFF, 'Trinidad and Tobago'],
  [0x28000, 0x2FFFF, 'Tunisia'],
  [0x4B8000, 0x4BFFFF, 'Turkey'],
  [0x601800, 0x601BFF, 'Turkmenistan'],
  [0x68000, 0x68FFF, 'Uganda'],
  [0x508000, 0x50FFFF, 'Ukraine'],
  [0x896000, 0x896FFF, 'United Arab Emirates'],
  [0x400000, 0x43FFFF, 'United Kingdom'],
  [0x80000, 0x80FFF, 'United Republic of Tanzania'],
  [0xA00000, 0xAFFFFF, 'United States'],
  [0xE90000, 0xE90FFF, 'Uruguay'],
  [0x507C00, 0x507FFF, 'Uzbekistan'],
  [0xC90000, 0xC903FF, 'Vanuatu'],
  [0xD8000, 0xDFFFF, 'Venezuela'],
  [0x888000, 0x88FFFF, 'Viet Nam'],
  [0x890000, 0x890FFF, 'Yemen'],
  [0x8A000, 0x8AFFF, 'Zambia'],
  [0x4000, 0x43FF, 'Zimbabwe'],
]

const PLANESPOTTERS_PHOTO_API = 'https://api.planespotters.net/pub/photos/hex'

function countryFromHex(hex) {
  const normalized = String(hex || '').trim().toLowerCase()
  if (!/^[0-9a-f]{6}$/.test(normalized)) return null
  const addr = parseInt(normalized, 16)
  if (Number.isNaN(addr)) return null
  for (const [start, end, country] of ICAO_COUNTRY_RANGES) {
    if (addr < start || addr > end) continue
    if (country.startsWith('Unassigned') || country.startsWith('ICAO (')) return null
    return country
  }
  return null
}

function parsePlanespottersPhoto(json) {
  const photo = json?.photos?.[0]
  if (!photo) return null
  const src = photo?.thumbnail_large?.src || photo?.thumbnail?.src
  if (!src) return null
  return {
    src,
    photographer: photo.photographer || 'Unknown',
    link: photo.link || null,
  }
}

async function fetchPlanespottersPhoto(hex, cache) {
  const key = String(hex).trim().toLowerCase()
  if (!/^[0-9a-f]{6}$/.test(key)) return null
  if (cache.has(key)) return cache.get(key)

  try {
    const res = await fetch(`${PLANESPOTTERS_PHOTO_API}/${key}`)
    if (!res.ok) {
      cache.set(key, null)
      return null
    }
    const json = await res.json()
    const parsed = parsePlanespottersPhoto(json)
    cache.set(key, parsed)
    return parsed
  } catch {
    cache.set(key, null)
    return null
  }
}

export {
  ICAO_COUNTRY_RANGES,
  PLANESPOTTERS_PHOTO_API,
  countryFromHex,
  parsePlanespottersPhoto,
  fetchPlanespottersPhoto,
}
