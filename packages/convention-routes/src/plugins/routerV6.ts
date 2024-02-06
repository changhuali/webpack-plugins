import { join, parse } from 'path'
import type ConventionRoutesWebpackPlugin from '..'
import type { ConventionRoutes, Plugin } from '../interface'

const tripExtname = (filepath: string) => {
  const { dir, name } = parse(filepath)
  return join(dir, name)
}

const reservedComponentVarMap: Record<string, string> = {
  '/': 'Root',
  '/404': 'NotFound',
}

const reservedPathMap: Record<string, string> = {
  '/404': '*',
}

// /[xxx]
const paramRegexp = /\/\[(.*?)\]/g

// return reserved component var
// /xxx/yyy/[id] -> XxxYyy_ID
const routePath2ComponentVar = (path: string) => {
  const reservedComponentVar = reservedComponentVarMap[path]
  return (
    reservedComponentVar ||
    path
      .replace(paramRegexp, (_, $1) => `_${$1.toUpperCase()}`)
      .replace(/\/([a-z])?/g, (_, $1) => $1?.toUpperCase() || '')
  )
}

// return reserved path
// /xxx/yyy/[id] -> /xxx/yyy/:id
const routePath2Path = (path: string) => {
  return (
    reservedPathMap[path] || path.replace(paramRegexp, (_, $1) => `/:${$1}`)
  )
}

export default class RouterV6Plugin implements Plugin {
  apply(conventionRoutesWebpackPlugin: ConventionRoutesWebpackPlugin): void {
    conventionRoutesWebpackPlugin.hooks.routes.tapAsync(
      'RouterV6Plugin',
      async (conventionRoutes, callback) => {
        try {
          const headers: string[] = [`import React, { lazy } from 'react'`]
          const declarations: string[] = []
          const body: string[] = []
          const buildRoutes = async (conventionRoutes: ConventionRoutes) => {
            const routesContent: string[] = []
            for (const route of conventionRoutes) {
              const componentVar = routePath2ComponentVar(route.routePath)
              const path = routePath2Path(route.routePath)
              const routeBody: string[] = []

              const componentPath = `@/${tripExtname(route.importPath)}`
              declarations.push(
                `const ${componentVar} = lazy(() => import('${componentPath}'))`,
              )
              // /[id] -> /:id
              routeBody.push(`path: '${path}'`)
              routeBody.push(`element: <${componentVar} />`)
              // const metaFilepath = route.metaFilepath
              // if (metaFilepath) {
              //   routeBody.push(await createMeta(metaFilepath, componentVar))
              // }
              const childrenRoutes = await buildRoutes(route.children)
              routeBody.push(`children: ${childrenRoutes}`)

              routesContent.push(`{${routeBody.filter(Boolean).join(',\n')}}`)
            }
            return `[${routesContent.join(',\n')}]`
          }
          const routes = await buildRoutes(conventionRoutes)
          headers.push('')
          declarations.push('')
          body.push(`const routes = ${routes}`)
          body.push('')
          body.push(`export default routes`)

          callback(
            null,
            `${headers.concat(declarations).concat(body).join('\n')}`,
          )
        } catch (err) {
          callback(err as Error)
        }
      },
    )
  }
}
