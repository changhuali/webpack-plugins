import { readFileSync } from 'fs'
import { RawSource } from 'webpack-sources'
import { Kind, parse } from 'graphql'
import type {
  DocumentNode,
  FieldNode,
  OperationDefinitionNode,
  OperationTypeNode,
} from 'graphql'
import type { Compiler, NormalModule, Resolver } from 'webpack'

interface GraphqlUsageStatisticsOptions {
  /**
   * output file path
   * @default graphql-usage.json
   */
  outputPath?: string
  /**
   * the react router config output path
   */
  reactRouterConfigOutputPath: string
  /**
   * to check if the path is an entry file
   *
   * e.g. import("@/pages/user/index.tsx")
   * @default (path) => /pages/.test(path)
   */
  entryMatcher?: (path: string) => boolean
  /**
   * to check if the path is a gql file
   *
   * e.g. import { userListDocument } from "/graphql/operations/\__generated\__/user.ts"
   * @default (path) => /graphql\/operations/.test(path)
   */
  gqlFileMatcher?: (path: string) => boolean
}

interface DepInfo {
  operationName: string
  resolver: Resolver
  gqlFilepath: string
}

interface UsageItem {
  operation: OperationTypeNode
  name: string
}

interface RouterConfigItem {
  component: object | string
  authKey?: string
  meta: {
    menu: {
      title: string
    }
    breadcrumb: {
      items: {
        name: string
      }[]
    }
  }
  routes: RouterConfigItem[]
}

export default class GraphqlUsageStatistics {
  depsByEntry: Record<string, DepInfo[]> = {}
  options: Required<GraphqlUsageStatisticsOptions>

  constructor(options: GraphqlUsageStatisticsOptions) {
    this.options = {
      outputPath: options.outputPath || 'graphql-usage.json',
      reactRouterConfigOutputPath: options.reactRouterConfigOutputPath,
      entryMatcher: options.entryMatcher || (path => /pages/.test(path)),
      gqlFileMatcher:
        options.entryMatcher || (path => /graphql\/operations/.test(path)),
    }
  }

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap(
      'GraphqlUsageStatistics',
      (compilation, { normalModuleFactory: factory }) => {
        this.depsByEntry = {}
        const logger = compilation.getLogger('GraphqlUsageStatistics')
        const moduleGraph = compilation.moduleGraph

        factory.hooks.parser
          .for('javascript/auto')
          .tap('GraphqlUsageStatistics', parser => {
            parser.hooks.importSpecifier.tap(
              'GraphqlUsageStatistics',
              (_statement: string, source: string, exportName: string) => {
                if (!this.options.gqlFileMatcher(source)) return

                let operationName: string
                for (const pattern of [
                  /(.*)Document$/,
                  /use(.*)LazyQuery/,
                  /use(.*)Query/,
                  /use(.*)Mutation/,
                ]) {
                  operationName = exportName.match(pattern)?.[1] || ''
                  if (operationName) {
                    const module = parser.state.module as NormalModule
                    const resolver = compilation.resolverFactory.get(
                      'normal',
                      module.resolveOptions,
                    )
                    const gqlFilepath = source
                      .toString()
                      .replace(
                        /__generated__\/(.*)(?=\.ts)?/g,
                        (...args: string[]) => {
                          return `${args[1]}.gql`
                        },
                      )
                    const pathList: string[] = [module.rawRequest]

                    // get the entry path
                    let originModule = moduleGraph.getIssuer(
                      module,
                    ) as NormalModule
                    while (originModule) {
                      if (originModule.rawRequest) {
                        pathList.unshift(originModule.rawRequest)
                      }
                      originModule = moduleGraph.getIssuer(
                        originModule,
                      ) as NormalModule
                    }

                    const entryPath = pathList.find(this.options.entryMatcher)
                    if (entryPath) {
                      let deps = this.depsByEntry[entryPath]
                      if (!deps) {
                        deps = []
                        this.depsByEntry[entryPath] = deps
                      }
                      deps.push({
                        operationName,
                        resolver,
                        gqlFilepath,
                      })
                    } else {
                      logger.warn(
                        `GraphqlUsageStatistics: entryPath for ${exportName} has not been found!`,
                      )
                    }
                    break
                  }
                }
              },
            )
          })

        compilation.hooks.processAssets.tapPromise(
          {
            name: 'GraphqlUsageStatistics',
            stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
          },
          async () => {
            // gen absolute filepath for gql files.
            const promiseArr: Promise<string>[] = []

            const context = {}
            const resolveContext = {}

            const gqlDefinitionMap: Record<string, DocumentNode> = {}
            const usageByEntryMap: Record<string, UsageItem[]> = {}
            Object.entries(this.depsByEntry).forEach(([entry, deps]) => {
              deps.forEach(dep => {
                const { operationName, resolver, gqlFilepath } = dep
                promiseArr.push(
                  new Promise((resolve, reject) => {
                    resolver.resolve(
                      context,
                      compilation.options.context || '',
                      gqlFilepath,
                      resolveContext,
                      (err, result) => {
                        if (err) {
                          reject(err as Error)
                        } else {
                          const gqlAbsFilepath = result as string
                          if (!gqlDefinitionMap[gqlAbsFilepath]) {
                            gqlDefinitionMap[gqlAbsFilepath] = parse(
                              readFileSync(gqlAbsFilepath, 'utf-8'),
                            )
                          }
                          const document = gqlDefinitionMap[gqlAbsFilepath]
                          const definition = document.definitions.find(
                            item =>
                              item.kind === Kind.OPERATION_DEFINITION &&
                              item.name?.value?.toLowerCase() ===
                                operationName.toLowerCase(),
                          ) as OperationDefinitionNode
                          if (definition) {
                            // retrieve real field name of the operationName from gql files
                            if (!usageByEntryMap[entry]) {
                              usageByEntryMap[entry] = []
                            }
                            ;(
                              definition.selectionSet.selections.filter(
                                item => item.kind === Kind.FIELD,
                              ) as FieldNode[]
                            ).forEach(item => {
                              const newItem = {
                                operation: definition.operation,
                                name: item.name.value,
                              }
                              // protect from pushing duplicated items
                              const isExisted = !!usageByEntryMap[entry].find(
                                item =>
                                  item.operation === newItem.operation &&
                                  item.name === newItem.name,
                              )
                              if (!isExisted) {
                                usageByEntryMap[entry].push(newItem)
                              }
                            })
                          }

                          resolve(result as string)
                        }
                      },
                    )
                  }),
                )
              })
            })
            await Promise.allSettled(promiseArr)

            const usageByEntryStr = JSON.stringify(usageByEntryMap)
            if (usageByEntryStr !== '{}') {
              compilation.emitAsset(
                this.options.outputPath,
                new RawSource(usageByEntryStr) as any,
                {
                  rawData: usageByEntryMap,
                },
              )
            }
          },
        )

        compilation.hooks.processAssets.tap(
          {
            name: 'GraphqlUsageStatistics',
            stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
          },
          () => {
            const routerConfig = compilation.assetsInfo.get(
              this.options.reactRouterConfigOutputPath,
            )?.rawData
            const usageByEntryMap = compilation.assetsInfo.get(
              this.options.outputPath,
            )?.rawData
            compilation.deleteAsset(this.options.outputPath)
            if (routerConfig && usageByEntryMap) {
              const usageData = this.collectUsageInRouterConfig(
                routerConfig,
                usageByEntryMap,
              )
              compilation.emitAsset(
                this.options.outputPath,
                new RawSource(JSON.stringify(usageData)) as any,
              )
            }
          },
        )
      },
    )
  }

  collectUsageInRouterConfig(
    routerConfig: RouterConfigItem[],
    usageByEntryMap: Record<string, UsageItem[]>,
  ): any {
    return (routerConfig || [])
      .map(item => {
        const operations =
          typeof item.component === 'string'
            ? usageByEntryMap[item.component] || []
            : []

        let children = this.collectUsageInRouterConfig(
          item.routes,
          usageByEntryMap,
        ).filter((usageItem: any) => {
          if (!usageItem.authKey) {
            operations.push(...usageItem.operations)
          }
          return !!usageItem.authKey
        })
        if (!children.length) {
          children = undefined
        }

        if (!operations?.length && !children) {
          return undefined
        }

        return {
          title:
            item.meta?.breadcrumb?.items?.map(item => item.name).join('/') ||
            item.meta?.menu?.title,
          authKey: item.authKey,
          operations,
          children,
        }
      })
      .filter(Boolean)
  }
}
