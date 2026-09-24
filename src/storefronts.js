// App Store storefronts: country code -> [name, iTunes storefront id].
// `ads: false` storefronts work for search/ranks but Apple Ads popularity is unavailable.
export const STOREFRONTS = {
  US: ['United States', 143441], GB: ['United Kingdom', 143444], CA: ['Canada', 143455],
  AU: ['Australia', 143460], NZ: ['New Zealand', 143461], IE: ['Ireland', 143449],
  DE: ['Germany', 143443], FR: ['France', 143442], IT: ['Italy', 143450], ES: ['Spain', 143454],
  PT: ['Portugal', 143453], NL: ['Netherlands', 143452], BE: ['Belgium', 143446], AT: ['Austria', 143445],
  CH: ['Switzerland', 143459], SE: ['Sweden', 143456], NO: ['Norway', 143457], DK: ['Denmark', 143458],
  FI: ['Finland', 143447], PL: ['Poland', 143478], CZ: ['Czech Republic', 143489], HU: ['Hungary', 143482],
  RO: ['Romania', 143487], BG: ['Bulgaria', 143526], GR: ['Greece', 143448], TR: ['Turkey', 143480],
  RU: ['Russia', 143469], UA: ['Ukraine', 143492], JP: ['Japan', 143462], KR: ['South Korea', 143466],
  CN: ['China', 143465], TW: ['Taiwan', 143470], HK: ['Hong Kong', 143463], SG: ['Singapore', 143464],
  MY: ['Malaysia', 143473], TH: ['Thailand', 143475], VN: ['Vietnam', 143471], ID: ['Indonesia', 143476],
  PH: ['Philippines', 143474], IN: ['India', 143467], PK: ['Pakistan', 143477], SA: ['Saudi Arabia', 143479],
  AE: ['United Arab Emirates', 143481], IL: ['Israel', 143491], EG: ['Egypt', 143516], ZA: ['South Africa', 143472],
  KE: ['Kenya', 143529], BR: ['Brazil', 143503], MX: ['Mexico', 143468], AR: ['Argentina', 143505],
  CL: ['Chile', 143483], CO: ['Colombia', 143501], PE: ['Peru', 143507], LK: ['Sri Lanka', 143486],
  NP: ['Nepal', 143484], MO: ['Macau', 143515], AM: ['Armenia', 143524],
  HR: ['Croatia', 143494, false], SK: ['Slovakia', 143496, false], LT: ['Lithuania', 143520, false],
  LV: ['Latvia', 143519, false], EE: ['Estonia', 143518, false],
};

// Apple's store search needs a language id that the storefront accepts (checked 2026-09-24). Every
// storefront tested also accepts 2 (en-GB), used when the native id isn't known yet.
const LANGUAGE_IDS = { US: 1, GB: 2, FR: 3, DE: 4, CA: 6, JP: 9, KR: 13, CN: 19, AU: 27 };
export const languageId = (code) => LANGUAGE_IDS[String(code).toUpperCase()] ?? 2;

export function storefront(code) {
  const cc = String(code || '').toUpperCase();
  const entry = STOREFRONTS[cc];
  if (!entry) return null;
  return { code: cc, name: entry[0], id: entry[1], ads: entry[2] !== false };
}

export function listStorefronts() {
  return Object.keys(STOREFRONTS).map(storefront);
}
