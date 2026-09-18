import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'

const localWorkspacePlugin = () => ({
  name: 'local-workspace-writer',
  configureServer(server: any) {
    server.middlewares.use('/__local_workspace_delete', async (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }

      try {
        let body = ''
        for await (const chunk of req) body += chunk
        const payload = JSON.parse(body)
        const kind = ['cards', 'battles', 'campaigns'].includes(payload.kind) ? payload.kind : null
        if (!kind || !payload.id) {
          res.statusCode = 400
          res.end('Invalid local workspace delete payload')
          return
        }
        const safeId = String(payload.id).replace(/[^a-zA-Z0-9_-]/g, '_')
        const filePath = path.resolve(process.cwd(), 'local', kind, `${kind.slice(0, -1)}_${safeId}.json`)
        try {
          await fs.unlink(filePath)
        } catch (error: any) {
          if (error?.code !== 'ENOENT') throw error
        }
        res.statusCode = 200
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        console.error('Local workspace delete failed', error)
        res.statusCode = 500
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
        const result = { cards: [], challenges: [], campaigns: [], battleLogs: [] } as any
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
        let body = ''
        for await (const chunk of req) body += chunk
        const payload = JSON.parse(body)
        const kind = ['cards', 'battles', 'campaigns'].includes(payload.kind) ? payload.kind : null
        if (!kind || !payload.value?.id) {
          res.statusCode = 400
          res.end('Invalid local workspace payload')
          return
        }

        const safeId = String(payload.value.id).replace(/[^a-zA-Z0-9_-]/g, '_')
        const root = path.resolve(process.cwd(), 'local', kind)
        await fs.mkdir(root, { recursive: true })
        await fs.writeFile(
          path.join(root, `${kind.slice(0, -1)}_${safeId}.json`),
          JSON.stringify(payload.value, null, 2),
          'utf8'
        )

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        console.error('Local workspace write failed', error)
        res.statusCode = 500
        res.end('Local workspace write failed')
      }
    })
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localWorkspacePlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
})
