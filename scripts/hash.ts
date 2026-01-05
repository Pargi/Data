#!/usr/bin/env node
"use strict";

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const DATA_JSON_PATH = "../Data.json";

function main() {
  // Resolve path relative to CWD, assuming script is run from Data/scripts
  const dataPath = path.resolve(process.cwd(), DATA_JSON_PATH);

  if (!fs.existsSync(dataPath)) {
    console.error(`File not found: ${dataPath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(dataPath, { encoding: "utf-8" });
  let file;

  try {
    file = JSON.parse(fileContent);
  } catch (e) {
    console.error("Failed to parse JSON", e);
    process.exit(1);
  }

  const data = file && file.data;

  if (!data) {
    console.error("Failed to get data from file");
    process.exit(1);
  }

  const string = JSON.stringify(data);

  // Generate a SHA1 of the data
  const sha = crypto.createHash("sha1");
  sha.update(string);
  const hash = sha.digest("hex");
  const date = Math.floor(new Date().getTime() / 1000);

  // Update the file object
  file.hash = hash;
  file.date = date;

  // Write back to file
  fs.writeFileSync(dataPath, JSON.stringify(file, null, 4));
  console.log(`Updated Data.json with Hash: ${hash} and Date: ${date}`);
}

main();
