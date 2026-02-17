import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/tunneler.js',
  format: 'esm',
  sourcemap: true,
  target: 'es2022',
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  const { host, port } = await ctx.serve({
    servedir: 'dist',
    port: 3000,
  });
  console.log(`Serving on http://localhost:${port}`);
} else {
  await esbuild.build({ ...buildOptions, minify: true });
  console.log('Build complete.');
}
