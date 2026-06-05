import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "api/_routes";
const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "registry.ts");

const replacements = [
  [/return fail\(res, 405, "Method not allowed"\)/g, "return methodNotAllowed(res)"],
  [
    /return fail\(res, error instanceof Error && error\.message === "Unauthorized" \? 401 : 400, error instanceof Error \? error\.message : "[^"]+"\)/g,
    'return handleRouteError(res, error, { fallback: "操作失敗" })'
  ],
  [
    /return fail\(res, error instanceof Error && error\.message === "Unauthorized" \? 401 : 500, error instanceof Error \? error\.message : "[^"]+"\)/g,
    'return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 500 })'
  ],
  [
    /return fail\(res, error instanceof Error && error\.message === "Unauthorized" \? 401 : 403, error instanceof Error \? error\.message : "[^"]+"\)/g,
    'return handleRouteError(res, error, { fallback: "操作失敗", validationStatus: 403 })'
  ]
];

for (const file of files) {
  const path = join(dir, file);
  let content = readFileSync(path, "utf8");
  if (!content.includes('from "../_lib/http.js"')) continue;

  const original = content;
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }

  if (content.includes("methodNotAllowed") && !content.includes("methodNotAllowed,") && !content.includes("methodNotAllowed ")) {
    // already has import maybe partial
  }

  if (content.includes("methodNotAllowed(") && !/import \{[^}]*methodNotAllowed/.test(content)) {
    content = content.replace(
      /import \{([^}]+)\} from "\.\.\/_lib\/http\.js";/,
      (match, imports) => {
        const parts = imports.split(",").map((s) => s.trim()).filter(Boolean);
        if (!parts.includes("methodNotAllowed")) parts.push("methodNotAllowed");
        if (!parts.includes("handleRouteError") && content.includes("handleRouteError(")) parts.push("handleRouteError");
        return `import { ${parts.join(", ")} } from "../_lib/http.js";`;
      }
    );
  }

  if (content.includes("handleRouteError(") && !/import \{[^}]*handleRouteError/.test(content)) {
    content = content.replace(
      /import \{([^}]+)\} from "\.\.\/_lib\/http\.js";/,
      (match, imports) => {
        const parts = imports.split(",").map((s) => s.trim()).filter(Boolean);
        if (!parts.includes("handleRouteError")) parts.push("handleRouteError");
        return `import { ${parts.join(", ")} } from "../_lib/http.js";`;
      }
    );
  }

  if (content !== original) {
    writeFileSync(path, content, "utf8");
    console.log(`patched ${path}`);
  }
}
