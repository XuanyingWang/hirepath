// ── ANALYSIS ──────────────────────────────────────────────────────────────────
import { invoke } from '@tauri-apps/api/core'
import { t } from './i18n.js'
import { updateLoading } from './util.js'
import { claude } from './api.js'

export async function buildAnalysis(name, url, pasteContent = '') {
  const sys = `你是一名资深 Google L5 工程师，正在为备考 L5 面试的候选人撰写高质量的中文技术学习笔记。
【重要规则】：
- 所有输出必须使用中文（技术术语、API名称、代码注释除外）
- 使用 Markdown 格式
- 内容要精炼、有深度，适合 L5 级别面试备考
- 代码示例必须放在正确的 Markdown 代码块（\`\`\`语言\n代码\n\`\`\`）中，不要把代码混在正文段落里`

  // Step 1 – obtain page content (fetched or pasted)
  let pageContent = pasteContent
  if (!pageContent) {
    updateLoading(t('正在获取页面内容…', 'Fetching page content…'), url)
    try {
      pageContent = await invoke('fetch_url', { url })
    } catch (fetchErr) {
      pageContent = `[注：页面内容自动获取失败（${fetchErr}）— 以下分析基于 AI 训练数据]`
    }
  }

  // Step 2 – AI deep analysis (two calls run in parallel for speed)
  updateLoading(t('正在 AI 深度分析…', 'AI deep-analyzing…'), `Claude ${t('正在解析', 'is analyzing')}「${name}」`)

  const context = `参考文档：${url}\n\n文档内容：\n${pageContent}\n\n---\n\n`

  const [p1, p2] = await Promise.all([
    claude(sys,
      context +
      `请为 Google L5 面试备考「${name}」的学习笔记（第一部分）。
只输出以下两个章节（用中文写作）：

## 🔑 核心概念
列出 5-6 个核心术语/概念。每条格式：**术语** → 用两句话精炼解释其定义和作用。

## 🏗️ 架构与设计
描述整体架构：核心组件、子组件的交互方式、使用的设计模式。
如果有多个子组件或方案，用 Markdown 表格对比。
包含一个简短的代码示例（放在 \`\`\` 代码块中），展示核心 API 或关键交互逻辑。`, 4000),

    claude(sys,
      context +
      `请为 Google L5 面试备考「${name}」的学习笔记（第二部分）。
只输出以下章节（用中文写作）：

## ⚙️ 实现细节
内部实现机制、算法、数据结构。包含一个代码片段（放在 \`\`\` 代码块中）说明关键实现。

## 📊 性能与权衡
延迟/吞吐重点特性、可扩展性、CAP 相关性、与替代方案的对比表格。

## ✅ 最佳实践 & ⚠️ 常见陷阱
最佳实践用 bullet list 列出。常见陷阱用编号列表列出，要具体有针对性。

## 🎯 L5 高频考点
恰好 6 条 bullet。格式：**考点主题** → 一句话说明为什么这是 L5 必考点。`, 4000)
  ])

  return p1 + '\n\n---\n\n' + p2
}
