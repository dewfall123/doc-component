import MarkdownIt from 'markdown-it'
import { MarkdownParsedData } from '../markdown'
import fs from 'fs'
import path from 'path'
import { highlight } from './highlight'

let index = 1
// hoist <script> and <style> tags out of the returned html
// so that they can be placed outside as SFC blocks.
export const demoPlugin = (md: MarkdownIt) => {
  const RE = /<demo /i

  md.renderer.rules.html_inline = (tokens, idx) => {
    const content = tokens[idx].content
    const data = (md as any).__data as MarkdownParsedData
    const hoistedTags =
      data.hoistedTags ||
      (data.hoistedTags = {
        script: [],
        style: [],
        components: []
      })

    if (RE.test(content.trim())) {
      const componentName = `demo${index++}`
      const src = (content.match(/src=("|')(\S+)('|")/) || [])[2] ?? ''
      let language = (content.match(/language=("|')(.*)('|")/) || [])[2] ?? ''
      const srcPath = path.resolve((global as any).fileRoot, src)
      if (!src || !fs.existsSync(srcPath)) {
        const warningMsg = `${srcPath} does not exist!`
        console.warn(`[vitepress]: ${warningMsg}`)
        return `<demo src="${src}" >
        <p>${warningMsg}</p>`
      }
      if (!language) {
        language = (src.match(/\.(.+)$/) || [])[1] ?? 'vue'
      }

      console.log(`srcPath=${srcPath}`)
      const codeStr = fs.readFileSync(srcPath).toString()
      const htmlStr = encodeURIComponent(highlight(codeStr, language))

      hoistedTags.script!.unshift(`import ${componentName} from '${src}' \n`)
      hoistedTags.components!.push(componentName)

      return content.replace(
        '>',
        ` componentName="${componentName}" htmlStr="${htmlStr}" codeStr="${encodeURIComponent(
          codeStr
        )}" >
        <${componentName}></${componentName}>
        `
      )
    } else {
      return content
    }
  }
}