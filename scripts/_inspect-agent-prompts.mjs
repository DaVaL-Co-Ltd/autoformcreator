// Video Agent 프롬프트 점검용 — briefing_dongwan / pet_dictionary 가 HeyGen 에 보내는
// 프롬프트를 그대로 출력한다. API 호출 없음 (무료).
// 사용: node scripts/_inspect-agent-prompts.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

async function importModules() {
  const srcDir = path.join(ROOT, 'client', 'src', 'utils')
  const tmpDir = path.join(ROOT, '.tmp-concept-test')
  await fs.mkdir(tmpDir, { recursive: true })
  const heygenSource = await fs.readFile(path.join(srcDir, 'heygenAvatars.js'), 'utf8')
  let conceptsSource = await fs.readFile(path.join(srcDir, 'shortsVideoConcepts.js'), 'utf8')
  conceptsSource = conceptsSource.replace(/from\s+(['"])\.\/heygenAvatars\1/g, "from './heygenAvatars.js'")
  const agentSource = await fs.readFile(path.join(srcDir, 'shortsVideoAgent.js'), 'utf8')
  await fs.writeFile(path.join(tmpDir, 'heygenAvatars.js'), heygenSource, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoConcepts.js'), conceptsSource, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoAgent.js'), agentSource, 'utf8')
  const concepts = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoConcepts.js')).href)
  const avatars = await import(pathToFileURL(path.join(tmpDir, 'heygenAvatars.js')).href)
  const agent = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoAgent.js')).href)
  return { concepts, avatars, agent }
}

const { concepts, avatars, agent } = await importModules()
for (const id of ['briefing_dongwan', 'pet_dictionary']) {
  const c = concepts.findShortsVideoConcept(id)
  const meta = avatars.HEYGEN_AVATAR_LIST.find((a) => a.avatarId === c.preferredAvatarIds[0])
  const prompt = agent.buildShortsVideoAgentPrompt({
    script: c.testScript,
    avatar: { id: c.preferredAvatarIds[0], kind: 'talking_photo', name: meta?.name || 'avatar' },
    extraPrompt: concepts.buildShortsConceptExtra(id),
  })
  console.log(`\n${'='.repeat(72)}\n[${id}] Video Agent 프롬프트 (${prompt.length}자)\n${'='.repeat(72)}`)
  console.log(prompt)
}
