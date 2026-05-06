const path = require('path')
const { pathToFileURL } = require('url')
const { chromium } = require('playwright')

async function main() {
  const projectRoot = path.resolve(__dirname, '..', '..')
  const portfolioDir = path.join(projectRoot, 'portfolio')
  const htmlPath = path.join(portfolioDir, 'PORTFOLIO.html')
  const pdfPath = path.join(portfolioDir, 'PORTFOLIO.pdf')

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'print' })
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    })
    console.log('PDF generated:', pdfPath)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
