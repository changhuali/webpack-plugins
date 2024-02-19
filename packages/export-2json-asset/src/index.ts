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

export const libraryName = '__default_export_json_asset__'
export default class Export2JsonAssetWebpackPlugin {
  options: Export2JsonAssetOptions
  constructor(options: Export2JsonAssetOptions) {
    this.options = options
  }
  apply(compiler: Compiler) {
    new compiler.webpack.EntryPlugin(compiler.context, this.options.entryPath, {
      name: libraryName,
      filename: this.options.outputPath,
      layer: this.options.outputPath,
      baseUri: '/',
      library: {
        name: libraryName,
        type: 'umd',
      },
    }).apply(compiler)
    compiler.hooks.compilation.tap(
      'Export2JsonAssetWebpackPlugin',
      compilation => {
        const logger = compilation.getLogger('Export2JsonAssetWebpackPlugin')

        compilation.hooks.processAssets.tap(
          {
            name: 'Export2JsonAssetWebpackPlugin',
            stage:
              compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_PRE_PROCESS,
          },
          () => {
            const menuConfigAsset = compilation.getAsset(
              this.options.outputPath,
            )
            if (menuConfigAsset) {
              const script = menuConfigAsset.source
                .source()
                .toString()
                .replace(
                  /__webpack_require__\("\.\/node_modules\/webpack-dev-server\/client\/index\.js.*?;/g,
                  '',
                )
              try {
                ;(0, eval)(script)
                const jsonObj = global[libraryName].default
                const jsonStr = JSON.stringify(jsonObj)
                compilation.updateAsset(
                  this.options.outputPath,
                  new RawSource(jsonStr) as any,
                  {
                    ...menuConfigAsset.info,
                    rawData: jsonObj,
                  },
                )
              } catch (err) {
                logger.error('Export2JsonAssetWebpackPlugin: ', err)
                throw err
              }
            }
          },
        )
      },
    )
  }
}
