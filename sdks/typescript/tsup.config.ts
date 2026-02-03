import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  outDir: 'dist',
  // Mark node built-ins as external - let bundler polyfill them
  external: [
    'crypto',
    'buffer',
    'stream',
    'util',
    'process',
    // Don't bundle large dependencies - let consumer handle them
    /^@coinbase\/.*/,
    /^@solana\/.*/,
    /^@noble\/.*/,
    /^@scure\/.*/,
    'ethers',
    'bip39',
    'bs58',
    'tweetnacl',
    'libsodium-wrappers',
  ],
})
