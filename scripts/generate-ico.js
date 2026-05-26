// Script: generate icon.ico from icon.png
// PNG-in-ICO format — pure Node.js, zero dependencies

const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'icon.png')
const dest = path.join(__dirname, '..', 'build', 'icon.ico')

const png = fs.readFileSync(src)

// Parse PNG header to get dimensions
const width = png.readUInt32BE(16)
const height = png.readUInt32BE(20)

console.log(`Source PNG: ${width}x${height}, ${png.length} bytes`)

// Build ICO file
// Header: reserved(2) + type(2=ICO) + count(2)
const count = 1
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)     // reserved
header.writeUInt16LE(1, 2)     // type: ICO
header.writeUInt16LE(count, 4)  // image count

// Directory entry (16 bytes per image)
// For PNG-in-ICO: bpp=0, size=bytes of PNG, offset=6+16=22
const dirOffset = 6 + 16 * count
const entry = Buffer.alloc(16)
// Width/height: 0 = 256 (uint8 max), clamp to 255 otherwise
const w = width >= 256 ? 0 : width
const h = height >= 256 ? 0 : height
entry.writeUInt8(w, 0)
entry.writeUInt8(h, 1)
entry.writeUInt8(0, 2)    // color palette
entry.writeUInt8(0, 3)    // reserved
entry.writeUInt16LE(1, 4) // color planes
entry.writeUInt16LE(32, 6) // bits per pixel (0 for PNG-in-ICO)
entry.writeUInt32LE(png.length, 8) // image size
entry.writeUInt32LE(dirOffset, 12) // image offset

const ico = Buffer.concat([header, entry, png])
fs.writeFileSync(dest, ico)
console.log(`Generated: ${dest} (${ico.length} bytes)`)
