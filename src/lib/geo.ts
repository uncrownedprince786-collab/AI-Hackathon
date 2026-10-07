/**
 * Country and region detection from the location text organizers publish.
 * Used for the global-coverage stats and the location filter. Pure string work:
 * nothing is invented, an unknown location simply has no country.
 */

interface RegionDef {
  label: string;
  countries: string[];
}

const REGIONS: RegionDef[] = [
  {
    label: "North America",
    countries: [
      "United States",
      "USA",
      "U.S.",
      "US",
      "Canada",
      "Mexico",
    ],
  },
  {
    label: "South America",
    countries: [
      "Brazil",
      "Argentina",
      "Chile",
      "Colombia",
      "Peru",
      "Uruguay",
      "Ecuador",
      "Bolivia",
      "Venezuela",
      "Guyana",
      "Paraguay",
    ],
  },
  {
    label: "Europe",
    countries: [
      "United Kingdom",
      "UK",
      "England",
      "Scotland",
      "Ireland",
      "Spain",
      "Portugal",
      "France",
      "Germany",
      "Netherlands",
      "Belgium",
      "Switzerland",
      "Austria",
      "Sweden",
      "Norway",
      "Denmark",
      "Finland",
      "Poland",
      "Czechia",
      "Czech Republic",
      "Slovakia",
      "Hungary",
      "Romania",
      "Bulgaria",
      "Greece",
      "Croatia",
      "Serbia",
      "Ukraine",
      "Italy",
      "Estonia",
      "Latvia",
      "Lithuania",
      "Luxembourg",
      "Iceland",
      "Malta",
      "Cyprus",
      "Slovenia",
    ],
  },
  {
    label: "Middle East & Africa",
    countries: [
      "United Arab Emirates",
      "UAE",
      "Dubai",
      "Abu Dhabi",
      "Saudi Arabia",
      "Qatar",
      "Bahrain",
      "Kuwait",
      "Oman",
      "Jordan",
      "Israel",
      "Turkey",
      "Türkiye",
      "Egypt",
      "Morocco",
      "Nigeria",
      "Ghana",
      "Kenya",
      "South Africa",
      "Tunisia",
      "Algeria",
      "Ethiopia",
      "Uganda",
      "Tanzania",
      "Rwanda",
      "Senegal",
      "Ivory Coast",
      "Cote d'Ivoire",
      "Cameroon",
      "Zimbabwe",
      "Zambia",
      "Botswana",
      "Namibia",
      "Mauritius",
    ],
  },
  {
    label: "Asia Pacific",
    countries: [
      "India",
      "Pakistan",
      "Bangladesh",
      "Sri Lanka",
      "Nepal",
      "China",
      "Hong Kong",
      "Taiwan",
      "Japan",
      "South Korea",
      "Korea",
      "Singapore",
      "Malaysia",
      "Indonesia",
      "Thailand",
      "Vietnam",
      "Philippines",
      "Australia",
      "New Zealand",
      "Cambodia",
      "Myanmar",
      "Mongolia",
      "Brunei",
    ],
  },
  {
    label: "Caribbean",
    countries: ["Puerto Rico", "Dominican Republic", "Jamaica", "Trinidad and Tobago", "Bahamas"],
  },
  {
    label: "Latin America",
    countries: ["Latin America", "LATAM", "Central America"],
  },
];

const REGION_BY_COUNTRY = new Map<string, string>();
for (const region of REGIONS) {
  for (const country of region.countries) {
    REGION_BY_COUNTRY.set(country.toLowerCase(), region.label);
  }
}

/** Canonical display name for the countries we recognise. */
const CANONICAL = new Map<string, string>();
for (const region of REGIONS) {
  for (const country of region.countries) {
    const key = country.toLowerCase();
    // Skip ambiguous aliases like "US"/"UK" when a longer name exists.
    if (!CANONICAL.has(key) || country.length > (CANONICAL.get(key)?.length ?? 0)) {
      CANONICAL.set(key, country);
    }
  }
}

const CITY_ALIASES: Record<string, string> = {
  "san francisco": "United States",
  "new york": "United States",
  "seattle": "United States",
  "austin": "United States",
  "boston": "United States",
  "chicago": "United States",
  "los angeles": "United States",
  "atlanta": "United States",
  "miami": "United States",
  "denver": "United States",
  "houston": "United States",
  "dallas": "United States",
  "washington dc": "United States",
  "palo alto": "United States",
  "mountain view": "United States",
  toronto: "Canada",
  "vancouver": "Canada",
  montreal: "Canada",
  "mexico city": "Mexico",
  "sao paulo": "Brazil",
  "são paulo": "Brazil",
  "rio de janeiro": "Brazil",
  "buenos aires": "Argentina",
  "santiago": "Chile",
  bogota: "Colombia",
  lima: "Peru",
  london: "United Kingdom",
  manchester: "United Kingdom",
  edinburgh: "United Kingdom",
  dublin: "Ireland",
  amsterdam: "Netherlands",
  rotterdam: "Netherlands",
  berlin: "Germany",
  munich: "Germany",
  "munich de": "Germany",
  hamburg: "Germany",
  paris: "France",
  lyon: "France",
  barcelona: "Spain",
  madrid: "Spain",
  lisbon: "Portugal",
  zurich: "Switzerland",
  "zurich ch": "Switzerland",
  geneva: "Switzerland",
  vienna: "Austria",
  stockholm: "Sweden",
  oslo: "Norway",
  copenhagen: "Denmark",
  helsinki: "Finland",
  reykjavik: "Iceland",
  warsaw: "Poland",
  krakow: "Poland",
  kraków: "Poland",
  prague: "Czechia",
  milan: "Italy",
  rome: "Italy",
  roma: "Italy",
  athens: "Greece",
  dubai: "United Arab Emirates",
  "dubai uae": "United Arab Emirates",
  "abu dhabi": "United Arab Emirates",
  "abu dhabi uae": "United Arab Emirates",
  "sao paulo br": "Brazil",
  riyadh: "Saudi Arabia",
  doha: "Qatar",
  telaviv: "Israel",
  "tel aviv": "Israel",
  istanbul: "Turkey",
  "istanbul turkey": "Turkey",
  cairo: "Egypt",
  lagos: "Nigeria",
  "lagos nigeria": "Nigeria",
  nairobi: "Kenya",
  "cape town": "South Africa",
  johannesburg: "South Africa",
  accra: "Ghana",
  casablanca: "Morocco",
  bengaluru: "India",
  bangalore: "India",
  mumbai: "India",
  delhi: "India",
  "new delhi": "India",
  hyderabad: "India",
  chennai: "India",
  pune: "India",
  gurgaon: "India",
  noida: "India",
  karachi: "Pakistan",
  lahore: "Pakistan",
  dhaka: "Bangladesh",
  colombo: "Sri Lanka",
  shanghai: "China",
  beijing: "China",
  shenzhen: "China",
  "hong kong": "Hong Kong",
  taipei: "Taiwan",
  tokyo: "Japan",
  osaka: "Japan",
  seoul: "South Korea",
  suwon: "South Korea",
  singapore: "Singapore",
  kuala: "Malaysia",
  "kuala lumpur": "Malaysia",
  jakarta: "Indonesia",
  bali: "Indonesia",
  manila: "Philippines",
  bangkok: "Thailand",
  "ho chi minh": "Vietnam",
  hanoi: "Vietnam",
  sydney: "Australia",
  melbourne: "Australia",
  perth: "Australia",
  brisbane: "Australia",
  auckland: "New Zealand",
  wellington: "New Zealand",
  "san juan": "Puerto Rico",
  "santo domingo": "Dominican Republic",
  montevideo: "Uruguay",
};

const GENERIC = /^(worldwide|global|online|virtual|remote|anywhere|internet|world|earth|n\/a|na|tbd|-)$/i;

/** Normalises separators so "São Paulo, Brazil" and "São Paulo BR" both match. */
function normalise(location: string): string {
  return location
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9,.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectCountry(location: string | undefined): string | undefined {
  if (!location) return undefined;
  const text = normalise(location);
  if (!text || GENERIC.test(text)) return undefined;

  for (const [alias, country] of Object.entries(CITY_ALIASES)) {
    if (text.includes(alias)) return country;
  }

  // Longest match first so "United States" wins over "United".
  const candidates = [...CANONICAL.keys()].sort((a, b) => b.length - a.length);
  for (const key of candidates) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) {
      return CANONICAL.get(key);
    }
  }
  return undefined;
}

export function detectRegion(location: string | undefined): string | undefined {
  const country = detectCountry(location);
  if (country) return REGION_BY_COUNTRY.get(country.toLowerCase());

  const text = normalise(location ?? "");
  for (const region of REGIONS) {
    for (const name of region.countries) {
      if (text.includes(name.toLowerCase())) return region.label;
    }
  }
  return undefined;
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * First recognised city in a block of text (longest match wins), used by the
 * web collector when a page names no explicit location. Returns the city only
 * when it is a known venue city — anything else is left unlocated.
 */
export function findCityInText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const normalised = normalise(text);
  const entries = Object.entries(CITY_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias] of entries) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalised)) {
      return titleCase(alias);
    }
  }
  return undefined;
}

export const REGION_NAMES = REGIONS.map((r) => r.label);
