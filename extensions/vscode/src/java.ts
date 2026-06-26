export function javaClassName(base: string): string {
  const safe = base.replace(/[^A-Za-z0-9_$]/g, "_");
  return `Q${safe || "Problem"}`;
}

export function materializeJavaTemplate(template: string, className: string): string {
  if (template.includes("{classname}")) {
    return template.replaceAll("{classname}", className);
  }
  // Keep existing CPOS/shared Java templates working: older defaults used
  // package-private `class Main` because solution filenames could be numeric.
  if (/\bclass\s+Main\b/.test(template)) {
    return replaceJavaIdentifier(template, "Main", className);
  }
  return template;
}

export function javaSubmissionCode(code: string, localClassName: string): string {
  if (localClassName === "Main" ||
      !new RegExp(`\\bclass\\s+${escapeRegExp(localClassName)}\\b`).test(code)) {
    return code;
  }
  return replaceJavaIdentifier(code, localClassName, "Main");
}

export function javaEntryClassName(code: string, fallback: string): string {
  const identifier = "[A-Za-z_$][A-Za-z0-9_$]*";
  const publicClass = code.match(new RegExp(`\\bpublic\\s+(?:final\\s+)?class\\s+(${identifier})\\b`));
  if (publicClass) return publicClass[1];
  if (/\bclass\s+Main\b/.test(code)) return "Main";
  const fallbackClass = code.match(new RegExp(`\\bclass\\s+${escapeRegExp(fallback)}\\b`));
  if (fallbackClass) return fallback;
  return code.match(new RegExp(`\\bclass\\s+(${identifier})\\b`))?.[1] ?? fallback;
}

function replaceJavaIdentifier(code: string, from: string, to: string): string {
  let result = "";
  let i = 0;
  let state: "code" | "lineComment" | "blockComment" | "string" | "char" | "textBlock" = "code";

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    const third = code[i + 2];

    if (state === "code") {
      if (ch === "/" && next === "/") {
        state = "lineComment";
        result += ch + next;
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "blockComment";
        result += ch + next;
        i += 2;
        continue;
      }
      if (ch === "\"" && next === "\"" && third === "\"") {
        state = "textBlock";
        result += ch + next + third;
        i += 3;
        continue;
      }
      if (ch === "\"") state = "string";
      else if (ch === "'") state = "char";
      else if (/[A-Za-z_$]/.test(ch)) {
        let end = i + 1;
        while (end < code.length && /[A-Za-z0-9_$]/.test(code[end])) end++;
        const identifier = code.slice(i, end);
        result += identifier === from ? to : identifier;
        i = end;
        continue;
      }
    } else if (state === "lineComment" && ch === "\n") {
      state = "code";
    } else if (state === "blockComment" && ch === "*" && next === "/") {
      state = "code";
      result += ch + next;
      i += 2;
      continue;
    } else if (state === "textBlock" && ch === "\"" && next === "\"" && third === "\"") {
      state = "code";
      result += ch + next + third;
      i += 3;
      continue;
    } else if ((state === "string" && ch === "\"") || (state === "char" && ch === "'")) {
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && code[j] === "\\"; j--) backslashes++;
      if (backslashes % 2 === 0) state = "code";
    }

    result += ch;
    i++;
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
