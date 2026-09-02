/**
 * Renders the application icons from `web/public/favicon.svg`.
 *
 * WHY THIS EXISTS INSTEAD OF COMMITTING THE PNGs AND FORGETTING. The icons are
 * derived data: they come from one SVG, and the day that SVG changes the four PNGs
 * have to change with it. A binary blob nobody knows how to rebuild is the kind of
 * thing that quietly stops matching its source. It is run by hand, not by the build:
 * the output is committed, so `npm run build` needs no browser.
 *
 * WHY A BROWSER AND NOT AN IMAGE LIBRARY. Adding `sharp` or its kin to `web/` would
 * put a native dependency into the client that serves the JavaScript that encrypts
 * the passwords, and ADR-001 asks that such additions be worth their weight. This is
 * a one-off asset step, so it borrows the browser the project already drives for
 * `verify-auto-lock.mjs` and `verify-large-vault.mjs` instead.
 *
 * THE THREE SIZES ARE NOT INTERCHANGEABLE, and this is the part worth reading:
 *
 *   - `any` (192 and 512): what Chrome and Android use as-is. The mark gets a little
 *     padding so it does not touch the edges.
 *
 *   - `maskable` (512): Android crops icons to whatever shape the launcher wants —
 *     circle, squircle, teardrop. Only the inner 80% of the canvas is guaranteed to
 *     survive, so the mark is drawn much smaller. Feeding an `any` icon to a mask is
 *     how logos end up beheaded.
 *
 *   - `apple-touch-icon` (180): iOS does NOT read the manifest's icons for the home
 *     screen, it reads `<link rel="apple-touch-icon">`. And it does not composite
 *     transparency onto anything sensible, so this one MUST be opaque. A transparent
 *     PNG here renders as a black square with a bruise in the middle.
 *
 * All four are opaque for the same reason: a transparent icon is at the mercy of
 * whatever the launcher paints behind it, and that is not a decision worth handing
 * over on a per-device basis.
 *
 * THE TEMPORARY PAGE GOES UNDER THE PROJECT AND NOT UNDER `/tmp`, AND THAT IS THE
 * WHOLE REASON THIS SCRIPT CHECKS ITS OWN OUTPUT. The first version wrote it to the
 * system temp directory, which a confined browser package cannot read: Chromium
 * loaded its «file not found» page, screenshotted THAT, exited 0, and produced four
 * PNGs of the right dimensions with an error message inside. Nothing complained.
 * What gave it away was two icons of different scales coming out byte-identical.
 *
 * So «a PNG appeared» is not the check. The check is `measure`, below: where the
 * mark actually landed, how big it is, and whether the canvas is opaque. It is the
 * lesson of #450 — a verifier can go green over nothing at all.
 *
 * Usage, from the root of the repository:
 *
 *     node scripts/build-icons.mjs
 *
 * Environment: CHROMIUM overrides the browser binary, as in the other scripts.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import path from 'node:path'

const CHROMIUM = process.env.CHROMIUM ?? 'chromium-browser'

const projectRoot = path.resolve(import.meta.dirname, '..')
const source = path.join(projectRoot, 'web/public/favicon.svg')
const outputDirectory = path.join(projectRoot, 'web/public/icons')
const workDirectory = path.join(projectRoot, '.build-icons')

/** The canvas colour behind the mark, matching the light theme's `--background`. */
const BACKGROUND = '#ffffff'

/** How far the measured mark may drift from what was asked for, in percentage points. */
const SCALE_TOLERANCE = 3

/** How far off centre the mark may sit, as a fraction of the canvas. */
const CENTRE_TOLERANCE = 0.02

/**
 * What to render, and how much of the canvas the mark is allowed to take.
 *
 * The fractions are the whole design: see the header for why `maskable` is so much
 * smaller than the rest.
 */
const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.72 },
  { file: 'icon-512.png', size: 512, scale: 0.72 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.56 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.64 },
]

/**
 * The page the browser screenshots: the mark centred on an opaque square.
 *
 * The SVG is inlined as a data URI rather than linked, so the render does not depend
 * on a file:// sibling resolving the way we assume it will.
 */
function page(svgDataUri, size, scale) {
  const mark = Math.round(size * scale)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; }
      body {
        width: ${size}px;
        height: ${size}px;
        background: ${BACKGROUND};
        display: flex;
        align-items: center;
        justify-content: center;
      }
      img { width: ${mark}px; height: auto; display: block; }
    </style>
  </head>
  <body><img src="${svgDataUri}" alt="" /></body>
</html>`
}

/** Decodes a PNG into its rows of raw samples. Enough of the format for this job. */
function decodePng(bytes) {
  let position = 8
  let compressed = Buffer.alloc(0)
  let header = null

  while (position < bytes.length) {
    const length = bytes.readUInt32BE(position)
    const type = bytes.subarray(position + 4, position + 8).toString('latin1')
    const data = bytes.subarray(position + 8, position + 8 + length)

    if (type === 'IHDR') {
      header = { width: bytes.readUInt32BE(position + 8), height: bytes.readUInt32BE(position + 12), colour: data[9] }
    } else if (type === 'IDAT') {
      compressed = Buffer.concat([compressed, data])
    }

    position += 12 + length
  }

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.colour]
  const raw = inflateSync(compressed)
  const stride = header.width * channels
  const rows = []
  let previous = Buffer.alloc(stride)
  let offset = 0

  // Undoing the per-row filters, which is the only part of PNG that is not a copy.
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[offset]
    offset += 1
    const row = Buffer.from(raw.subarray(offset, offset + stride))
    offset += stride

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0
      const up = previous[x]
      const upLeft = x >= channels ? previous[x - channels] : 0

      if (filter === 1) row[x] = (row[x] + left) & 255
      else if (filter === 2) row[x] = (row[x] + up) & 255
      else if (filter === 3) row[x] = (row[x] + ((left + up) >> 1)) & 255
      else if (filter === 4) {
        const estimate = left + up - upLeft
        const dLeft = Math.abs(estimate - left)
        const dUp = Math.abs(estimate - up)
        const dUpLeft = Math.abs(estimate - upLeft)
        const nearest = dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft
        row[x] = (row[x] + nearest) & 255
      }
    }

    rows.push(row)
    previous = row
  }

  return { ...header, channels, rows }
}

/** Where the mark actually landed, and whether the canvas came out opaque. */
function measure(bytes) {
  const { width, height, channels, rows } = decodePng(bytes)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let opaque = true

  for (let y = 0; y < height; y += 1) {
    const row = rows[y]

    for (let x = 0; x < width; x += 1) {
      const at = x * channels

      if (channels === 4 && row[at + 3] < 255) opaque = false

      // Anything that is not the background counts as the mark.
      if (!(row[at] > 245 && row[at + 1] > 245 && row[at + 2] > 245)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return { width, height, opaque, empty: true }

  return {
    width,
    height,
    opaque,
    empty: false,
    markWidth: maxX - minX + 1,
    markHeight: maxY - minY + 1,
    centreX: (minX + maxX + 1) / 2 / width,
    centreY: (minY + maxY + 1) / 2 / height,
  }
}

/*
 * It renders into the work directory and NOT over the final file, so that a render
 * the checks reject leaves nothing behind. The first version wrote straight to
 * `web/public/icons/`, and a failing run replaced a good icon with a bad one before
 * getting round to complaining about it.
 */
function render(svgDataUri, { file, size, scale }) {
  const html = path.join(workDirectory, `${file}.html`)
  const output = path.join(workDirectory, file)

  writeFileSync(html, page(svgDataUri, size, scale), 'utf8')

  const result = spawnSync(
    CHROMIUM,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--screenshot=${output}`,
      `--window-size=${size},${size}`,
      `file://${html}`,
    ],
    { encoding: 'utf8' },
  )

  if (result.error) {
    throw new Error(`No se pudo ejecutar ${CHROMIUM}: ${result.error.message}`)
  }

  if (!existsSync(output)) {
    throw new Error(`${file}: el navegador no escribió el fichero.\n${result.stderr ?? ''}`)
  }

  const bytes = readFileSync(output)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  if (!bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`${file}: lo escrito no es un PNG.`)
  }

  return { output, measurement: measure(bytes), bytes: bytes.length }
}

/** Refuses the icon if what came out is not what was asked for. See the header. */
function check(file, size, scale, measurement) {
  const complain = (why) => {
    throw new Error(`${file}: ${why}`)
  }

  if (measurement.width !== size || measurement.height !== size) {
    complain(`salió ${measurement.width}x${measurement.height} en vez de ${size}x${size}.`)
  }

  if (measurement.empty) complain('salió en blanco: no hay marca dentro.')
  if (!measurement.opaque) complain('tiene píxeles transparentes, y los cuatro iconos son opacos.')

  const measured = (100 * measurement.markWidth) / size
  const asked = 100 * scale

  if (Math.abs(measured - asked) > SCALE_TOLERANCE) {
    complain(`la marca ocupa el ${measured.toFixed(0)} % del ancho y se pidió el ${asked.toFixed(0)} %.`)
  }

  const offCentre = Math.max(Math.abs(measurement.centreX - 0.5), Math.abs(measurement.centreY - 0.5))

  if (offCentre > CENTRE_TOLERANCE) {
    complain(`la marca está descentrada: (${measurement.centreX.toFixed(3)}, ${measurement.centreY.toFixed(3)}).`)
  }
}

function main() {
  const svg = readFileSync(source, 'utf8')
  const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`

  mkdirSync(outputDirectory, { recursive: true })
  mkdirSync(workDirectory, { recursive: true })

  try {
    for (const icon of ICONS) {
      const { output, measurement, bytes } = render(svgDataUri, icon)
      check(icon.file, icon.size, icon.scale, measurement)

      // Only once it has passed does it become the icon the application ships.
      copyFileSync(output, path.join(outputDirectory, icon.file))

      const percentage = ((100 * measurement.markWidth) / icon.size).toFixed(0)
      console.log(
        `✓ ${icon.file.padEnd(24)} ${String(icon.size).padStart(3)}px  ` +
          `marca ${measurement.markWidth}x${measurement.markHeight} (${percentage} %)  ${bytes} bytes`,
      )
    }
  } finally {
    rmSync(workDirectory, { recursive: true, force: true })
  }

  console.log(`\nEscritos en ${path.relative(projectRoot, outputDirectory)}`)
}

main()
