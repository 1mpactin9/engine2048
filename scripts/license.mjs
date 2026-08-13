#!/usr/bin/env node
/**
 * license.mjs
 *
 * Adds an SPDX license header to source files, skipping anything
 * ignored by .gitignore (and .git/ itself).
 *
 * Usage:
 *   node license.mjs [rootDir]
 *
 * Requires: `ignore` package
 *   npm install ignore
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import ignore from 'ignore';

const ROOT = process.argv[2] ? join(process.cwd(), process.argv[2]) : process.cwd();

const YEAR = '2026';
const AUTHOR = '1mpactin9';
const LICENSE_ID = 'GPL-3.0-or-later';

// Extension -> comment style
const COMMENT_STYLES = {
  '.rs':  'slash',
  '.cpp': 'slash',
  '.h':   'slash',
  '.hpp': 'slash',
  '.ts':  'slash',
  '.js':  'slash',
  '.mjs': 'slash',
  '.py':  'hash',
  '.pyi': 'hash',
  '.sh':  'hash',
  '.ps1': 'hash',
};

const WHITELIST = new Set(Object.keys(COMMENT_STYLES));

function headerFor(style) {
  if (style === 'slash') {
    return `// SPDX-License-Identifier: ${LICENSE_ID}\n// Copyright (C) ${YEAR} ${AUTHOR}\n\n`;
  }
  if (style === 'hash') {
    return `# SPDX-License-Identifier: ${LICENSE_ID}\n# Copyright (C) ${YEAR} ${AUTHOR}\n\n`;
  }
  throw new Error(`Unknown comment style: ${style}`);
}

function loadIgnore(root) {
  const ig = ignore();
  ig.add(['.git']);
  const gitignorePath = join(root, '.gitignore');
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, 'utf8'));
  }
  return ig;
}

function walk(dir, ig, root, files) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full).split(sep).join('/');
    if (ig.ignores(rel)) continue;

    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, ig, root, files);
    } else if (st.isFile() && WHITELIST.has(extname(full))) {
      files.push(full);
    }
  }
  return files;
}

function alreadyLicensed(content) {
  return content.includes('SPDX-License-Identifier:');
}

function addHeader(filePath) {
  const ext = extname(filePath);
  const style = COMMENT_STYLES[ext];
  const content = readFileSync(filePath, 'utf8');

  if (alreadyLicensed(content)) {
    return 'skip';
  }

  // Preserve shebang line if present (scripts)
  if (content.startsWith('#!')) {
    const newlineIdx = content.indexOf('\n');
    const shebang = content.slice(0, newlineIdx + 1);
    const rest = content.slice(newlineIdx + 1);
    writeFileSync(filePath, shebang + headerFor(style) + rest);
  } else {
    writeFileSync(filePath, headerFor(style) + content);
  }
  return 'added';
}

function main() {
  const ig = loadIgnore(ROOT);
  const files = walk(ROOT, ig, ROOT, []);

  let added = 0, skipped = 0;
  for (const file of files) {
    const result = addHeader(file);
    if (result === 'added') added++;
    else skipped++;
  }

  console.log(`Done: ${added} file(s) licensed, ${skipped} already had a header. (${files.length} scanned)`);
}

main();
