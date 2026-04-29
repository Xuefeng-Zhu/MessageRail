import * as esbuild from 'esbuild';

const entryPoints = [
  'src/background.ts',
  'src/content.ts',
  'src/popup.ts',
];

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints,
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'es2020',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

try {
  await esbuild.build(buildOptions);
  console.log('Build complete.');
} catch (err) {
  console.error('Build failed:', err);
  process.exit(1);
}
