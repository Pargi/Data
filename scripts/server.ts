import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const PORT = 3001;

// Construct __dirname in ESM environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This script is compiled to build/server.js
// So __dirname is .../Data/scripts/build
// We want to serve files from .../Data/scripts/
const ROOT_DIR = path.join(__dirname, "..");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".json": "application/json",
  ".js": "text/javascript",
  ".css": "text/css",
};

const server = http.createServer((req, res) => {
  console.log(`Request: ${req.url}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  let filePath = "";

  if (req.url === "/" || req.url === "/index.html") {
    filePath = path.join(ROOT_DIR, "map.html");
  } else if (req.url && req.url.startsWith("/data/")) {
    const fileName = req.url.replace("/data/", "");
    // Simple directory traversal protection
    if (fileName.includes("..") || fileName.includes("/")) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    filePath = path.join(ROOT_DIR, fileName);
  } else {
    // Try to serve other static files if needed, or 404
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        console.error(`File not found: ${filePath}`);
        res.writeHead(404);
        res.end("File not found");
      } else {
        console.error(`Server error: ${err.code} ${filePath}`);
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Serving files from ${ROOT_DIR}`);
});
