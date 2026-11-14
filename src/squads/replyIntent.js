/**
 * Classifies informal Spanish replies to a squad notice ("en 20", "como y voy",
 * "deja de joder"...) into an intent, tolerating typos and repeated letters.
 *
 * Precedence: UNKNOWN overrides ("no se") > COMING overrides ("no hay drama") > NOT_COMING > LATE > COMING.
 * With "pero", the clause after the last one decides when it is recognizable.
 */
export const ReplyIntent = Object.freeze({
  COMING: 'coming',
  LATE: 'late',
  NOT_COMING: 'not_coming',
  UNKNOWN: 'unknown',
});

// Expressions that contain answer words but answer nothing.
const UNKNOWN_OVERRIDES = ['no se', 'nose', 'ni idea', 'no tengo idea', 'ni puta idea'];

// Expressions that look negative but mean "yes".
const COMING_OVERRIDES = ['no hay drama', 'no hay problema', 'no hay bardo', 'no pasa nada', 'obvio que si'];

const NOT_COMING = [
  // Plain refusals
  'no estoy', 'no puedo', 'no voy', 'no entro', 'no juego', 'no llego', 'no me da', 'no da', 'no gracias',
  'hoy no', 'ahora no', 'yo no', 'paso', 'paso hoy', 'hoy paso', 'nop', 'nope', 'nah', 'nel', 'ni ahi',
  'ni en pedo', 'ni a palos', 'ni loco', 'ni da', 'imposible', 'olvidate', 'olvidense', 'descartame',
  'no cuenten conmigo', 'sin mi', 'otro dia', 'otra vez sera', 'otra vez', 'la proxima', 'manana',
  'no tengo ganas', 'sin ganas', 'que paja', 'me da paja', 'no tengo tiempo',
  // Annoyed
  'deja de joder', 'dejen de joder', 'deja de romper', 'dejen de romper', 'no jodas', 'no jodan', 'no rompas',
  'basta', 'callate', 'dejame', 'dejenme', 'dejame en paz', 'que pesado', 'que pesados', 'spam',
  // Busy / away
  'estoy ocupado', 'estoy ocupada', 'ocupado', 'ocupada', 'estoy laburando', 'estoy trabajando', 'laburando',
  'trabajando', 'estoy estudiando', 'tengo que estudiar', 'estoy rindiendo', 'tengo examen', 'tengo parcial',
  'estoy en el laburo', 'estoy en el trabajo', 'me voy a dormir', 'me voy a acostar', 'estoy durmiendo',
  'durmiendo', 'me acuesto', 'estoy cansado', 'estoy cansada', 'estoy muerto', 'estoy muerta', 'estoy reventado',
  'estoy afuera', 'estoy de viaje', 'de viaje', 'no estoy en casa', 'sali', 'estoy con mi novia',
  'estoy con mi novio', 'estoy con la familia', 'tengo un cumple', 'tengo cumple', 'estoy enfermo', 'estoy enferma',
  'no tengo la pc', 'no tengo pc', 'sin pc', 'sin internet', 'no tengo internet', 'se me corto internet',
  'se me rompio la pc', 'se corto la luz', 'sin luz',
  // Tucumano
  'novui', 'novua', 'me hago atras', 'me echo atras', 'hacerse atras', 'ni aca',
];

const LATE = [
  // Eating / cooking
  'como y voy', 'como y entro', 'ceno y voy', 'ceno y entro', 'cocino y voy', 'cocino y entro',
  'almuerzo y voy', 'meriendo y voy', 'termino de comer', 'termino de cenar', 'estoy comiendo', 'estoy cenando',
  'estoy cocinando', 'estoy almorzando', 'estoy merendando', 'estoy haciendo la comida', 'comiendo', 'cenando',
  'cocinando', 'almorzando', 'merendando', 'voy a comer', 'voy a cenar',
  // Bathing
  'me bano y voy', 'me bano y entro', 'me ducho y voy', 'me ducho y entro', 'me bano', 'me ducho',
  'estoy en la ducha', 'estoy en el bano', 'banandome', 'duchandome', 'salgo de la ducha',
  // Finishing something first
  'termino y voy', 'termino y entro', 'termino esta', 'termino la partida', 'termino esto', 'una y voy',
  'una partida y voy', 'salgo del laburo', 'salgo del trabajo', 'salgo de laburar', 'salgo de la facu',
  'salgo del colegio', 'cuando salga', 'cuando termine', 'cuando llegue', 'todavia no',
  // On the way
  'estoy volviendo', 'volviendo', 'estoy llegando', 'llegando', 'en camino', 'estoy en el bondi',
  'estoy en el colectivo', 'estoy saliendo', 'llego tarde', 'tardo un poco',
  // Wait for me
  'dame un rato', 'dame un toque', 'dame', 'un rato', 'en un rato', 'al rato', 'un toque', 'en un toque',
  'bancame', 'banquenme', 'banca', 'esperame', 'esperen', 'esperenme', 'aguanten', 'aguantame', 'ya casi',
  'casi', 'mas tarde', 'despues', 'luego voy', 'luego entro', 'en breve', 'enseguida', 'ahora voy',
  // Tucumano
  'cachito', 'un cacho', 'dame un cacho', 'mas luego', 'mas de un rato', 'enyantando', 'enyanto', 'estoy enyantando',
  'endenante', 'sol alto',
];

const COMING = [
  'voy', 'dale', 'me sumo', 'sumo', 'sumame', 'sumenme', 'me apunto', 'vamos', 'vamo', 'de una', 'ahi voy',
  'ya voy', 'ya entro', 'ahi entro', 'entro', 'si', 'sip', 'obvio', 'listo', 'joya', 'ok', 'oka', 'okey', 'va',
  'me prendo', 'cuenten conmigo', 'conmigo', 'estoy', 'aca estoy', 'yo juego', 'yo', 'prendo la pc',
  // Tucumano
  'yavui', 'metale',
];

// Tucumano "ok": only when they open the message ("meta, ahí vuí", not "la meta es ganar").
const COMING_OPENERS = new Set(['meta', 'keno']);

// Applied after normalizing each token.
const TOKEN_ALIASES = new Map([
  ['toy', 'estoy'], ['estoi', 'estoy'], ['stoy', 'estoy'], ['tamo', 'estamos'], ['boy', 'voy'], ['voi', 'voy'],
  ['vo', 'voy'], ['dps', 'despues'], ['dsp', 'despues'], ['dspues', 'despues'], ['q', 'que'], ['k', 'que'],
  ['xq', 'porque'], ['pq', 'porque'], ['nd', 'nada'], ['tb', 'tambien'], ['tmb', 'tambien'],
  // Tucumano: "vuí" / "vuá" (voy / voy a), "toi" (estoy), "atrá" (atrás), "noma" (nomás)
  ['vui', 'voy'], ['vua', 'voy'], ['toi', 'estoy'], ['atra', 'atras'], ['noma', 'nomas'],
]);

// Intensifiers and fillers that should not break a phrase ("estoy re cansado").
const FILLERS = new Set(['re', 'muy', 'mega', 'bastante', 'che', 'bro', 'boludo', 'boluda', 'wacho', 'amigo', 'man', 'eh', 'ah']);

function normalizeText(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/([a-z])\1+/g, '$1')
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter(Boolean)
    .map((t) => TOKEN_ALIASES.get(t) ?? t)
    .filter((t) => !FILLERS.has(t));
}

/** Optimal string alignment distance (Levenshtein plus adjacent transpositions). */
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Exact match, or one typo for keywords of 5+ letters inside a phrase and of 6+ letters
 * on their own (a lone "estoy" must not match "esto").
 */
function tokenMatches(input, keyword, phraseLength) {
  if (input === keyword) return true;
  const minLength = phraseLength > 1 ? 5 : 6;
  return keyword.length >= minLength && /^[a-z]+$/.test(input) && editDistance(input, keyword) <= 1;
}

const compile = (phrases) => phrases.map((p) => tokenize(p));

const PATTERNS = {
  unknown: compile(UNKNOWN_OVERRIDES),
  overrides: compile(COMING_OVERRIDES),
  notComing: compile(NOT_COMING),
  late: compile(LATE),
  coming: compile(COMING),
};

function containsPhrase(tokens, phrase) {
  for (let start = 0; start + phrase.length <= tokens.length; start++) {
    if (phrase.every((word, k) => tokenMatches(tokens[start + k], word, phrase.length))) return true;
  }
  return false;
}

/**
 * With `shortWordsInShortMessages`, a lone keyword of 5 letters or less ("paso", "basta")
 * only counts in messages of up to 2 words, so "paso el link" is not a refusal.
 */
function matchesAny(tokens, phrases, { shortWordsInShortMessages = false } = {}) {
  return phrases.some((phrase) => {
    if (shortWordsInShortMessages && phrase.length === 1 && phrase[0].length <= 5 && tokens.length > 2) return false;
    return containsPhrase(tokens, phrase);
  });
}

const NEGATIVE_OPENERS = new Set(['no', 'nop', 'nope', 'nah', 'na', 'nel']);

/** Minutes mentioned in the text ("en 20", "10 min", "media hora", "1h"), or null. */
export function extractMinutes(text) {
  const t = normalizeText(text);
  if (/\bun cuarto de hora\b/.test(t)) return 15;
  if (/\bmedia hora\b/.test(t)) return 30;
  if (/\buna hora\b/.test(t)) return 60;
  let m = t.match(/\b(\d{1,2}) ?(?:h|hs|hora|horas)\b/);
  if (m) return Number(m[1]) * 60;
  m = t.match(/\b(\d{1,3}) ?(?:m|min|mins|minuto|minutos)\b/);
  if (m) return Number(m[1]);
  m = t.match(/\b(?:en|dame|bancame|banca|esperame|esperen|esperenme|aguanten) (\d{1,3})\b/);
  if (m) return Number(m[1]);
  return null;
}

const UNKNOWN_RESULT = Object.freeze({ intent: ReplyIntent.UNKNOWN, minutes: null });

function classifyTokens(tokens) {
  if (tokens.length === 0 || matchesAny(tokens, PATTERNS.unknown)) return UNKNOWN_RESULT;
  if (matchesAny(tokens, PATTERNS.overrides)) return { intent: ReplyIntent.COMING, minutes: null };
  const opensNegative = NEGATIVE_OPENERS.has(tokens[0]) && tokens.length <= 3;
  if (opensNegative || matchesAny(tokens, PATTERNS.notComing, { shortWordsInShortMessages: true })) {
    return { intent: ReplyIntent.NOT_COMING, minutes: null };
  }

  const minutes = extractMinutes(tokens.join(' '));
  if (minutes !== null || matchesAny(tokens, PATTERNS.late)) return { intent: ReplyIntent.LATE, minutes };
  if (COMING_OPENERS.has(tokens[0]) || matchesAny(tokens, PATTERNS.coming)) return { intent: ReplyIntent.COMING, minutes: null };
  return UNKNOWN_RESULT;
}

/** Returns { intent, minutes } for a reply text. */
export function classifyReply(text) {
  const tokens = tokenize(text ?? '');
  const lastPero = tokens.lastIndexOf('pero');
  if (lastPero !== -1) {
    const tail = classifyTokens(tokens.slice(lastPero + 1));
    const head = classifyTokens(tokens.slice(0, lastPero));
    // "sol alto pero vuí": late but coming is still late.
    if (tail.intent === ReplyIntent.COMING && head.intent === ReplyIntent.LATE) return head;
    return tail.intent !== ReplyIntent.UNKNOWN ? tail : head;
  }
  return classifyTokens(tokens);
}
