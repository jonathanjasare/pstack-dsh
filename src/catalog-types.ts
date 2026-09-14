export interface LiveEffort {
  readonly id: string
  readonly name: string
  readonly description?: string
}

export interface LiveRoute {
  readonly provider: string
  readonly providerName: string
  readonly model: string
  readonly modelName: string
  /** True when this route can be selected for spawn (live adapter + available authentication). */
  readonly selectable: boolean
  readonly source: 'api-key' | 'oauth' | 'local'
  readonly oauthSignedIn?: boolean
  readonly routeRegistered: boolean
  readonly efforts: readonly LiveEffort[]
  readonly defaultEffort?: string
  readonly hint?: string
}

export interface CatalogResult {
  readonly routes: LiveRoute[]
  readonly selectableCount: number
  readonly oauthPluginPresent: boolean
  readonly oauthStorePresent: boolean
  readonly oauthSignedInProviders: string[]
  readonly overlayPath: string
  readonly overlayMissing: boolean
  readonly inheritParent: true
  readonly recommendOauthLogin: boolean
  readonly emptyReason?: string
}

/** Hints for known logins whose adapter is missing; not an allowlist for live adapters. */
export const OAUTH_ROUTE_BY_STORE_ID: Readonly<Record<string, string>> = {
  'openai-codex': 'pi-openai-codex',
  anthropic: 'pi-anthropic',
  xai: 'pi-xai',
  'github-copilot': 'pi-github-copilot',
  openrouter: 'pi-openrouter',
  'kimi-coding': 'pi-kimi-coding',
  antigravity: 'agy-google-antigravity',
}

export function storeIdForRoute(route: string): string | undefined {
  // dsh-oauth-login publishes pi-<credential-store-id>. buildCatalog calls this
  // only for registered adapters and separately requires that exact login id.
  // dsh-antigravity-oauth publishes agy-google-antigravity (or agy-*).
  // New login providers must not need a second registration in pstack.
  if (route.startsWith('pi-') && route.length > 3) return route.slice(3)
  if (route === 'agy-google-antigravity' || route.startsWith('agy-')) return 'antigravity'
  return undefined
}
