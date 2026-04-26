import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const helperInstallerFileName = 'Naver-RPA-Setup.exe'
const helperInstallerRoute = `/downloads/${helperInstallerFileName}`
const helperInstallerPath = path.resolve(
  __dirname,
  '../desktop-app/dist',
  helperInstallerFileName
)

function localHelperInstallerPlugin() {
  return {
    name: 'local-helper-installer',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== helperInstallerRoute) {
          next()
          return
        }

        if (!fs.existsSync(helperInstallerPath)) {
          res.statusCode = 404
          res.end('Helper installer not found.')
          return
        }

        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${helperInstallerFileName}"`
        )

        const stream = fs.createReadStream(helperInstallerPath)
        stream.on('error', () => {
          if (!res.headersSent) {
            res.statusCode = 500
          }
          res.end('Failed to read helper installer.')
        })
        stream.pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localHelperInstallerPlugin()],
  esbuild: false,
  server: {
    host: 'localhost',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/output': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
