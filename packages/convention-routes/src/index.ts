import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AsyncSeriesBailHook, AsyncSeriesWaterfallHook } from 'tapable'
import ResolvePlugin from './plugins/resolve'
import RouterV6Plugin from './plugins/routerV6'
import type { ConventionRoute, ConventionRoutes, Plugin } from './interface'
import type { Compilation, Compiler } from 'webpack'

type MatchFn = (filepath: string) => boolean
export interface ConventionRoutesOptions {
  resolve: {
    root: string
    pages: string
    mainFile: string
    extensions: string[]
    ignore: (RegExp | MatchFn)[]
  }
  plugins: Plugin[]
}

interface ConventionRoutesHooks {
  conventionRoutes: AsyncSeriesBailHook<[Compiler], ConventionRoutes>
  afterResolve: AsyncSeriesWaterfallHook<[ConventionRoute]>
  afterConventionRoutes: AsyncSeriesWaterfallHook<[ConventionRoutes]>
  routes: AsyncSeriesBailHook<[ConventionRoutes], string>
}

export default class ConventionRoutesWebpackPlugin {
  options: ConventionRoutesOptions
  hooks: ConventionRoutesHooks
  constructor(options: ConventionRoutesOptions) {
    this.options = options
    this.hooks = {
      conventionRoutes: new AsyncSeriesBailHook(['compiler']),
      afterResolve: new AsyncSeriesWaterfallHook(['ConventionRoute']),
      afterConventionRoutes: new AsyncSeriesWaterfallHook(['conventionRoutes']),
      routes: new AsyncSeriesBailHook(['conventionRoutes']),
    }

    this.applyCustomerPlugins()
    this.applyBuiltInPlugins()
  }

  private applyCustomerPlugins() {
    this.options.plugins.forEach(plugin => {
      plugin.apply(this)
    })
  }

  private applyBuiltInPlugins() {
    new ResolvePlugin().apply(this)
    new RouterV6Plugin().apply(this)
  }

  apply(compiler: Compiler) {
    const { resolve } = this.options
    const pagesDir = join(resolve.root, resolve.pages)
    const fanDir = join(pagesDir, '..', '.fan')

    compiler.hooks.initialize.tap('ConventionRoutesWebpackPlugin', () => {
      const ignored = compiler.options.watchOptions.ignored
      const newIgnoredItem = `${fanDir}/**`
      if (typeof ignored === 'string') {
        compiler.options.watchOptions.ignored = [ignored, newIgnoredItem]
      } else if (Array.isArray(ignored)) {
        ignored.push(newIgnoredItem)
      } else if (!ignored) {
        compiler.options.watchOptions.ignored = newIgnoredItem
      } else {
        throw new Error(
          `watchOptions.ignored should be type of string/array/undefined but get ${typeof ignored}`,
        )
      }
    })

    let compilation!: Compilation
    compiler.hooks.done.tap('ConventionRoutesWebpackPlugin', () => {
      // compilation.fileDependencies.clear()
      compilation.contextDependencies.add(pagesDir)
    })
    compiler.hooks.thisCompilation.tap(
      'ConventionRoutesWebpackPlugin',
      (_compilation, { normalModuleFactory }) => {
        compilation = _compilation
        compilation.hooks.stillValidModule.tap(
          'ConventionRoutesWebpackPlugin',
          module => {
            // console.log(module.getsour)
          },
        )
      },
    )

    const handler = (compiler: Compiler, callback: (err?: Error) => void) => {
      // TODO: cache

      this.hooks.conventionRoutes.callAsync(
        compiler,
        (err, conventionRoutes) => {
          if (err) {
            return callback(err)
          }

          this.hooks.afterConventionRoutes.callAsync(
            conventionRoutes || [],
            (err, conventionRoutes) => {
              if (err) {
                return callback(err)
              }

              this.hooks.routes.callAsync(
                conventionRoutes || [],
                (err, routes) => {
                  if (err || !routes) {
                    return callback(err || new Error('no routes found'))
                  }

                  let error!: Error
                  try {
                    if (!existsSync(fanDir)) {
                      mkdirSync(fanDir, {
                        recursive: true,
                      })
                    }
                    const filename = join(fanDir, 'routes.tsx')
                    writeFileSync(filename, routes)
                  } catch (err) {
                    error = err as Error
                  }
                  callback(error)
                },
              )
            },
          )
        },
      )
    }
    compiler.hooks.run.tapAsync('ConventionRoutesWebpackPlugin', handler)
    compiler.hooks.watchRun.tapAsync('ConventionRoutesWebpackPlugin', handler)
  }
}
