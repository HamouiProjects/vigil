export const FEEDS_TABS = [
  { id: 'flights',   label: 'Flights',   src: 'https://globe.adsbexchange.com/?lat=20&lon=0&zoom=3' },
  { id: 'weather',   label: 'Weather',   src: 'https://embed.windy.com/embed2.html?lat=20&lon=0&zoom=3&level=surface&overlay=wind&menu=&message=&marker=&calendar=&pressure=&type=map&location=coordinates&detail=&metricWind=kt&metricTemp=%C2%B0C&radarRange=-1' },
  { id: 'cyber',     label: 'Cyber',     src: 'https://threatmap.checkpoint.com/' },
  { id: 'wildfires', label: 'Wildfires', src: 'https://firms.modaps.eosdis.nasa.gov/map/' },
  { id: 'marine',    label: 'Marine',    src: 'https://www.myshiptracking.com/' },
]

export const CONFLICTS = [
  { name: 'Gaza',               lat:  31.35, lng:  34.30, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Palestine'   },
  { name: 'Kyiv Oblast',        lat:  50.45, lng:  30.52, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Ukraine'     },
  { name: 'Khartoum',           lat:  15.55, lng:  32.53, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Sudan'       },
  { name: 'Donbas',             lat:  48.01, lng:  37.80, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Ukraine'     },
  { name: 'West Bank',          lat:  31.95, lng:  35.30, category: 'conflict',   status: 'alert',   typeStr: 'Conflict',   country: 'Palestine'   },
  { name: 'Cabo Delgado',       lat: -12.33, lng:  40.51, category: 'earthquake', status: 'ongoing', typeStr: 'Violence',   country: 'Mozambique'  },
  { name: 'Sahel/Mali',         lat:  17.57, lng:  -4.00, category: 'drought',    status: 'ongoing', typeStr: 'Insecurity', country: 'Mali'        },
  { name: 'Rakhine/Myanmar',    lat:  20.14, lng:  92.90, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Myanmar'     },
  { name: 'South Kivu',         lat:  -2.99, lng:  28.85, category: 'earthquake', status: 'ongoing', typeStr: 'Violence',   country: 'DRC'         },
  { name: 'Idlib',              lat:  35.93, lng:  36.63, category: 'earthquake', status: 'ongoing', typeStr: 'Conflict',   country: 'Syria'       },
  { name: 'Hajjah/Yemen',       lat:  15.69, lng:  43.60, category: 'drought',    status: 'ongoing', typeStr: 'Insecurity', country: 'Yemen'       },
  { name: 'Tigray',             lat:  14.03, lng:  38.31, category: 'drought',    status: 'ongoing', typeStr: 'Insecurity', country: 'Ethiopia'    },
  { name: 'Borno/Nigeria',      lat:  11.85, lng:  13.15, category: 'other',      status: 'ongoing', typeStr: 'Insecurity', country: 'Nigeria'     },
  { name: 'Oromia',             lat:   8.00, lng:  38.00, category: 'other',      status: 'ongoing', typeStr: 'Insecurity', country: 'Ethiopia'    },
  { name: 'Kunduz',             lat:  36.72, lng:  68.87, category: 'other',      status: 'past',    typeStr: 'Conflict',   country: 'Afghanistan' },
  { name: 'Balochistan',        lat:  28.49, lng:  65.09, category: 'other',      status: 'ongoing', typeStr: 'Conflict',   country: 'Pakistan'    },
  { name: 'Manipur',            lat:  24.66, lng:  93.90, category: 'other',      status: 'ongoing', typeStr: 'Conflict',   country: 'India'       },
  { name: 'Abyei',              lat:   9.60, lng:  28.43, category: 'other',      status: 'ongoing', typeStr: 'Conflict',   country: 'Sudan'       },
  { name: 'Nakhchivan',         lat:  39.20, lng:  45.41, category: 'other',      status: 'past',    typeStr: 'Conflict',   country: 'Azerbaijan'  },
  { name: 'Marawi/Philippines', lat:   7.99, lng: 124.29, category: 'other',      status: 'past',    typeStr: 'Conflict',   country: 'Philippines' },
]

export const WILDFIRES_STATIC = [
  { name: 'Canadian Boreal Zone',  lat:  56.0, lng: -105.0, country: 'Canada'    },
  { name: 'Amazon Basin',          lat:  -8.0, lng:  -63.0, country: 'Brazil'    },
  { name: 'Siberia/Yakutia',       lat:  62.0, lng:  130.0, country: 'Russia'    },
  { name: 'SE Australia',          lat: -33.0, lng:  149.0, country: 'Australia' },
  { name: 'Greece/Mediterranean',  lat:  37.5, lng:   22.0, country: 'Greece'    },
  { name: 'California Corridor',   lat:  37.0, lng: -119.0, country: 'USA'       },
  { name: 'Central Africa',        lat:  -5.0, lng:   25.0, country: 'DRC'       },
  { name: 'SE Asia Peatlands',     lat:   0.0, lng:  112.0, country: 'Indonesia' },
]

export const PIRACY_ZONES = [
  { name: 'Gulf of Guinea',    bounds: [[ 0, -3], [ 5, 10]] },
  { name: 'Strait of Malacca', bounds: [[ 1,100], [ 6,105]] },
  { name: 'Gulf of Aden',      bounds: [[11, 42], [16, 52]] },
  { name: 'Red Sea',           bounds: [[12, 32], [28, 44]] },
]

export const CMAP_STYLE = {
  conflict:   { size: 14, color: '#e8294a', pulse: true  },
  flood:      { size: 10, color: '#4a9eff', pulse: false },
  earthquake: { size: 10, color: '#f07c2a', pulse: false },
  drought:    { size: 8,  color: '#f5c842', pulse: false },
  other:      { size: 8,  color: '#6e8098', pulse: false },
}
