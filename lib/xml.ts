const XML_ESCAPES: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&#39;",
  '"': "&quot;",
};

function isXmlAllowedCodePoint(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return true;
  if (cp < 0x20) return false;
  if (cp >= 0xfdd0 && cp <= 0xfdef) return false;
  const low16 = cp & 0xffff;
  if (low16 === 0xfffe || low16 === 0xffff) return false;
  return true;
}

export function escapeXml(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; ) {
    const code = input.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        if (isXmlAllowedCodePoint(cp)) out += input.slice(i, i + 2);
        i += 2;
        continue;
      }
      out += "�";
      i += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += "�";
      i += 1;
      continue;
    }

    const ch = input[i];
    const esc = XML_ESCAPES[ch];
    if (esc !== undefined) {
      out += esc;
    } else if (isXmlAllowedCodePoint(code)) {
      out += ch;
    }
    i += 1;
  }
  return out;
}
