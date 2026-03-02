//@ts-check
import path from 'path'
import { copyFile, readFile } from 'fs/promises'

import esbuild from 'esbuild'
import inlineWorkerPlugin from 'esbuild-plugin-inline-worker'
import { ESLint } from 'eslint'
import { compile } from 'sass'

/**
 * esbuild plugin to patch pixi-live2d-display-lipsyncpatch.
 * The library has a module-level check: `if (!window.Live2DCubismCore) throw ...`
 * When esbuild inlines this into the bundle, the check runs at bundle parse time
 * before the Cubism Core WASM has finished initializing asynchronously.
 * This plugin converts the fatal throw into a deferred warning.
 */
const cubismPatchPlugin = {
  name: 'cubism-patch',
  setup(build) {
    build.onLoad({ filter: /pixi-live2d-display-lipsyncpatch.*\.js$/ }, async (args) => {
      let contents = await readFile(args.path, 'utf8')
      // Replace the fatal throw with a console.warn - the actual check
      // will happen at runtime when the model is loaded
      contents = contents.replace(
        /if\s*\(!window\.Live2DCubismCore\)\s*\{\s*throw new Error\([^)]+\);\s*\}/g,
        `if (!window.Live2DCubismCore) { console.warn("[Live2D] Cubism 4 Core not yet loaded - will check again at model load time"); }`
      )
      return { contents, loader: 'js' }
    })
  },
}

/**
 * Helper method returning a bundle configuration which is shared amongst
 * different `esbuild` methods.
 *
 * @returns {esbuild.BuildOptions}
 */
function config(options) {
  const { isProduction, isMinify, isWatch } = options

  const plugins = [cubismPatchPlugin, wasmPlugin, sassPlugin, inlineWorkerPlugin()]
  if (isWatch || isProduction) {
    // Make eslint optional as it affects build times significantly
    plugins.push(eslintPlugin)
    plugins.push(reporterPlugin)
  }

  return {
    entryPoints: ['src/main.tsx'],
    bundle: true,
    minify: isMinify,
    sourcemap: true,
    outfile: 'html-dist/bundle.js',
    platform: 'browser',
    define: {
      'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
    },
    plugins,
    external: ['*.jpg', '*.png', '*.webp', '*.svg'],
    format: 'esm',
    alias: {
      path: 'path-browserify',
    },
  }
}

/**
 * `esbuild` plugin checking for linter errors and warnings. It prints them in the
 * console and reports them further to `esbuild`.
 */
const eslintPlugin = {
  name: 'eslint',
  setup(build) {
    // Use the root eslint.config.js (flat config) by setting cwd to project root
    const projectRoot = path.resolve(import.meta.dirname, '../../..')
    const eslint = new ESLint({ cwd: projectRoot })
    const filesToLint = []

    build.onLoad({ filter: /\.(?:jsx?|tsx?)$/ }, args => {
      if (!args.path.includes('node_modules')) {
        filesToLint.push(args.path)
      }

      return null
    })

    build.onEnd(async () => {
      const results = await eslint.lintFiles(filesToLint)
      const formatter = await eslint.loadFormatter('stylish')
      const output = await formatter.format(results)

      const warnings = results.reduce(
        (count, result) => count + result.warningCount,
        0
      )
      const errors = results.reduce(
        (count, result) => count + result.errorCount,
        0
      )

      if (output.length > 0) {
        console.log(output)
      }

      return {
        ...(warnings > 0 && {
          warnings: [{ text: `${warnings} warnings were found by eslint!` }],
        }),
        ...(errors > 0 && {
          errors: [{ text: `${errors} errors were found by eslint!` }],
        }),
      }
    })
  },
}

/**
 * `esbuild` plugin to allow SCSS in CSS modules.
 */
const sassPlugin = {
  name: 'sass',
  setup(build) {
    build.onLoad({ filter: /\.module\.scss$/ }, args => {
      const { css } = compile(args.path)
      return { contents: css, loader: 'local-css' }
    })
  },
}

/**
 * `esbuild` plugin decoding WebAssembly and automatically embedding it in the build.
 */
const wasmPlugin = {
  name: 'wasm',
  setup(build) {
    // Resolve ".wasm" files to a path with a namespace
    build.onResolve({ filter: /\.wasm$/ }, args => {
      if (args.resolveDir === '') {
        return // Ignore unresolvable paths
      }
      return {
        path: path.isAbsolute(args.path)
          ? args.path
          : path.join(args.resolveDir, args.path),
        namespace: 'wasm-binary',
      }
    })

    // Virtual modules in the "wasm-binary" namespace contain the actual bytes
    // of the WebAssembly file. This uses esbuild's built-in "binary" loader
    // instead of manually embedding the binary data inside JavaScript code
    // ourselves.
    build.onLoad({ filter: /.*/, namespace: 'wasm-binary' }, async args => ({
      contents: await readFile(args.path),
      loader: 'binary',
    }))
  },
}

/**
 * `esbuild` plugin to report to the user if a bundle process started or ended.
 *
 * This is especially useful to find out if a warning or error got fixed after
 * a change.
 */
const reporterPlugin = {
  name: 'reporter',
  setup(build) {
    build.onStart(() => {
      console.log('- Start esbuild ...')
    })

    build.onEnd(async args => {
      const errors = args.errors.length
      const warnings = args.warnings.length
      console.log(
        `- Finished esbuild with ${warnings} warnings and ${errors} errors`
      )
    })
  },
}

/**
 * Bundle all files with `esbuild`.
 */
async function bundle(options) {
  await esbuild.build(options)

  await copyFile(
    'node_modules/@deltachat/message_parser_wasm/message_parser_wasm_bg.wasm',
    'html-dist/message_parser_wasm_bg.wasm'
  )
}

/**
 * Start watching for all files with `esbuild`, on change of any watched
 * file this will trigger a build.
 */
async function watch(options) {
  const context = await esbuild.context(options)
  await context.watch()
}

async function main(isWatch = false, isProduction = false, isMinify = false) {
  const options = config({
    isProduction: !isWatch && isProduction,
    isMinify: (!isWatch && isMinify) || isProduction,
    isWatch,
  })

  if (isWatch) {
    await watch(options)
  } else {
    await bundle(options)
  }
}

const isWatch = process.argv.indexOf('-w') !== -1
const isMinify = process.argv.indexOf('-m') !== -1
const isProduction = process.env['NODE_ENV'] === 'production'

main(isWatch, isProduction, isMinify).catch(err => {
  console.error(err)
  process.exitCode = 1
})
