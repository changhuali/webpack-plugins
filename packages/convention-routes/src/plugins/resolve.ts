import { existsSync, lstatSync, readdirSync, statSync } from 'fs'
import { extname, join, parse, relative, resolve, sep } from 'path'
import type { ConventionRoutesOptions } from '..'
import type ConventionRoutesWebpackPlugin from '..'
import type { ConventionRoutes, Plugin } from '../interface'

type ResolveOptions = ConventionRoutesOptions['resolve']

const ALIAS_NAME = 'pages'

export const isConventionRoute = (
  filepath: string,
  options: ResolveOptions,
) => {
  const { extensions, ignore } = options
  const ext = extname(filepath)
  return (
    extensions.includes(ext) &&
    !ignore.some(item => {
      if (typeof item === 'function') {
        return item(filepath)
      }
      return item.test(filepath)
    })
  )
}

/**
 * resolve files to generate convention routes.
 */
export default class ResolvePlugin implements Plugin {
  apply(conventionRoutesWebpackPlugin: ConventionRoutesWebpackPlugin): void {
    conventionRoutesWebpackPlugin.hooks.conventionRoutes.tapAsync(
      'ResolvePlugin',
      (compiler, callback) => {
        try {
          const buildRoutes = (currDir: string) => {
            const { root, pages, mainFile } = resolveOptions
            const pagesDir = join(root, pages)

            const routes: ConventionRoutes = []
            const subRoutes: ConventionRoutes = []
            const files = readdirSync(currDir)
            for (const filename of files) {
              const filepath = resolve(currDir, filename)
              const { name, dir } = parse(filepath)

              const filepathStat = lstatSync(filepath)
              if (
                filepathStat.isFile() &&
                isConventionRoute(filepath, resolveOptions)
              ) {
                if (name === mainFile) {
                  const routePath = `${sep}${relative(pagesDir, dir)}`
                  const conventionRoute = {
                    importPath: join(ALIAS_NAME, relative(pagesDir, filepath)),
                    routePath: routePath.toLowerCase(),
                    children: subRoutes,
                  }
                  // hook the resolved result to enable plugins have a chance to modify the result.
                  conventionRoutesWebpackPlugin.hooks.afterResolve.callAsync(
                    conventionRoute,
                    (err, result) => {
                      if (err) {
                        return callback(err)
                      }
                      if (result) {
                        routes.push(result)
                      }
                    },
                  )
                } else {
                  const routePath = `${sep}${relative(
                    pagesDir,
                    join(dir, name),
                  )}`
                  const conventionRoute = {
                    importPath: join(ALIAS_NAME, relative(pagesDir, filepath)),
                    routePath: routePath.toLowerCase(),
                    children: [],
                  }
                  // ditto
                  conventionRoutesWebpackPlugin.hooks.afterResolve.callAsync(
                    conventionRoute,
                    (err, result) => {
                      if (err) {
                        return callback(err)
                      }
                      if (result) {
                        subRoutes.push(result)
                      }
                    },
                  )
                }
              } else if (filepathStat.isDirectory()) {
                const children = buildRoutes(filepath)
                subRoutes.push(...children)
              }
            }

            return routes.length ? routes : subRoutes
          }

          const resolveOptions = conventionRoutesWebpackPlugin.options.resolve
          const pagesDir = join(resolveOptions.root, resolveOptions.pages)
          if (!existsSync(pagesDir) || !statSync(pagesDir).isDirectory()) {
            return callback(new Error(`pages dir ${pagesDir} is not exist`))
          }

          // inject a resolve.alias config to enable 'importPath' could be resolved by bundler.
          const resolveAlias = compiler.options.resolve.alias || {}
          if (!Array.isArray(resolveAlias)) {
            resolveAlias[ALIAS_NAME] = pagesDir
          }

          const conventionRoutes = buildRoutes(pagesDir)
          callback(null, conventionRoutes)
        } catch (err) {
          callback(err as Error)
        }
      },
    )
  }
}
