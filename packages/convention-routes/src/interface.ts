import type ConventionRoutesWebpackPlugin from '.'

export interface ConventionRoute {
  importPath: string
  routePath: string
  children: ConventionRoute[]
}
export type ConventionRoutes = ConventionRoute[]

export interface Plugin {
  apply(conventionRoutesWebpackPlugin: ConventionRoutesWebpackPlugin): void
}
