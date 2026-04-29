/**
 * package.mjs — Creates a publish-ready ZIP for the Chrome Web Store.
 *
 * Includes only the files needed for the extension:
 *   manifest.json, dist/, icons/
 *
 * Usage: npm run package
 * Output: messagerail-<version>.zip
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

// Read version from manifest
const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'));
const version = manifest.version;
const outFile = `messagerail-${version}.zip`;

// Files and directories to include
const includes = ['manifest.json', 'dist', 'icons'];

// Verify required directories exist
for (const entry of includes) {
  if (!existsSync(entry)) {
    console.error(`Missing required path: ${entry}`);
    console.error('Run "npm run build" first and ensure icons/ directory exists.');
    process.exit(1);
  }
}

/**
 * Collect all files recursively from the include list.
 */
function collectFiles(paths) {
  const files = [];

  for (const p of paths) {
    const stat = statSync(p);
    if (stat.isFile()) {
      files.push(p);
    } else if (stat.isDirectory()) {
      walkDir(p, files);
    }
  }

  return files;
}

function walkDir(dir, files) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isFile()) {
      files.push(full);
    } else if (stat.isDirectory()) {
      walkDir(full, files);
    }
  }
}

/**
 * Minimal ZIP file writer (store method — no compression needed for small extensions).
 * Uses the ZIP format spec for local file headers + central directory.
 */
function createZip(filePaths, outputPath) {
  const entries = [];

  for (const filePath of filePaths) {
    const data = readFileSync(filePath);
    const name = filePath.replace(/\\/g, '/'); // Normalize path separators
    entries.push({ name, data });
  }

  const buffers = [];
  const centralDir = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf-8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);  // Local file header signature
    localHeader.writeUInt16LE(20, 4);           // Version needed
    localHeader.writeUInt16LE(0, 6);            // General purpose bit flag
    localHeader.writeUInt16LE(0, 8);            // Compression method (store)
    localHeader.writeUInt16LE(0, 10);           // Last mod file time
    localHeader.writeUInt16LE(0, 12);           // Last mod file date
    localHeader.writeUInt32LE(crc, 14);         // CRC-32
    localHeader.writeUInt32LE(size, 18);        // Compressed size
    localHeader.writeUInt32LE(size, 22);        // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28);           // Extra field length
    nameBuffer.copy(localHeader, 30);

    buffers.push(localHeader, entry.data);

    // Central directory entry
    const cdEntry = Buffer.alloc(46 + nameBuffer.length);
    cdEntry.writeUInt32LE(0x02014b50, 0);       // Central directory signature
    cdEntry.writeUInt16LE(20, 4);               // Version made by
    cdEntry.writeUInt16LE(20, 6);               // Version needed
    cdEntry.writeUInt16LE(0, 8);                // General purpose bit flag
    cdEntry.writeUInt16LE(0, 10);               // Compression method (store)
    cdEntry.writeUInt16LE(0, 12);               // Last mod file time
    cdEntry.writeUInt16LE(0, 14);               // Last mod file date
    cdEntry.writeUInt32LE(crc, 16);             // CRC-32
    cdEntry.writeUInt32LE(size, 20);            // Compressed size
    cdEntry.writeUInt32LE(size, 24);            // Uncompressed size
    cdEntry.writeUInt16LE(nameBuffer.length, 28); // File name length
    cdEntry.writeUInt16LE(0, 30);               // Extra field length
    cdEntry.writeUInt16LE(0, 32);               // File comment length
    cdEntry.writeUInt16LE(0, 34);               // Disk number start
    cdEntry.writeUInt16LE(0, 36);               // Internal file attributes
    cdEntry.writeUInt32LE(0, 38);               // External file attributes
    cdEntry.writeUInt32LE(offset, 42);          // Relative offset of local header
    nameBuffer.copy(cdEntry, 46);

    centralDir.push(cdEntry);
    offset += localHeader.length + entry.data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    buffers.push(cd);
    cdSize += cd.length;
  }

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);           // EOCD signature
  eocd.writeUInt16LE(0, 4);                    // Disk number
  eocd.writeUInt16LE(0, 6);                    // Disk with central directory
  eocd.writeUInt16LE(entries.length, 8);       // Entries on this disk
  eocd.writeUInt16LE(entries.length, 10);      // Total entries
  eocd.writeUInt32LE(cdSize, 12);              // Central directory size
  eocd.writeUInt32LE(cdOffset, 16);            // Central directory offset
  eocd.writeUInt16LE(0, 20);                   // Comment length
  buffers.push(eocd);

  writeFileSync(outputPath, Buffer.concat(buffers));
}

/**
 * CRC-32 implementation for ZIP file checksums.
 */
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Main ───────────────────────────────────────────────────────────

const files = collectFiles(includes);

console.log(`Packaging ${files.length} files into ${outFile}...`);
files.forEach((f) => console.log(`  ${f}`));

// Write ZIP using a simpler approach: use zip when available,
// otherwise use the built-in implementation

try {
  rmSync(outFile, { force: true });

  // Use system zip command (available on macOS and most Linux)
  execFileSync('zip', ['-r', outFile, ...files], { stdio: 'inherit' });

  console.log(`\n✓ Created ${outFile}`);
} catch {
  createZip(files, outFile);
  console.log(`\n✓ Created ${outFile} using the built-in ZIP writer`);
}
