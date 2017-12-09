#!/usr/bin/env node

'use strict'

const crypto = require('crypto');
const fs = require('fs');

const file = JSON.parse(fs.readFileSync('../Data.json'));
const data = file && file.data;

if (!data) {
    console.log('Failed to get data from file');
    process.exit(1);
    return;
}

const string = JSON.stringify(data);

// Generate and output a SHA1 of the data
const sha = crypto.createHash('sha1');
sha.update(string);

console.log('Date', Math.floor(new Date() / 1000));
console.log('SHA1', sha.digest('hex'));
