import { RawSource } from 'webpack-sources'
import type { Compiler } from 'webpack'

interface Export2JsonAssetOptions {
  entryPath: string
  outputPath: string
}

declare const global: typeof globalThis & {
  __default_export_json_asset__: {
    default: unknown
  }
}

const libraryName = '__default_export_json_asset__'
export default class Export2JsonAssetWebpackPlugin {
  options: Export2JsonAssetOptions
  constructor(options: Export2JsonAssetOptions) {
    this.options = options
  }
  apply(compiler: Compiler) {
    new compiler.webpack.EntryPlugin(compiler.context, this.options.entryPath, {
      name: libraryName,
      filename: this.options.outputPath,
      baseUri: '/',
      library: {
        name: libraryName,
        type: 'umd',
      },
    }).apply(compiler)
    compiler.hooks.compilation.tap(
      'Export2JsonAssetWebpackPlugin',
      compilation => {
        compilation.hooks.processAssets.tap(
          {
            name: 'Export2JsonAssetWebpackPlugin',
            stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          assets => {
            const menuConfigAsset = Object.entries(assets).find(
              ([pathname]) => {
                return pathname === this.options.outputPath
              },
            )
            if (menuConfigAsset) {
              const script = menuConfigAsset[1]
                .source()
                .toString()
                .replace(
                  /__webpack_require__\("\.\/node_modules\/webpack-dev-server\/client\/index\.js.*?;/g,
                  '',
                )
              try {
                ;(0, eval)(script)
                const jsonStr = JSON.stringify(global[libraryName].default)
                /** webpack type error */
                ;(compilation.assets as any)[this.options.outputPath] =
                  new RawSource(jsonStr)
              } catch (err) {
                console.log('Export2JsonAssetWebpackPlugin err', err)
                throw err
              }
            }
          },
        )
      },
    )
  }
}
