import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { buildCatalog } from '../src/catalog.ts'
import { ANTIGRAVITY_AUTH_FILENAME, OAUTH_AUTH_FILENAME } from '../src/ids.ts'

function llmStub(options: {
  providers: { id: string; name: string }[]
  models: Record<string, { id: string; name: string }[]>
  efforts?: Record<string, { id: string; name: string }[]>
}) {
  return {
    listProviders: () => options.providers,
    async listModels(provider: string) {
      return options.models[provider] ?? []
    },
    async resolveModelInfo(provider: string, model: string) {
      const key = `${provider}::${model}`
      const efforts = options.efforts?.[key]
      return {
        id: model,
        name: model,
        ...efforts ? { reasoning: { efforts } } : {},
      }
    },
  }
}

describe('buildCatalog', () => {
  it('is empty and inherit-only when nothing is logged in', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-empty-'))
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({ providers: [], models: {} }),
    })
    assert.equal(catalog.selectableCount, 0)
    assert.equal(catalog.inheritParent, true)
    assert.equal(catalog.recommendOauthLogin, true)
    assert.match(catalog.emptyReason ?? '', /dsh-oauth-login/)
    assert.equal(catalog.routes.length, 0)
  })

  it('omits a registered adapter with no configured key', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-nokey-'))
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({
        providers: [{ id: 'deepseek-official', name: 'DeepSeek' }],
        models: { 'deepseek-official': [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] },
      }),
      credentials: {
        async describe() {
          return { configured: false }
        },
      },
    })
    assert.equal(catalog.selectableCount, 0)
    assert.equal(catalog.routes.length, 0)
  })

  it('lists a DeepSeek route only when the key is configured', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-key-'))
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({
        providers: [{ id: 'deepseek-official', name: 'DeepSeek' }],
        models: { 'deepseek-official': [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] },
        efforts: { 'deepseek-official::deepseek-chat': [{ id: 'high', name: 'High' }] },
      }),
      credentials: {
        async describe(ref: string) {
          return { configured: ref === 'DEEPSEEK_API_KEY' }
        },
      },
    })
    assert.equal(catalog.selectableCount, 1)
    assert.equal(catalog.routes[0]?.provider, 'deepseek-official')
    assert.equal(catalog.routes[0]?.model, 'deepseek-chat')
    assert.equal(catalog.routes[0]?.selectable, true)
    assert.deepEqual(catalog.routes[0]?.efforts.map(effort => effort.id), ['high'])
  })

  it('does not list unsigned-in vendor ids from a missing oauth store', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-novendor-'))
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({
        providers: [{ id: 'openai', name: 'OpenAI' }],
        models: { openai: [{ id: 'gpt-4', name: 'GPT-4' }] },
      }),
    })
    assert.equal(catalog.routes.some(route => route.provider === 'openai'), false)
  })

  it('lists the live local Cursor passthrough route without a DSH credential record', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-cursor-'))
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({
        providers: [{ id: 'cursor', name: 'Cursor passthrough' }],
        models: {
          cursor: [
            { id: 'grok-4.6-fast-xhigh', name: 'Cursor Grok 4.6 Extra High Fast' },
            { id: 'claude-fable-5-1-thinking-max', name: 'Claude Fable 5.1 Max Thinking' },
          ],
        },
      }),
    })

    assert.equal(catalog.selectableCount, 2)
    assert.deepEqual(catalog.routes.map(route => route.provider), ['cursor', 'cursor'])
    assert.deepEqual(catalog.routes.map(route => route.source), ['local', 'local'])
  })

  it('surfaces signed-in oauth store ids that are not yet registered', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-oauth-'))
    await writeFile(
      join(home, OAUTH_AUTH_FILENAME),
      JSON.stringify({ credentials: { anthropic: { token: 'redacted-in-real-store' } } }),
      'utf8',
    )
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({ providers: [], models: {} }),
    })
    const hinted = catalog.routes.find(route => route.provider === 'pi-anthropic')
    assert.ok(hinted)
    assert.equal(hinted.selectable, false)
    assert.match(hinted.hint ?? '', /dsh-oauth-login/)
    assert.equal(catalog.selectableCount, 0)
  })

  it('lists a live pi-* route when the adapter is registered and the store is signed in', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-pi-'))
    await writeFile(
      join(home, OAUTH_AUTH_FILENAME),
      JSON.stringify({ credentials: { anthropic: {} } }),
      'utf8',
    )
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({
        providers: [{ id: 'pi-anthropic', name: 'Claude' }],
        models: { 'pi-anthropic': [{ id: 'claude-sonnet-4-6', name: 'Sonnet' }] },
        efforts: {},
      }),
    })
    assert.equal(catalog.selectableCount, 1)
    assert.equal(catalog.routes[0]?.provider, 'pi-anthropic')
    assert.equal(catalog.routes[0]?.source, 'oauth')
    assert.equal(catalog.routes[0]?.efforts.length, 0)
    assert.equal(catalog.recommendOauthLogin, false)
  })

  it('discovers new login providers without a duplicated provider allowlist', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-new-provider-'))
    await writeFile(join(home, OAUTH_AUTH_FILENAME), JSON.stringify({
      credentials: {
        'zai-coding-cn': { key: 'fixture-secret' },
        'future-provider': {},
        'not-registered': {},
      },
    }))
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({
        providers: [
          { id: 'pi-zai-coding-cn', name: 'GLM' },
          { id: 'pi-future-provider', name: 'Future provider' },
          { id: 'pi-signed-out', name: 'Signed out' },
          { id: 'zai-coding-cn', name: 'Unrelated adapter' },
        ],
        models: {
          'pi-zai-coding-cn': [{ id: 'glm-5.3-flash', name: 'GLM' }],
          'pi-future-provider': [{ id: 'live-model', name: 'Live model' }],
          'pi-signed-out': [{ id: 'not-selectable', name: 'Not selectable' }],
          'zai-coding-cn': [{ id: 'not-selectable', name: 'Not selectable' }],
        },
      }),
    })
    assert.deepEqual(catalog.routes.filter(route => route.selectable).map(route => route.provider), [
      'pi-zai-coding-cn', 'pi-future-provider',
    ])
    assert.doesNotMatch(JSON.stringify(catalog), /fixture-secret/)
  })

  it('surfaces signed-in antigravity oauth store when not yet registered', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-antigravity-hint-'))
    await writeFile(
      join(home, ANTIGRAVITY_AUTH_FILENAME),
      JSON.stringify({
        version: 1,
        credential: {
          type: 'oauth',
          access: 'ya29.test',
          refresh: '1//test',
          expires: Date.now() + 3600_000,
          projectId: 'test-project',
          email: 'user@example.com',
        },
      }),
      'utf8',
    )
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({ providers: [], models: {} }),
    })
    const hinted = catalog.routes.find(route => route.provider === 'agy-google-antigravity')
    assert.ok(hinted)
    assert.equal(hinted.selectable, false)
    assert.equal(hinted.providerName, 'Google Antigravity')
    assert.match(hinted.hint ?? '', /dsh-antigravity-oauth/)
    assert.equal(catalog.selectableCount, 0)
    assert.equal(catalog.recommendOauthLogin, false)
    assert.deepEqual(catalog.oauthSignedInProviders, ['antigravity'])
  })

  it('lists live agy-* route when adapter is registered and .dsh-antigravity-oauth.json is signed in', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-antigravity-live-'))
    await writeFile(
      join(home, ANTIGRAVITY_AUTH_FILENAME),
      JSON.stringify({
        version: 1,
        credential: {
          type: 'oauth',
          access: 'ya29.test',
          refresh: '1//test',
          expires: Date.now() + 3600_000,
          projectId: 'test-project',
          email: 'user@example.com',
        },
      }),
      'utf8',
    )
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({
        providers: [{ id: 'agy-google-antigravity', name: 'Google Antigravity' }],
        models: {
          'agy-google-antigravity': [
            { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
            { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
          ],
        },
        efforts: {
          'agy-google-antigravity::gemini-3.8-flash': [
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
          ],
        },
      }),
    })
    assert.equal(catalog.selectableCount, 2)
    assert.equal(catalog.oauthPluginPresent, true)
    assert.equal(catalog.oauthStorePresent, true)
    assert.deepEqual(catalog.oauthSignedInProviders, ['antigravity'])
    const m38 = catalog.routes.find(route => route.model === 'gemini-3.8-flash')
    assert.ok(m38)
    assert.equal(m38.provider, 'agy-google-antigravity')
    assert.equal(m38.source, 'oauth')
    assert.equal(m38.selectable, true)
    assert.deepEqual(m38.efforts.map(e => e.id), ['low', 'medium', 'high'])
  })

  it('does not list antigravity when .dsh-antigravity-oauth.json is missing projectId', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pstack-dsh-antigravity-noproj-'))
    await writeFile(
      join(home, ANTIGRAVITY_AUTH_FILENAME),
      JSON.stringify({
        version: 1,
        credential: {
          type: 'oauth',
          access: 'ya29.test',
          refresh: '1//test',
          expires: Date.now() + 3600_000,
          email: 'user@example.com',
        },
      }),
      'utf8',
    )
    const catalog = await buildCatalog({
      dshHome: home,
      env: {},
      llm: llmStub({
        providers: [{ id: 'agy-google-antigravity', name: 'Google Antigravity' }],
        models: { 'agy-google-antigravity': [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }] },
      }),
    })
    assert.equal(catalog.selectableCount, 0)
    assert.equal(catalog.routes.length, 0)
  })
})
