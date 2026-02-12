import { Group } from './interfaces';

/**
 * Mapping of English instrument names to German and Russian equivalents
 */
const INSTRUMENT_TRANSLATIONS: Record<string, string[]> = {
  // Strings
  'violin': ['violine', 'geige', 'скрипка', 'skripka', 'violino'],
  'viola': ['bratsche', 'альт', 'alt'],
  'cello': ['violoncello', 'виолончель', 'violonchel'],
  'double bass': ['kontrabass', 'контрабас', 'kontrabas', 'contrabasso'],
  'contrabass': ['kontrabass', 'контрабас', 'kontrabas', 'contrabasso'],
  'bass': ['kontrabass', 'bass', 'бас', 'контрабас', 'basso'],
  'harp': ['harfe', 'арфа', 'arfa', 'arpa'],

  // Woodwinds
  'flute': ['flöte', 'querflöte', 'флейта', 'fleita', 'flauta', 'flauto'],
  'piccolo': ['pikkoloflöte', 'piccolo', 'пикколо', 'малая флейта', 'ottavino'],
  'oboe': ['oboe', 'гобой', 'goboi', 'goboj'],
  'clarinet': ['klarinette', 'кларнет', 'klarnet', 'clarinetto'],
  'bassoon': ['fagott', 'фагот', 'fagot', 'fagotto'],
  'contrabassoon': ['kontrafagott', 'контрафагот', 'kontrafagot', 'contrafagotto'],
  'recorder': ['blockflöte', 'блокфлейта', 'blokfleita', 'flauto dolce'],
  'saxophone': ['saxophon', 'saxofon', 'саксофон', 'saksofon', 'sassofono'],

  // Brass
  'trumpet': ['trompete', 'труба', 'truba', 'tromba'],
  'horn': ['horn', 'waldhorn', 'валторна', 'valtorna', 'рог', 'corno'],
  'french horn': ['waldhorn', 'horn', 'валторна', 'valtorna', 'corno'],
  'trombone': ['posaune', 'тромбон', 'trombon'],
  'tuba': ['tuba', 'туба'],
  'euphonium': ['euphonium', 'bariton', 'эуфониум', 'баритон', 'eufonio'],
  'cornet': ['kornett', 'корнет', 'kornet', 'cornetta'],

  // Percussion
  'timpani': ['pauke', 'pauken', 'литавры', 'litavry', 'litavri'],
  'drums': ['schlagzeug', 'ударные', 'барабан', 'baraban', 'batteria'],
  'percussion': ['schlagwerk', 'schlagzeug', 'ударные', 'udarnye', 'percussioni'],
  'snare': ['kleine trommel', 'малый барабан', 'rullante'],
  'bass drum': ['große trommel', 'большой барабан', 'gran cassa'],
  'cymbals': ['becken', 'тарелки', 'tarelki', 'piatti'],
  'triangle': ['triangel', 'треугольник', 'treugolnik', 'triangolo'],
  'xylophone': ['xylophon', 'ксилофон', 'ksilofon', 'xilofono'],
  'glockenspiel': ['glockenspiel', 'колокольчики', 'kolokolchiki', 'campanelli'],
  'marimba': ['marimba', 'marimbaphon', 'маримба'],
  'vibraphone': ['vibraphon', 'вибрафон', 'vibrafon', 'vibrafono'],

  // Keyboards
  'piano': ['klavier', 'фортепиано', 'fortepiano', 'пианино', 'рояль', 'royal', 'pianoforte'],
  'organ': ['orgel', 'орган', 'organo'],
  'harpsichord': ['cembalo', 'клавесин', 'klavesin', 'clavicembalo'],
  'celesta': ['celesta', 'челеста', 'chelesta'],
  'keyboard': ['keyboard', 'tastatur', 'клавишные', 'tastiera'],

  // Voice
  'soprano': ['sopran', 'сопрано'],
  'alto': ['alt', 'альт', 'contralto'],
  'tenor': ['tenor', 'тенор', 'tenore'],
  'baritone': ['bariton', 'баритон', 'baritono'],
  'bass voice': ['bass', 'бас', 'basso'],

  // Other
  'guitar': ['gitarre', 'гитара', 'gitara', 'chitarra'],
  'mandolin': ['mandoline', 'мандолина', 'mandolina', 'mandolino'],
  'banjo': ['banjo', 'банджо', 'bandzho'],
  'accordion': ['akkordeon', 'аккордеон', 'баян', 'bayan', 'гармонь', 'fisarmonica'],
};

/**
 * Common abbreviations used in sheet music
 */
const ABBREVIATIONS: Record<string, string[]> = {
  'vl': ['violin', 'violine', 'geige', 'скрипка'],
  'vln': ['violin', 'violine', 'geige', 'скрипка'],
  'vla': ['viola', 'bratsche', 'альт'],
  'vc': ['cello', 'violoncello', 'виолончель'],
  'vcl': ['cello', 'violoncello', 'виолончель'],
  'cb': ['kontrabass', 'contrabass', 'контрабас'],
  'kb': ['kontrabass', 'контрабас'],
  'fl': ['flöte', 'flute', 'флейта'],
  'ob': ['oboe', 'гобой'],
  'cl': ['klarinette', 'clarinet', 'кларнет'],
  'kl': ['klarinette', 'кларнет'],
  'fg': ['fagott', 'bassoon', 'фагот'],
  'bn': ['fagott', 'bassoon', 'фагот'],
  'bsn': ['fagott', 'bassoon', 'фагот'],
  'hr': ['horn', 'waldhorn', 'валторна'],
  'hn': ['horn', 'waldhorn', 'валторна'],
  'trp': ['trompete', 'trumpet', 'труба'],
  'tp': ['trompete', 'trumpet', 'труба'],
  'tpt': ['trompete', 'trumpet', 'труба'],
  'trb': ['posaune', 'trombone', 'тромбон'],
  'pos': ['posaune', 'trombone', 'тромбон'],
  'tb': ['tuba', 'туба'],
  'pk': ['pauke', 'pauken', 'timpani', 'литавры'],
  'timp': ['pauke', 'pauken', 'timpani', 'литавры'],
  'perc': ['schlagwerk', 'percussion', 'ударные'],
  'pf': ['klavier', 'piano', 'фортепиано'],
  'org': ['orgel', 'organ', 'орган'],
  'git': ['gitarre', 'guitar', 'гитара'],
  'acc': ['akkordeon', 'accordion', 'аккордеон', 'баян'],
  'sop': ['sopran', 'soprano', 'сопрано'],
  'ten': ['tenor', 'тенор'],
  'bar': ['bariton', 'baritone', 'баритон'],
  'sax': ['saxophon', 'saxophone', 'саксофон'],
  // Russian abbreviations
  'скр': ['скрипка', 'violin', 'violine'],
  'влч': ['виолончель', 'cello'],
  'к-б': ['контрабас', 'kontrabass'],
  'фл': ['флейта', 'flute', 'flöte'],
  'гоб': ['гобой', 'oboe'],
  'кл': ['кларнет', 'klarinette'],
  'фаг': ['фагот', 'fagott'],
  'тр': ['труба', 'trumpet', 'trompete'],
  'валт': ['валторна', 'horn'],
  'трб': ['тромбон', 'trombone', 'posaune'],
  'уд': ['ударные', 'percussion'],
  'ф-но': ['фортепиано', 'piano', 'klavier'],
};

/**
 * Roman numeral to Arabic number mapping (ordered longest first for correct replacement)
 */
const ROMAN_TO_ARABIC: [string, string][] = [
  ['viii', '8'],
  ['vii', '7'],
  ['iii', '3'],
  ['ii', '2'],
  ['iv', '4'],
  ['vi', '6'],
  ['ix', '9'],
  ['v', '5'],
  ['x', '10'],
  ['i', '1'],
];

/**
 * Normalizes a filename for better matching:
 * - Converts to lowercase
 * - Replaces separators with spaces
 * - Converts Roman numerals to Arabic
 * - Removes file extension
 */
export function normalizeFilename(filename: string): string {
  let normalized = filename
    .normalize()
    .toLowerCase()
    // Remove file extension
    .replace(/\.[^.]+$/, '')
    // Replace common separators with spaces
    .replace(/[_\-\.]/g, ' ')
    // Remove multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  // Convert Roman numerals to Arabic (only when they appear as standalone words)
  // Process in order (longest first) to avoid partial matches
  for (const [roman, arabic] of ROMAN_TO_ARABIC) {
    // Match Roman numeral as a standalone word (not part of another word)
    const regex = new RegExp(`\\b${roman}\\b`, 'gi');
    normalized = normalized.replace(regex, arabic);
  }

  return normalized;
}

/**
 * Generates all possible name variations for an instrument
 * including translations, abbreviations, and number variations
 */
export function generateInstrumentVariations(instrumentName: string): string[] {
  const variations: Set<string> = new Set();
  const normalizedName = normalizeFilename(instrumentName);

  variations.add(normalizedName);

  // Check if this instrument has translations
  for (const [english, variants] of Object.entries(INSTRUMENT_TRANSLATIONS)) {
    const normalizedEnglish = normalizeFilename(english);
    const numberMatch = normalizedName.match(/\d+/);

    // If the instrument name matches any variant (including English key), add ALL variants
    const matchesEnglish = normalizedName.includes(normalizedEnglish);
    const matchesVariant = variants.some(v => normalizedName.includes(normalizeFilename(v)));

    if (matchesEnglish || matchesVariant) {
      // Add English
      variations.add(normalizedEnglish);
      if (numberMatch) {
        variations.add(`${normalizedEnglish} ${numberMatch[0]}`);
      }

      // Add all variants (German, Russian, Italian, etc.)
      for (const variant of variants) {
        const normalizedVariant = normalizeFilename(variant);
        variations.add(normalizedVariant);
        if (numberMatch) {
          variations.add(`${normalizedVariant} ${numberMatch[0]}`);
        }
      }
    }
  }

  // Add abbreviation expansions
  for (const [abbr, expansions] of Object.entries(ABBREVIATIONS)) {
    for (const expansion of expansions) {
      if (normalizedName.includes(normalizeFilename(expansion))) {
        variations.add(abbr);
        const numberMatch = normalizedName.match(/\d+/);
        if (numberMatch) {
          variations.add(`${abbr} ${numberMatch[0]}`);
          variations.add(`${abbr}${numberMatch[0]}`);
        }
      }
    }
  }

  return Array.from(variations);
}

/**
 * Attempts to match a filename against a list of instruments
 * Returns the matched instrument or null if no match found
 */
export function matchInstrument(filename: string, instruments: Group[]): Group | null {
  const normalizedFilename = normalizeFilename(filename);

  // Sort instruments by name length (longest first) to prefer more specific matches
  // e.g., "Violine 1" should match before "Violine"
  const sortedInstruments = [...instruments].sort((a, b) => b.name.length - a.name.length);

  // First pass: exact substring match with instrument name
  for (const instrument of sortedInstruments) {
    const normalizedInstrumentName = normalizeFilename(instrument.name);

    if (normalizedFilename.includes(normalizedInstrumentName)) {
      return instrument;
    }

    // Check synonyms
    if (instrument.synonyms) {
      const synonyms = instrument.synonyms.split(',').map(s => normalizeFilename(s.trim()));
      if (synonyms.some(syn => normalizedFilename.includes(syn))) {
        return instrument;
      }
    }
  }

  // Second pass: check against generated variations (translations, abbreviations)
  for (const instrument of sortedInstruments) {
    const variations = generateInstrumentVariations(instrument.name);

    // Also add synonym variations
    if (instrument.synonyms) {
      const synonyms = instrument.synonyms.split(',').map(s => s.trim());
      for (const synonym of synonyms) {
        variations.push(...generateInstrumentVariations(synonym));
      }
    }

    for (const variation of variations) {
      if (normalizedFilename.includes(variation)) {
        return instrument;
      }
    }
  }

  // Third pass: check abbreviations in filename
  for (const [abbr, expansions] of Object.entries(ABBREVIATIONS)) {
    // Check if abbreviation appears as a word boundary in filename
    const abbrRegex = new RegExp(`\\b${abbr}\\b`, 'i');
    if (abbrRegex.test(normalizedFilename)) {
      // Try to find matching instrument
      for (const expansion of expansions) {
        for (const instrument of sortedInstruments) {
          const normalizedInstrumentName = normalizeFilename(instrument.name);
          if (normalizedInstrumentName.includes(normalizeFilename(expansion))) {
            // Check for number match (e.g., "vl1" should match "Violine 1" not "Violine 2")
            const filenameNumber = normalizedFilename.match(/\d+/);
            const instrumentNumber = normalizedInstrumentName.match(/\d+/);

            if (filenameNumber && instrumentNumber) {
              if (filenameNumber[0] === instrumentNumber[0]) {
                return instrument;
              }
            } else if (!filenameNumber && !instrumentNumber) {
              return instrument;
            } else if (filenameNumber && !instrumentNumber) {
              // Filename has number but instrument doesn't - might still match
              return instrument;
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Detects special file types based on filename
 * Returns a category note or null
 */
export function detectSpecialFileType(filename: string, mimeType: string): { instrumentId: number | null; note?: string } | null {
  const normalizedFilename = normalizeFilename(filename);

  // Audio files
  if (mimeType.startsWith('audio/')) {
    return { instrumentId: 1 }; // "Aufnahme"
  }

  // Sibelius files
  if (filename.toLowerCase().includes('.sib')) {
    return { instrumentId: null, note: 'Sibelius' };
  }

  // Piano reduction (check BEFORE Score to handle "vocal score")
  if (normalizedFilename.includes('klavierauszug') ||
    normalizedFilename.includes('piano reduction') ||
    normalizedFilename.includes('vocal score') ||
    normalizedFilename.includes('клавир') ||
    normalizedFilename.includes('klavir') ||
    normalizedFilename.includes('переложение')) {
    return { instrumentId: null, note: 'Klavierauszug' };
  }

  // Score/Partitur
  if (normalizedFilename.includes('partitur') ||
    normalizedFilename.includes('score') ||
    normalizedFilename.includes('full') ||
    normalizedFilename.includes('conductor') ||
    normalizedFilename.includes('партитура') ||
    normalizedFilename.includes('partitura') ||
    normalizedFilename.includes('дирижер') ||
    normalizedFilename.includes('dirizher')) {
    return { instrumentId: null, note: 'Partitur' };
  }

  // Lyrics/Liedtext
  if (normalizedFilename.includes('liedtext') ||
    normalizedFilename.includes('lyrics') ||
    normalizedFilename.includes('text') ||
    normalizedFilename.includes('words') ||
    normalizedFilename.includes('текст') ||
    normalizedFilename.includes('tekst') ||
    normalizedFilename.includes('слова') ||
    normalizedFilename.includes('slova')) {
    return { instrumentId: 2 }; // "Liedtext"
  }

  // Choir parts
  if (normalizedFilename.includes('chor') ||
    normalizedFilename.includes('choir') ||
    normalizedFilename.includes('choral') ||
    normalizedFilename.includes('хор') ||
    normalizedFilename.includes('khor') ||
    normalizedFilename.includes('хоровая')) {
    return { instrumentId: null, note: 'Chor' };
  }

  return null;
}
