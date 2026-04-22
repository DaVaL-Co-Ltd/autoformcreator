const assert = require('assert')
const { __private } = require('../src/naver-upload')

async function testPopupRecoveryRetriesInterceptedClicks() {
  let sleepCalls = 0
  let attempts = 0

  await __private.withPopupRecovery(
    {},
    [],
    async () => {
      attempts += 1
      if (attempts < 3) {
        throw new Error('locator.click: subtree intercepts pointer events')
      }

      return 'ok'
    },
    'title click',
    {
      sleep: async () => {
        sleepCalls += 1
      },
    }
  )

  assert.equal(attempts, 3)
  assert.equal(sleepCalls, 2)
}

async function testPopupRecoveryDoesNotRetryOtherErrors() {
  let threw = false

  try {
    await __private.withPopupRecovery(
      {},
      [],
      async () => {
        throw new Error('element is detached from DOM')
      },
      'title click'
    )
  } catch (error) {
    threw = true
    assert.match(error.message, /detached from DOM/)
  }

  assert.equal(threw, true)
}

function testPublishedPostUrlMatcher() {
  assert.equal(__private.isPublishedPostUrl('https://blog.naver.com/sample/223123456789'), true)
  assert.equal(__private.isPublishedPostUrl('https://blog.naver.com/GoBlogWrite.naver'), false)
}

function testPublishConfirmationErrorIncludesDebugFiles() {
  const message = __private.buildPublishConfirmationError({
    currentUrl: 'https://blog.naver.com/GoBlogWrite.naver',
    debugArtifacts: {
      screenshotPath: 'C:\\debug\\after-publish.png',
      htmlPath: 'C:\\debug\\after-publish.html',
    },
    visibleHints: ['도움말', '임시저장'],
  })

  assert.match(message, /final Naver post URL was not confirmed/i)
  assert.match(message, /Current URL: https:\/\/blog\.naver\.com\/GoBlogWrite\.naver/)
  assert.match(message, /Visible overlays: 도움말 \| 임시저장/)
  assert.match(message, /C:\\debug\\after-publish\.png/)
  assert.match(message, /C:\\debug\\after-publish\.html/)
}

async function testClickPublishButtonByDomPrefersPanelConfirmButton() {
  const clicked = []

  class FakeElement {}
  class FakeHTMLElement extends FakeElement {}
  class FakeHTMLButtonElement extends FakeHTMLElement {}
  class FakeMouseEvent { constructor() {} }

  const scope = {
    evaluate: async (fn, args) => fn.call(null, args),
  }

  global.Element = FakeElement
  global.HTMLElement = FakeHTMLElement
  global.HTMLButtonElement = FakeHTMLButtonElement
  global.MouseEvent = FakeMouseEvent

  const topButton = Object.assign(new FakeHTMLButtonElement(), {
    tagName: 'BUTTON',
    textContent: '발행',
    className: 'publish_btn__top',
    getAttribute: (name) => (name === 'data-click-area' ? 'tpb.publish' : ''),
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ top: 10, left: 100, width: 80, height: 32 }),
    focus: () => clicked.push('top-focus'),
    click: () => clicked.push('top-click'),
    dispatchEvent: () => clicked.push('top-dispatch'),
  })

  const bottomButton = Object.assign(new FakeHTMLButtonElement(), {
    tagName: 'BUTTON',
    textContent: '',
    className: 'confirm_publish_btn',
    getAttribute: (name) => (name === 'data-click-area' ? 'layer.confirm.publish' : ''),
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ top: 500, left: 900, width: 110, height: 40 }),
    focus: () => clicked.push('bottom-focus'),
    click: () => clicked.push('bottom-click'),
    dispatchEvent: () => clicked.push('bottom-dispatch'),
  })

  const panelRoot = Object.assign(new FakeHTMLElement(), {
    tagName: 'DIV',
    textContent: '카테고리 공개 설정 발행 시간',
    getBoundingClientRect: () => ({ top: 40, left: 780, width: 560, height: 560 }),
    querySelectorAll: () => [topButton, bottomButton],
  })

  global.document = {
    querySelectorAll: (selector) => {
      if (selector === 'body *') {
        return [panelRoot, topButton, bottomButton]
      }

      return [topButton, bottomButton]
    },
  }
  global.window = {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
  }

  const result = await __private.clickPublishButtonByDom(scope, 'last')

  assert.equal(result.top, 500)
  assert.match(result.clickArea, /confirm\.publish/)
  assert.deepEqual(clicked, ['bottom-focus', 'bottom-click', 'bottom-dispatch'])

  delete global.document
  delete global.window
  delete global.Element
  delete global.HTMLElement
  delete global.HTMLButtonElement
  delete global.MouseEvent
}

async function main() {
  await testPopupRecoveryRetriesInterceptedClicks()
  await testPopupRecoveryDoesNotRetryOtherErrors()
  testPublishedPostUrlMatcher()
  testPublishConfirmationErrorIncludesDebugFiles()
  await testClickPublishButtonByDomPrefersPanelConfirmButton()
  console.log('naver-upload tests passed.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
