import path from 'path'
import matter from 'gray-matter'
import LRUCache from 'lru-cache'
import {
  createMarkdownRenderer,
  MarkdownOptions,
  HoistedTags
} from './markdown/markdown'
import { deeplyParseHeader } from './utils/parseHeader'
import { PageData, HeadConfig } from '../../types/shared'

const debug = require('debug')('vitepress:md')
export const cache = new LRUCache<string, MarkdownCompileResult>({ max: 1024 })

interface MarkdownCompileResult {
  vueSrc: string
  pageData: PageData
}

export function createMarkdownToVueRenderFn(
  root: string,
  options: MarkdownOptions = {}
) {
  const md = createMarkdownRenderer(options)

  return (
    src: string,
    file: string,
    lastUpdated: number,
    injectData = true
  ) => {
    const fileFullPath = file
    file = path.relative(root, fileFullPath)

    const cached = cache.get(src)
    if (cached) {
      debug(`[cache hit] ${file}`)
      return cached
    }
    const start = Date.now()

    const { content, data: frontmatter } = matter(src)
    md.realPath = frontmatter?.map?.realPath
    md.urlPath = fileFullPath
    const { html, data } = md.render(content)

    // TODO validate data.links?

    // inject page data
    const pageData: PageData = {
      title: inferTitle(frontmatter, content),
      description: inferDescription(frontmatter),
      frontmatter,
      headers: data.headers,
      relativePath: file.replace(/\\/g, '/'),
      lastUpdated
    }

    data.hoistedTags = data.hoistedTags || {}
    data.hoistedTags.script = data.hoistedTags.script || []
    injectComponentData(data.hoistedTags)

    if (injectData) {
      injectPageData(data.hoistedTags, pageData)
    }

    const vueSrc =
      `<script>${(data.hoistedTags.script ?? []).join('\n')}</script>` +
      `<style>${(data.hoistedTags.style ?? []).join('\n')}</style>` +
      `\n<template><div>${html}</div></template>`

    debug(`[render] ${file} in ${Date.now() - start}ms.`)

    const result = { vueSrc, pageData }
    cache.set(src, result)
    return result
  }
}

function injectPageData(hoistedTags: HoistedTags, data: PageData) {
  const code = `\nexport const __pageData = ${JSON.stringify(
    JSON.stringify(data)
  )}`

  hoistedTags.script?.push(code)
}

function injectComponentData(hoistedTags: HoistedTags) {
  const exportCode = `\nexport default {
    components: {
      ${(hoistedTags.components || []).join(', ')}
    },
  }
  `

  hoistedTags.script?.push(exportCode)
}

const inferTitle = (frontmatter: any, content: string) => {
  if (frontmatter.home) {
    return 'Home'
  }
  if (frontmatter.title) {
    return deeplyParseHeader(frontmatter.title)
  }
  const match = content.match(/^\s*#+\s+(.*)/m)
  if (match) {
    return deeplyParseHeader(match[1].trim())
  }
  return ''
}

const inferDescription = (frontmatter: Record<string, any>) => {
  if (!frontmatter.head) {
    return ''
  }

  return getHeadMetaContent(frontmatter.head, 'description') || ''
}

const getHeadMetaContent = (
  head: HeadConfig[],
  name: string
): string | undefined => {
  if (!head || !head.length) {
    return undefined
  }

  const meta = head.find(([tag, attrs = {}]) => {
    return tag === 'meta' && attrs.name === name && attrs.content
  })

  return meta && meta[1].content
}
