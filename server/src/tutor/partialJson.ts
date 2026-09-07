/**
 * Pull the value of a top-level string key out of JSON that is still arriving.
 *
 * The tutor replies as a JSON object whose first key is `message`, so the prose
 * is readable long before the object closes. Streaming it lets the learner start
 * reading instead of watching a spinner, but the text has to be decoded from a
 * fragment that may end anywhere — including halfway through an escape sequence.
 *
 * Returns the decoded value so far, or null if the key has not started yet.
 */
export function extractPartialString(raw: string, key: string): string | null {
  const marker = `"${key}"`;
  const at = raw.indexOf(marker);
  if (at === -1) return null;

  // Skip past the key, its colon, and any whitespace, to the opening quote.
  let i = at + marker.length;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (raw[i] !== ':') return null;
  i++;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (raw[i] !== '"') return null;
  i++;

  let out = '';
  while (i < raw.length) {
    const ch = raw[i];

    if (ch === '"') return out; // closed cleanly
    if (ch !== '\\') {
      out += ch;
      i++;
      continue;
    }

    // Escape sequence. If it is cut off by the end of the fragment, stop here
    // and emit what we have rather than a stray backslash.
    const next = raw[i + 1];
    if (next === undefined) return out;

    switch (next) {
      case 'n':
        out += '\n';
        break;
      case 't':
        out += '\t';
        break;
      case 'r':
        out += '\r';
        break;
      case 'b':
        out += '\b';
        break;
      case 'f':
        out += '\f';
        break;
      case '"':
        out += '"';
        break;
      case '\\':
        out += '\\';
        break;
      case '/':
        out += '/';
        break;
      case 'u': {
        const hex = raw.slice(i + 2, i + 6);
        if (hex.length < 4) return out; // truncated \uXXXX
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      default:
        out += next;
    }
    i += 2;
  }

  return out;
}
