import fs from "node:fs";
import path from "node:path";

const apiDir = "api";

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".ts")) patchFile(p);
  }
}

function patchFile(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  if (!text.includes("@vercel/node")) return;
  const rel = path.relative(path.dirname(filePath), path.join(apiDir, "_lib", "request.js")).replace(/\\/g, "/");
  const imp = rel.startsWith(".") ? rel : `./${rel}`;
  text = text.replace(
    /import type \{ VercelRequest, VercelResponse \} from "@vercel\/node";/g,
    `import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "${imp}";`
  );
  fs.writeFileSync(filePath, text);
  console.log("patched", filePath);
}

walk(apiDir);
