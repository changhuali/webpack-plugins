const reactRouterComponent2filepathLoader = (content: string) => {
  // convert loadable(
  //   () => import('@/pages/production-management/report-form-supervision/damage'),
  // ) to "@/pages/production-management/report-form-supervision/damage"
  const newContent = content.replace(
    /loadable\s*\(\s*\(\)\s*=>\s*import\s*\(\s*(['"`])(.*?)\1\s*\),?\s*\)/g,
    (...args) => `"${args[2]}"`,
  )
  return newContent
}

export default reactRouterComponent2filepathLoader
