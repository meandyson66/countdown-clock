const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const out = path.join(root, 'gh-pages-bundle')
const dist = path.join(root, 'dist')
const recommendWeb = path.join(root, 'recommend-web')

if (!fs.existsSync(dist)) {
  console.error('Missing dist/. Run: npm run build:pages')
  process.exit(1)
}

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    if (fs.statSync(from).isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

copyDir(dist, path.join(out, 'findmatch'))
if (fs.existsSync(recommendWeb)) {
  copyDir(recommendWeb, path.join(out, 'recommend-web'))
}

const landing = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>countdown-clock 演示入口</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
    a { color: #e07a38; }
    li { margin: 0.5rem 0; }
  </style>
</head>
<body>
  <h1>在线演示</h1>
  <ul>
    <li><a href="./findmatch/">寻伴 · 附近交友（网页版）</a></li>
    <li><a href="./recommend-web/">澳门特码推荐</a></li>
  </ul>
  <p><a href="https://github.com/meandyson66/countdown-clock">GitHub 仓库</a></p>
</body>
</html>
`
fs.writeFileSync(path.join(out, 'index.html'), landing, 'utf8')
fs.copyFileSync(path.join(dist, 'index.html'), path.join(out, 'findmatch', '404.html'))
console.log('Prepared gh-pages-bundle at', out)