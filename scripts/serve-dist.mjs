import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "dist");
const port = Number(process.env.PORT || 5173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url || "/", `http://127.0.0.1:${port}`).pathname);
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath);

  if (!existsSync(filePath) || urlPath === "/" || !extname(filePath)) {
    filePath = join(root, "index.html");
  }

  res.setHeader("content-type", types[extname(filePath)] || "application/octet-stream");
  if (extname(filePath) === ".html") {
    res.setHeader("cache-control", "no-store");
  } else {
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  }
  createReadStream(filePath)
    .on("error", () => {
      res.statusCode = 404;
      res.end("Not found");
    })
    .pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`RMBsale static server: http://127.0.0.1:${port}`);
});
