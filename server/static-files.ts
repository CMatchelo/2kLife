import { createReadStream, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  staticRoot: string,
) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
  } catch {
    res.writeHead(400).end();
    return true;
  }

  const root = resolve(staticRoot);
  const requested = resolve(join(root, pathname.replace(/^\/+/, "")));
  if (requested !== root && !requested.startsWith(`${root}${sep}`)) {
    res.writeHead(403).end();
    return true;
  }

  let file = requested;
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    if (!statSync(file).isFile()) throw new Error("Not a file");
  } catch {
    // The React app currently has no URL router, but this keeps future
    // client-side routes refreshable without weakening /api handling.
    if (!extname(pathname)) file = join(root, "index.html");
    else {
      res.writeHead(404).end();
      return true;
    }
  }

  const extension = extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": contentTypes[extension] ?? "application/octet-stream",
    "Cache-Control":
      extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
  return true;
}
