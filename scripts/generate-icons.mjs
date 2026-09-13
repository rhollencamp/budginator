// Renders the PNG icon set in public/ from public/favicon.svg.
//
// The source SVG is the artwork bled to the edges of its 512 box, which is what
// a browser tab wants. Every other surface rounds or masks the square, so each
// output here re-lays the artwork inside the square at its own coverage: the
// fraction of the icon's width that the artwork's bounding box may occupy.
// Run with `npm run icons`.

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))
const source = join(publicDir, 'favicon.svg')
const VIEWBOX = 512

// Coverage is measured on the artwork's longest side.
//   - The browser tab is not masked, so the favicon keeps its full bleed and is
//     not regenerated here at all.
//   - iOS and Chrome round the corners of an "any" icon, and iOS scales it up
//     inside the rounded square, so the artwork needs room or it gets shaved.
//   - A maskable icon must survive an arbitrary mask: Android guarantees only
//     the centre circle of 80% diameter, and a wide shape has to fit inside
//     that circle rather than inside an 80% square.
const outputs = [
  { file: 'apple-touch-icon.png', size: 180, coverage: 0.78 },
  { file: 'pwa-192x192.png', size: 192, coverage: 0.78 },
  { file: 'pwa-512x512.png', size: 512, coverage: 0.78 },
  { file: 'maskable-icon-512x512.png', size: 512, coverage: 0.66 },
]

const svg = await readFile(source, 'utf8')

// The first path is the background plate; the rest is the artwork.
const paths = svg.match(/<path\b[^>]*\/>/g)
if (!paths || paths.length < 2) {
  throw new Error(
    `${source}: expected a background path and at least one artwork path`,
  )
}
const [background, ...artwork] = paths
const backgroundColour = background.match(/fill="([^"]+)"/)?.[1]
if (!backgroundColour) {
  throw new Error(`${source}: background path has no fill`)
}

const wrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">${body}</svg>`

// Measure the artwork's real bounding box rather than trusting the viewBox: the
// ledger mark does not fill its box, and centring on the box would sit it
// off-centre.
const bounds = await measure(artwork.join(''))

for (const { file, size, coverage } of outputs) {
  const scale = (VIEWBOX * coverage) / Math.max(bounds.width, bounds.height)
  const x = (VIEWBOX - bounds.width * scale) / 2 - bounds.x * scale
  const y = (VIEWBOX - bounds.height * scale) / 2 - bounds.y * scale
  const laidOut = wrap(
    `<path fill="${backgroundColour}" d="M0 0h${VIEWBOX}v${VIEWBOX}H0z"/>` +
      `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale)})">${artwork.join('')}</g>`,
  )
  await sharp(Buffer.from(laidOut), { density: (72 * size * 4) / VIEWBOX })
    .resize(size, size)
    .png()
    .toFile(join(publicDir, file))
  console.log(
    `${file}  ${size}x${size}  artwork ${Math.round(coverage * 100)}%`,
  )
}

async function measure(body) {
  // Render the artwork alone on a transparent ground and trim to what it inked.
  const scale = 4
  const dir = await mkdtemp(join(tmpdir(), 'icons-'))
  const probe = join(dir, 'probe.png')
  await writeFile(
    probe,
    await sharp(Buffer.from(wrap(body)), { density: 72 * scale })
      .png()
      .toBuffer(),
  )
  const { info } = await sharp(probe)
    .trim({ threshold: 0 })
    .toBuffer({ resolveWithObject: true })
  return {
    x: info.trimOffsetLeft === undefined ? 0 : -info.trimOffsetLeft / scale,
    y: info.trimOffsetTop === undefined ? 0 : -info.trimOffsetTop / scale,
    width: info.width / scale,
    height: info.height / scale,
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000
}
