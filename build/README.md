# Build Resources

Place app icons here for electron-builder packaging.

## Required icons (optional — defaults will be used if missing)

| Platform | File | Size |
|----------|------|------|
| Windows | `icon.ico` | 256×256 |
| macOS | `icon.icns` | 512×512 or 1024×1024 |
| Linux | `icon.png` | 512×512 |

## Generate icons from a single PNG

Use [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder):

```bash
npx electron-icon-builder --input=./assets/icon.png --output=./build
```

Or use an online converter like [iConvert Icons](https://iconverticons.com/online/).

## Note

If these icons are missing, electron-builder will use the default Electron icon.
