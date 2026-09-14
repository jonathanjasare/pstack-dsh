import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { RoleEffortMap } from '../src/request-overlay.ts'
import { createSkillProvider } from '../src/skills-provider.ts'
import { spawnTool } from '../src/tools.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS = join(ROOT, 'skills')

const FORBIDDEN: { id: string; re: RegExp; allow?: string[] }[] = [
  { id: 'AskQuestion', re: /AskQuestion/, allow: ['skills/setup-pstack/references/spawn.md'] },
  { id: 'TodoWrite', re: /TodoWrite/ },
  { id: 'pstack-models.mdc', re: /pstack-models\.mdc/ },
  { id: 'claude-fable-5-thinking-max', re: /claude-fable-5-thinking-max/ },
  { id: 'gpt-5.6-sol-max', re: /gpt-5\.6-sol-max/ },
  { id: 'grok-4.6-fast-xhigh', re: /grok-4\.6-fast-xhigh/ },
  { id: 'claude-opus-5-thinking-xhigh', re: /claude-opus-5-thinking-xhigh/ },
  { id: 'subagent_type assignment', re: /subagent_type:/, allow: ['skills/setup-pstack/references/spawn.md'] },
  { id: 'get_task_output', re: /get_task_output/ },
  { id: 'cursor-team-kit', re: /cursor-team-kit/ },
  { id: '/deslop', re: /\/deslop/ },
  { id: 'environment cloud', re: /environment:\s*"cloud"/ },
]

async function walkMd(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, name.name)
    if (name.isDirectory()) out.push(...await walkMd(path))
    else if (name.name.endsWith('.md')) out.push(path)
  }
  return out
}

describe('skill call sites', () => {
  it('does not keep Cursor/Grok spawn fields in playbooks', async () => {
    const files = await walkMd(SKILLS)
    const hits: string[] = []
    for (const file of files) {
      const rel = file.slice(ROOT.length + 1)
      const text = await readFile(file, 'utf8')
      for (const rule of FORBIDDEN) {
        if (rule.allow?.includes(rel)) continue
        if (rule.re.test(text)) hits.push(`${rel}: ${rule.id}`)
      }
    }
    assert.deepEqual(hits, [])
  })

  it('does not invoke the retired how-critics role from skills', async () => {
    const hits: string[] = []
    for (const file of await walkMd(SKILLS)) {
      const text = await readFile(file, 'utf8')
      // Match JSON, YAML, and JavaScript role arguments while allowing retirement notes.
      if (/["']?role["']?\s*[:=]\s*["'`]?how-critics\b/.test(text)
        || /pstack_spawn[^\n]*\bhow-critics\b/.test(text)) {
        hits.push(file.slice(ROOT.length + 1))
      }
    }
    assert.deepEqual(hits, [])
  })

  it('registers poteto-mode as kebab-case', async () => {
    const provider = createSkillProvider(SKILLS)
    const listed = await provider.list()
    assert.ok(listed.some(skill => skill.name === 'poteto-mode'))
    assert.ok(!listed.some(skill => skill.name === 'Poteto Mode'))
    const loaded = await provider.get({ name: 'poteto-mode' })
    assert.ok(loaded)
    assert.match(loaded.content, /pstack_spawn/)
  })

  it('makes Arena artifact handoff authoritative in DSH', async () => {
    const arena = await readFile(join(SKILLS, 'arena', 'SKILL.md'), 'utf8')
    assert.match(arena, /only completion channel/)
    assert.match(arena, /Do not invoke `\/poteto-mode` from a candidate/)
    assert.match(arena, /`send_message` as optional/)
    assert.match(arena, /inspect the assigned directory after settlement/)
  })

  it('exposes pstack_spawn without model or effort fields', () => {
    const tool = spawnTool({
      roles: new RoleEffortMap(),
    })
    const keys = Object.keys(tool.parameters)
    assert.deepEqual(keys.sort(), ['description', 'prompt', 'role', 'route_index', 'run_in_background'])
    assert.ok(!('model' in tool.parameters))
    assert.ok(!('reasoning_effort' in tool.parameters))
    assert.ok(!('thinking' in tool.parameters))
    assert.ok(!('isolation' in tool.parameters))
    assert.ok(!('subagent_type' in tool.parameters))
  })
})
