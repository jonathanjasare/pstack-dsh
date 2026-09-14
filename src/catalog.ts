import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ANTIGRAVITY_AUTH_FILENAME,
  ANTIGRAVITY_PROVIDER,
  DEEPSEEK_API_KEY_ENV,
  DEEPSEEK_PROVIDER,
  OAUTH_AUTH_FILENAME,
  OAUTH_AUTH_LEGACY_FILENAME,
} from './ids.ts'
import { resolveDshHome } from './home.ts'
import {
  OAUTH_ROUTE_BY_STORE_ID,
  storeIdForRoute,
  type CatalogResult,
  type LiveEffort,
  type LiveRoute,
} from './catalog-types.ts'
import { readOverlay } from './overlay.ts'

export type { CatalogResult, LiveEffort, LiveRoute } from './catalog-types.ts'

const API_KEY_REF = /^[A-Za-z_][A-Za-z0-9_]*$/

interface LlmLike {
  listProviders(): { id: string; name: string }[]
  listConfigurableProviders?(): { provider: string; displayName: string; settingsNs: string; settingsPath: readonly string[] }[]
  listModels(provider: string): Promise<{ id: string; name: string }[]>
  resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<{
    id: string
    name: string
    reasoning?: { efforts: LiveEffort[]; defaultEffort?: string }
  }>
}

interface CredentialsLike {
  describe(ref: string): Promise<{ configured: boolean; source?: string }>
}

interface SettingsLike {
  describe(options?: { redactSecrets?: boolean }): unknown[]
}

export interface CatalogHost {
  llm?: LlmLike
  credentials?: CredentialsLike
  settings?: SettingsLike
  dshHome?: string
  env?: NodeJS.ProcessEnv
  nowProviders?: () => string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectApiKeyEnvRefs(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectApiKeyEnvRefs(item, out)
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (key === 'apiKeyEnv' && typeof child === 'string' && API_KEY_REF.test(child)) out.add(child)
    else collectApiKeyEnvRefs(child, out)
  }
}

function sliceAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

function settingsValue(entry: unknown): unknown {
  if (!isRecord(entry)) return undefined
  return entry.value ?? entry.base ?? entry.user
}

function settingsNs(entry: unknown): string | undefined {
  if (!isRecord(entry)) return undefined
  return typeof entry.ns === 'string' ? entry.ns : undefined
}

async function refConfigured(credentials: CredentialsLike | undefined, env: NodeJS.ProcessEnv, ref: string): Promise<boolean> {
  if (credentials !== undefined) {
    try {
      const info = await credentials.describe(ref)
      return info.configured === true
    } catch {
      return false
    }
  }
  const ambient = env[ref]
  return typeof ambient === 'string' && ambient.trim().length > 0
}

async function readOauthStoreIds(dshHome: string): Promise<{ present: boolean; ids: string[] }> {
  const candidates = [join(dshHome, OAUTH_AUTH_FILENAME), join(dshHome, OAUTH_AUTH_LEGACY_FILENAME)]
  let present = false
  const ids = new Set<string>()
  for (const filename of candidates) {
    try {
      const text = await readFile(filename, 'utf8')
      const parsed: unknown = JSON.parse(text)
      if (!isRecord(parsed) || !isRecord(parsed.credentials)) continue
      present = true
      for (const key of Object.keys(parsed.credentials)) ids.add(key)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      present = true
      break
    }
  }

  try {
    const text = await readFile(join(dshHome, ANTIGRAVITY_AUTH_FILENAME), 'utf8')
    const parsed: unknown = JSON.parse(text)
    if (isRecord(parsed) && isRecord(parsed.credential)) {
      present = true
      const cred = parsed.credential
      if (
        cred.type === 'oauth'
        && typeof cred.projectId === 'string'
        && cred.projectId.trim().length > 0
        && typeof cred.expires === 'number'
        && cred.expires > 0
      ) {
        ids.add('antigravity')
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      present = true
    }
  }

  return { present, ids: [...ids] }
}

function effortsOf(info: { reasoning?: { efforts: LiveEffort[]; defaultEffort?: string } }): {
  efforts: LiveEffort[]
  defaultEffort?: string
} {
  const reasoning = info.reasoning
  if (reasoning === undefined || !Array.isArray(reasoning.efforts)) return { efforts: [] }
  return {
    efforts: reasoning.efforts.map(effort => ({
      id: effort.id,
      name: effort.name,
      ...effort.description === undefined ? {} : { description: effort.description },
    })),
    ...reasoning.defaultEffort === undefined ? {} : { defaultEffort: reasoning.defaultEffort },
  }
}

/**
 * Live logged-in routes only. No vendor catalog. No invented slugs.
 */
export async function buildCatalog(host: CatalogHost, signal?: AbortSignal): Promise<CatalogResult> {
  const dshHome = host.dshHome ?? resolveDshHome(host.env)
  const env = host.env ?? process.env
  const overlay = await readOverlay(dshHome)
  const oauth = await readOauthStoreIds(dshHome)
  const llm = host.llm
  const providers = llm?.listProviders() ?? []
  const registered = new Set(providers.map(provider => provider.id))
  const oauthPluginPresent = [...registered].some(id => id.startsWith('pi-') || id === ANTIGRAVITY_PROVIDER || id.startsWith('agy-'))
  const recommendOauthLogin = oauth.ids.length === 0 && !oauthPluginPresent

  const refsByProvider = new Map<string, Set<string>>()
  const remember = (provider: string, ref: string) => {
    const set = refsByProvider.get(provider) ?? new Set<string>()
    set.add(ref)
    refsByProvider.set(provider, set)
  }

  if (host.settings !== undefined) {
    let described: unknown[] = []
    try {
      described = host.settings.describe({ redactSecrets: true })
    } catch {
      described = []
    }
    const configurable = llm?.listConfigurableProviders?.() ?? []
    for (const entry of described) {
      const ns = settingsNs(entry)
      const value = settingsValue(entry)
      for (const row of configurable) {
        if (ns !== undefined && row.settingsNs !== ns) continue
        const slice = row.settingsPath.length === 0 ? value : sliceAtPath(value, row.settingsPath)
        const refs = new Set<string>()
        collectApiKeyEnvRefs(slice ?? value, refs)
        for (const ref of refs) remember(row.provider, ref)
      }
    }
  }

  for (const provider of providers) {
    if (provider.id === DEEPSEEK_PROVIDER) remember(provider.id, DEEPSEEK_API_KEY_ENV)
  }

  const routes: LiveRoute[] = []
  const seen = new Set<string>()

  const push = (route: LiveRoute) => {
    const key = `${route.provider}::${route.model}`
    if (seen.has(key)) return
    seen.add(key)
    routes.push(route)
  }

  if (llm !== undefined) {
    for (const provider of providers) {
      const storeId = storeIdForRoute(provider.id)
      const oauthSignedIn = storeId !== undefined && oauth.ids.includes(storeId)
      let models: { id: string; name: string }[] = []
      try {
        models = await llm.listModels(provider.id)
      } catch {
        models = []
      }
      if (models.length === 0) continue

      const refs = [...(refsByProvider.get(provider.id) ?? [])]
      let keyPresent = false
      for (const ref of refs) {
        if (await refConfigured(host.credentials, env, ref)) {
          keyPresent = true
          break
        }
      }

      // Cursor passthrough authenticates through the local Cursor CLI. A
      // registered provider with live models therefore needs no DSH credential.
      const localPassthrough = provider.id === 'cursor'
      const selectable = oauthSignedIn || keyPresent || localPassthrough
      const source: LiveRoute['source'] = oauthSignedIn
        ? 'oauth'
        : localPassthrough ? 'local' : 'api-key'
      if (!selectable) continue

      for (const model of models) {
        let resolved: { id: string; name: string; reasoning?: { efforts: LiveEffort[]; defaultEffort?: string } }
        try {
          resolved = await llm.resolveModelInfo(provider.id, model.id, signal)
        } catch {
          resolved = { id: model.id, name: model.name }
        }
        const { efforts, defaultEffort } = effortsOf(resolved)
        push({
          provider: provider.id,
          providerName: provider.name,
          model: model.id,
          modelName: resolved.name || model.name,
          selectable: true,
          source,
          ...oauthSignedIn ? { oauthSignedIn: true } : {},
          routeRegistered: true,
          efforts,
          ...defaultEffort === undefined ? {} : { defaultEffort },
        })
      }
    }
  }

  for (const id of oauth.ids) {
    const route = OAUTH_ROUTE_BY_STORE_ID[id]
    if (route === undefined) continue
    if (registered.has(route)) continue
    const isAntigravity = id === 'antigravity' || route === ANTIGRAVITY_PROVIDER
    push({
      provider: route,
      providerName: isAntigravity ? 'Google Antigravity' : id,
      model: '*',
      modelName: isAntigravity
        ? '(install dsh-antigravity-oauth to load this route)'
        : '(install dsh-oauth-login to load this route)',
      selectable: false,
      source: 'oauth',
      oauthSignedIn: true,
      routeRegistered: false,
      efforts: [],
      hint: isAntigravity
        ? 'Signed in at $DSH_HOME/.dsh-antigravity-oauth.json. Install dsh-antigravity-oauth so the route is live.'
        : 'Signed in at $DSH_HOME/.dsh-oauth-auth.json. Install https://github.com/aa2246740/dsh-oauth-login so the route is live.',
    })
  }

  const selectableCount = routes.filter(route => route.selectable).length
  return {
    routes,
    selectableCount,
    oauthPluginPresent,
    oauthStorePresent: oauth.present,
    oauthSignedInProviders: oauth.ids,
    overlayPath: overlay.path,
    overlayMissing: overlay.missing,
    inheritParent: true,
    recommendOauthLogin,
    ...selectableCount === 0
      ? {
        emptyReason: recommendOauthLogin
          ? 'No logged-in API key and no dsh-oauth-login or dsh-antigravity-oauth store. Children inherit this conversation. Add a key in DSH, or install/login https://github.com/aa2246740/dsh-oauth-login / dsh-antigravity-oauth.'
          : 'No selectable live route. Children inherit this conversation.',
      }
      : {},
  }
}
