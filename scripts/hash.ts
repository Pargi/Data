#!/usr/bin/env node
'use strict'

import * as crypto from 'crypto';
import * as fs from 'fs';

const file = JSON.parse(fs.readFileSync('../Data.json', { encoding: 'utf-8' }));
const data = file && file.data;

if (!data) {
    console.log('Failed to get data from file');
    process.exit(1);
}

const string = JSON.stringify(data);

// Generate and output a SHA1 of the data
const sha = crypto.createHash('sha1');
sha.update(string);

console.log('Date', Math.floor(new Date().getTime() / 1000));
console.log('SHA1', sha.digest('hex'));