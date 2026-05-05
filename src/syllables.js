const VOWELS = "aeiouy";

export function normalizeWord(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^[^a-z']+|[^a-z']+$/g, "")
    .replace(/'s$/g, "");
}

export function tokenize(text) {
  return String(text ?? "")
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

export function splitSyllables(word) {
  const normalized = normalizeWord(word);

  if (!normalized) {
    return [];
  }

  if (SPECIAL_SYLLABLES.has(normalized)) {
    return SPECIAL_SYLLABLES.get(normalized);
  }

  const chars = [...normalized];
  const vowelGroups = [];
  let groupStart = -1;

  for (let i = 0; i < chars.length; i += 1) {
    const isVowel = VOWELS.includes(chars[i]);
    if (isVowel && groupStart === -1) {
      groupStart = i;
    }
    if ((!isVowel || i === chars.length - 1) && groupStart !== -1) {
      const end = isVowel && i === chars.length - 1 ? i : i - 1;
      vowelGroups.push([groupStart, end]);
      groupStart = -1;
    }
  }

  if (normalized.endsWith("e") && vowelGroups.length > 1) {
    const last = vowelGroups.at(-1);
    if (last[0] === normalized.length - 1) {
      vowelGroups.pop();
    }
  }

  if (vowelGroups.length <= 1) {
    return [normalized];
  }

  const syllables = [];
  let start = 0;

  for (let i = 0; i < vowelGroups.length - 1; i += 1) {
    const currentEnd = vowelGroups[i][1];
    const nextStart = vowelGroups[i + 1][0];
    const consonantsBetween = nextStart - currentEnd - 1;
    let boundary = currentEnd + 1;

    if (consonantsBetween > 1) {
      boundary = currentEnd + Math.ceil(consonantsBetween / 2);
    }

    syllables.push(normalized.slice(start, boundary + 1));
    start = boundary + 1;
  }

  syllables.push(normalized.slice(start));
  return syllables.filter(Boolean);
}

const SPECIAL_SYLLABLES = new Map([
  ["about", ["a", "bout"]],
  ["above", ["a", "bove"]],
  ["afraid", ["a", "fraid"]],
  ["again", ["a", "gain"]],
  ["ago", ["a", "go"]],
  ["alone", ["a", "lone"]],
  ["around", ["a", "round"]],
  ["away", ["a", "way"]],
  ["because", ["be", "cause"]],
  ["begin", ["be", "gin"]],
  ["city", ["cit", "y"]],
  ["comic", ["com", "ic"]],
  ["happy", ["hap", "py"]],
  ["hotel", ["ho", "tel"]],
  ["introduction", ["in", "tro", "duc", "tion"]],
  ["music", ["mu", "sic"]],
  ["nation", ["na", "tion"]],
  ["police", ["po", "lice"]],
  ["polite", ["po", "lite"]],
  ["record", ["re", "cord"]],
  ["student", ["stu", "dent"]],
  ["teacher", ["teach", "er"]]
]);
