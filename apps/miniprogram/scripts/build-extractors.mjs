import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
const binaryAsBase64 = {
  name: 'binary-as-base64',
  setup(builder) {
    builder.onLoad({ filter: /\.bcmap$/ }, async ({ path: filePath }) => ({
      contents: `module.exports = ${JSON.stringify((await fs.readFile(filePath)).toString('base64'))}`,
      loader: 'js'
    }))
  }
}

const common = {
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2018',
  minify: true,
  legalComments: 'inline'
}

await build({
  ...common,
  entryPoints: [path.join(root, 'scripts/pdf-extractor-entry.js')],
  outfile: path.join(root, 'miniprogram/features/pdf-import/pdf-engine.js'),
  plugins: [binaryAsBase64]
})

await build({
  ...common,
  entryPoints: [path.join(root, 'scripts/office-extractor-entry.js')],
  outfile: path.join(root, 'miniprogram/features/office-import/office-engine.js')
})
