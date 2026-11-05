import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const localWorkspaceCsrfToken = randomBytes(32).toString('hex')
const maxMutationBodyBytes = 5_000_000

async function readJsonBody(req: any) {
  const host = String(req.headers.host || '')
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    const error: any = new Error('Invalid Host header')
    error.statusCode = 403
    throw error
  }

  const origin = String(req.headers.origin || '')
  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    const error: any = new Error('A valid same-origin Origin header is required')
    error.statusCode = 403
    throw error
  }
  const expectedProtocol = req.socket?.encrypted ? 'https:' : 'http:'
  if (originUrl.protocol !== expectedProtocol || originUrl.host.toLowerCase() !== host.toLowerCase()) {
    const error: any = new Error('A same-origin request is required')
    error.statusCode = 403
    throw error
  }
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
    const error: any = new Error('Cross-site requests are not allowed')
    error.statusCode = 403
    throw error
  }
  if (String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    const error: any = new Error('Content-Type must be application/json')
    error.statusCode = 415
    throw error
  }
  if (req.headers['x-local-csrf-token'] !== localWorkspaceCsrfToken) {
    const error: any = new Error('Invalid CSRF token')
    error.statusCode = 403
    throw error
  }

  const contentLength = Number(req.headers['content-length'] || 0)
  if (contentLength > maxMutationBodyBytes) {
    const error: any = new Error('Request body is too large')
    error.statusCode = 413
    throw error
  }
  const chunks: Buffer[] = []
  let bodyBytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bodyBytes += buffer.length
    if (bodyBytes > maxMutationBodyBytes) {
      const error: any = new Error('Request body is too large')
      error.statusCode = 413
      throw error
    }
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const cardApiEndpoints = [
  'https://api2.splinterlands.com/cards/get_details',
  'https://api.splinterlands.io/cards/get_details',
  'https://api.splinterlands.com/cards/get_details',
]

async function loadOrCreateCardCatalog() {
  const filePath = path.resolve(process.cwd(), 'local', 'all_cards.json')
  try {
    const cards = JSON.parse((await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''))
    if (Array.isArray(cards) && cards.length > 0) return cards
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.warn('Could not read local/all_cards.json; downloading a fresh copy.', error)
  }

  let lastError: unknown
  for (const endpoint of cardApiEndpoints) {
    try {
      const response = await fetch(endpoint)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const cards = await response.json()
      if (!Array.isArray(cards) || cards.length === 0) throw new Error('Card API returned no cards')
      const snapshot = cards.map(({ id, name, color, type, sub_type, is_gladiator, rarity, stats }: any) => ({ id, name, color, type, sub_type, is_gladiator, rarity, stats }))
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, JSON.stringify(snapshot), 'utf8')
      return snapshot
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('Splinterlands card API is unavailable')
}

const normalizeFilePart = (value: unknown) =>
  String(value || 'unnamed').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed'

const battleFileBase = (value: any) => {
  const name = value.name || `${value.summoner1?.name || 'team_1'} vs ${value.summoner2?.name || 'team_2'}`
  return `battle_${normalizeFilePart(name)}`
}

async function findFileById(folder: string, id: string): Promise<string | null> {
  try {
    for (const file of await fs.readdir(folder)) {
      if (!file.endsWith('.json')) continue
      try {
        const value = JSON.parse((await fs.readFile(path.join(folder, file), 'utf8')).replace(/^\uFEFF/, ''))
        if (value?.id === id) return path.join(folder, file)
      } catch {
        // Invalid files are handled by the workspace loader.
      }
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
  return null
}

async function uniqueFilePath(folder: string, base: string, currentPath: string | null = null): Promise<string> {
  for (let suffix = 0; ; suffix++) {
    const filePath = path.join(folder, `${base}${suffix ? `(${suffix})` : ''}.json`)
    if (filePath === currentPath) return filePath
    try {
      await fs.access(filePath)
    } catch (error: any) {
      if (error?.code === 'ENOENT') return filePath
      throw error
    }
  }
}

async function migrateBattleFileNames(root: string) {
  const folder = path.join(root, 'battles')
  try {
    for (const file of await fs.readdir(folder)) {
      if (!file.endsWith('.json')) continue
      const currentPath = path.join(folder, file)
      try {
        const value = JSON.parse((await fs.readFile(currentPath, 'utf8')).replace(/^\uFEFF/, ''))
        if (!value?.id) continue
        const base = battleFileBase(value)
        const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`^${escapedBase}(?:\\(\\d+\\))?\\.json$`).test(file)) continue
        await fs.rename(currentPath, await uniqueFilePath(folder, base, currentPath))
      } catch (error: any) {
        console.warn(`Could not migrate battle filename ${file}`, error?.message || error)
      }
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const localWorkspacePlugin = () => ({
  name: 'local-workspace-writer',
  transformIndexHtml(html: string) {
    return html.replace('<head>', `<head><meta name="local-workspace-csrf-token" content="${localWorkspaceCsrfToken}">`)
  },
  configureServer(server: any) {
    server.middlewares.use('/__local_campaign_runs_save', async (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }
      try {
        const payload = await readJsonBody(req)
        if (!payload.runs || typeof payload.runs !== 'object' || Array.isArray(payload.runs)) throw new Error('Invalid campaign runs payload')
        const root = path.resolve(process.cwd(), 'local')
        await fs.mkdir(root, { recursive: true })
        const filePath = path.join(root, 'campaign_runs.json')
        await fs.writeFile(`${filePath}.tmp`, JSON.stringify({ runs: payload.runs }, null, 2), 'utf8')
        await fs.rename(`${filePath}.tmp`, filePath)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        console.error('Campaign progress write failed', error)
        res.statusCode = (error as any)?.statusCode || 400
        res.end('Could not save campaign progress')
      }
    })

    server.middlewares.use('/__local_profiles_save', async (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }
      try {
        const payload = await readJsonBody(req)
        if (!Array.isArray(payload.profiles)) throw new Error('Invalid profiles payload')
        const root = path.resolve(process.cwd(), 'local')
        await fs.mkdir(root, { recursive: true })
        await fs.writeFile(path.join(root, 'profiles.json'), JSON.stringify({ profiles: payload.profiles, activeProfileId: payload.activeProfileId || null }, null, 2), 'utf8')
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        console.error('Profile write failed', error)
        res.statusCode = (error as any)?.statusCode || 400
        res.end('Invalid profiles payload')
      }
    })

    server.middlewares.use('/__splinterlands_card_catalog', async (req: any, res: any) => {
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }
      try {
        const cards = await loadOrCreateCardCatalog()
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(cards))
      } catch (error) {
        console.error('Card catalog load failed', error)
        res.statusCode = 503
        res.end('Card catalog unavailable')
      }
    })

    server.middlewares.use('/__local_workspace_delete', async (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }

      try {
        const payload = await readJsonBody(req)
        const kind = ['cards', 'battles', 'campaigns'].includes(payload.kind) ? payload.kind : null
        if (!kind || !payload.id) {
          res.statusCode = 400
          res.end('Invalid local workspace delete payload')
          return
        }
        const folder = path.resolve(process.cwd(), 'local', kind)
        const filePath = await findFileById(folder, payload.id)
        if (filePath) await fs.unlink(filePath)
        res.statusCode = 200
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        console.error('Local workspace delete failed', error)
        res.statusCode = (error as any)?.statusCode || 500
        res.end('Local workspace delete failed')
      }
    })

    server.middlewares.use('/__local_workspace_load', async (req: any, res: any) => {
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }

      try {
        const root = path.resolve(process.cwd(), 'local')
        const result = { cards: [], challenges: [], campaigns: [], battleLogs: [], profiles: null, activeProfileId: null, campaignRuns: null } as any
        try {
          const progress = JSON.parse((await fs.readFile(path.join(root, 'campaign_runs.json'), 'utf8')).replace(/^\uFEFF/, ''))
          if (progress.runs && typeof progress.runs === 'object' && !Array.isArray(progress.runs)) result.campaignRuns = progress.runs
        } catch (error: any) {
          if (error?.code === 'ENOENT') result.campaignRuns = {}
          else console.warn('Could not load local/campaign_runs.json', error)
        }
        try {
          const profileState = JSON.parse((await fs.readFile(path.join(root, 'profiles.json'), 'utf8')).replace(/^\uFEFF/, ''))
          if (Array.isArray(profileState.profiles)) {
            result.profiles = profileState.profiles
            result.activeProfileId = profileState.activeProfileId || null
          }
        } catch (error: any) {
          if (error?.code === 'ENOENT') result.profiles = []
          else console.warn('Could not load local/profiles.json', error)
        }
        await migrateBattleFileNames(root)
        const folders = [
          ['cards', 'cards'],
          ['battles', 'battles'],
          ['campaigns', 'campaigns'],
        ] as const

        for (const [folderName, kind] of folders) {
          const folder = path.join(root, folderName)
          try {
            const files = await fs.readdir(folder)
            for (const file of files) {
              if (!file.endsWith('.json')) continue
              try {
                const value = JSON.parse(await fs.readFile(path.join(folder, file), 'utf8'))
                if (kind === 'cards') result.cards.push(value)
                else if (kind === 'campaigns') result.campaigns.push(value)
                else if (value?.enemyTeam) result.challenges.push(value)
                else if (value?.events) result.battleLogs.push(value)
              } catch (error) {
                console.warn(`Could not load local JSON file ${file}`, error)
              }
            }
          } catch (error: any) {
            if (error?.code !== 'ENOENT') throw error
          }
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result))
      } catch (error) {
        console.error('Local workspace load failed', error)
        res.statusCode = 500
        res.end('Local workspace load failed')
      }
    })

    server.middlewares.use('/__local_workspace_save', async (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }

      try {
        const payload = await readJsonBody(req)
        const kind = ['cards', 'battles', 'campaigns'].includes(payload.kind) ? payload.kind : null
        if (!kind || !payload.value?.id) {
          res.statusCode = 400
          res.end('Invalid local workspace payload')
          return
        }

        const root = path.resolve(process.cwd(), 'local', kind)
        await fs.mkdir(root, { recursive: true })
        const existingPath = await findFileById(root, payload.value.id)
        const safeId = normalizeFilePart(payload.value.id)
        const base = kind === 'battles' ? battleFileBase(payload.value) : `${kind.slice(0, -1)}_${safeId}`
        const filePath = existingPath || await uniqueFilePath(root, base)
        await fs.writeFile(
          filePath,
          JSON.stringify(payload.value, null, 2),
          'utf8'
        )

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        console.error('Local workspace write failed', error)
        res.statusCode = (error as any)?.statusCode || 500
        res.end('Local workspace write failed')
      }
    })
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localWorkspacePlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
})
