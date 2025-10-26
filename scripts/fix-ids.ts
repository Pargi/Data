#!/usr/bin/env node
"use strict";

import * as fs from "fs";

const file = JSON.parse(fs.readFileSync("../Data.json", { encoding: "utf-8" }));

if (!file) {
  console.log("Failed to get data from file");
  process.exit(1);
}

file.data.zones = file.data.zones.map((zone: any, idx: number) => ({
  ...zone,
  id: idx + 1,
}));

fs.writeFileSync("../Data.json", JSON.stringify(file, null, 4));
