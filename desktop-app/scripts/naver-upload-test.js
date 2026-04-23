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

function testFindScheduledPostUrlUsesOnlyPrimaryEditorFrames() {
  const pendingPage = {
    url: () => 'https://blog.naver.com/auto_test_log?Redirect=Write&',
    frames: () => [
      { name: () => 'input_buffer177', url: () => 'https://blog.naver.com/some-non-write-buffer' },
      { name: () => 'mainFrame', url: () => 'https://blog.naver.com/auto_test_log?Redirect=Write&' },
    ],
  }

  assert.equal(__private.findScheduledPostUrl(pendingPage), null)

  const completedPage = {
    url: () => 'https://blog.naver.com/auto_test_log?Redirect=Write&',
    frames: () => [
      { name: () => 'mainFrame', url: () => 'https://blog.naver.com/PostList.naver?blogId=auto_test_log&currentPage=1' },
    ],
  }

  assert.match(__private.findScheduledPostUrl(completedPage), /PostList\.naver/)
}

function testParseContentWithImageMarkersKeepsOrder() {
  const segments = __private.parseContentWithImageMarkers('A\n[IMG:1]\nB\n[IMG:2]\nC')
  assert.deepEqual(
    segments,
    [
      { type: 'text', text: 'A\n' },
      { type: 'image', index: 1, marker: '[IMG:1]' },
      { type: 'text', text: '\nB\n' },
      { type: 'image', index: 2, marker: '[IMG:2]' },
      { type: 'text', text: '\nC' },
    ]
  )
}

function testNormalizeScheduledPublishAt() {
  const originalNow = Date.now
  Date.now = () => new Date('2026-04-21T23:00:00.000Z').getTime()

  try {
    const schedule = __private.normalizeScheduledPublishAt('2026-04-22T01:40:00.000Z')
    assert.equal(schedule.adjusted, false)
    assert.equal(schedule.dateValue, '2026-04-22')
    assert.equal(schedule.hour24, '10')
    assert.equal(schedule.minute, '40')
    assert.equal(schedule.meridiemKo, '\uC624\uC804')
  } finally {
    Date.now = originalNow
  }
}

function testNormalizeScheduledPublishAtPreservesLateNightHour() {
  const originalNow = Date.now
  Date.now = () => new Date('2026-04-22T00:00:00.000Z').getTime()

  try {
    const schedule = __private.normalizeScheduledPublishAt('2026-04-22T23:00:00+09:00')
    assert.equal(schedule.hour24, '23')
    assert.equal(schedule.hour12, '11')
    assert.equal(schedule.meridiemKo, '\uC624\uD6C4')
  } finally {
    Date.now = originalNow
  }
}

function testNormalizeScheduledPublishAtAdjustsTooSoonSchedule() {
  const originalNow = Date.now
  Date.now = () => new Date('2026-04-22T02:05:43.000Z').getTime()

  try {
    const schedule = __private.normalizeScheduledPublishAt('2026-04-22T02:10:00.000Z')
    assert.equal(schedule.adjusted, true)
    assert.equal(schedule.iso, '2026-04-22T02:20:00.000Z')
    assert.equal(schedule.hour24, '11')
    assert.equal(schedule.minute, '20')
  } finally {
    Date.now = originalNow
  }
}

function testScheduledPublishStateConfirmationUsesDomValues() {
  const schedule = {
    dateValue: '2026-04-22',
    hour24: '11',
    minute: '20',
  }

  assert.equal(
    __private.isScheduledPublishStateConfirmed(
      {
        panelVisible: true,
        reserveModeActive: true,
        reservedTime: null,
        dateValue: '2026. 04. 22',
        hourValue: '11',
        minuteValue: '20',
        validationError: null,
      },
      schedule
    ),
    true
  )

  assert.equal(
    __private.isScheduledPublishStateConfirmed(
      {
        panelVisible: true,
        reserveModeActive: true,
        reservedTime: null,
        dateValue: '2026. 04. 22',
        hourValue: '11',
        minuteValue: '10',
        validationError: null,
      },
      schedule
    ),
    false
  )

  assert.equal(
    __private.isScheduledPublishStateConfirmed(
      {
        panelVisible: true,
        reserveModeActive: true,
        reservedTime: null,
        dateValue: '2026. 04. 22',
        hourValue: '11',
        minuteValue: '20',
        validationError: '\uD604\uC7AC \uC2DC\uAC04 \uC774\uD6C4\uB85C \uC124\uC815\uD574\uC8FC\uC138\uC694.',
      },
      schedule
    ),
    false
  )
}

function testScheduledPublishStateConfirmationAcceptsReadyBanner() {
  const schedule = {
    dateValue: '2026-04-22',
    hour24: '23',
    minute: '40',
  }

  assert.equal(
    __private.isScheduledPublishStateConfirmed(
      {
        panelVisible: true,
        reserveModeActive: true,
        reservedTime: null,
        dateValue: '2026. 04. 22',
        hourValue: '23',
        minuteValue: '40',
        scheduleReady: true,
        validationError: null,
      },
      schedule
    ),
    true
  )
}

function testPublishConfirmationErrorIncludesDebugFiles() {
  const message = __private.buildPublishConfirmationError({
    currentUrl: 'https://blog.naver.com/GoBlogWrite.naver',
    debugArtifacts: {
      screenshotPath: 'C:\\debug\\after-publish.png',
      htmlPath: 'C:\\debug\\after-publish.html',
    },
    visibleHints: ['help-overlay', 'popup-layer'],
  })

  assert.match(message, /final Naver post URL was not confirmed/i)
  assert.match(message, /Current URL: https:\/\/blog\.naver\.com\/GoBlogWrite\.naver/)
  assert.match(message, /Visible overlays: help-overlay \| popup-layer/)
  assert.match(message, /C:\\debug\\after-publish\.png/)
  assert.match(message, /C:\\debug\\after-publish\.html/)
}

function testScheduledPublishConfirmationErrorMentionsSchedule() {
  const message = __private.buildPublishConfirmationError({
    currentUrl: 'https://blog.naver.com/sample?Redirect=Write&',
    debugArtifacts: null,
    scheduledAt: '2026-04-22T01:35:00.000Z',
    visibleHints: [],
  })

  assert.match(message, /scheduled publish confirmation was not confirmed/i)
}

async function testClickPublishButtonByDomPrefersPanelConfirmButton() {
  const clicked = []

  class FakeElement {}
  class FakeHTMLElement extends FakeElement {}
  class FakeHTMLButtonElement extends FakeHTMLElement {}
  class FakeMouseEvent {
    constructor() {}
  }

  const scope = {
    evaluate: async (fn, args) => fn.call(null, args),
  }

  global.Element = FakeElement
  global.HTMLElement = FakeHTMLElement
  global.HTMLButtonElement = FakeHTMLButtonElement
  global.MouseEvent = FakeMouseEvent

  const topButton = Object.assign(new FakeHTMLButtonElement(), {
    tagName: 'BUTTON',
    textContent: '\uBC1C\uD589',
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
    textContent: '\uCE74\uD14C\uACE0\uB9AC \uACF5\uAC1C \uC124\uC815 \uBC1C\uD589 \uC2DC\uAC04',
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

async function testActivateReservePublishModeByDomSkipsHeaderScheduleButton() {
  const clicked = []

  class FakeElement {}
  class FakeHTMLElement extends FakeElement {}
  class FakeHTMLButtonElement extends FakeHTMLElement {}
  class FakeMouseEvent {
    constructor() {}
  }

  const scope = {
    evaluate: async (fn, args) => fn.call(null, args),
  }

  global.Element = FakeElement
  global.HTMLElement = FakeHTMLElement
  global.HTMLButtonElement = FakeHTMLButtonElement
  global.MouseEvent = FakeMouseEvent

  const headerReserveButton = Object.assign(new FakeHTMLButtonElement(), {
    tagName: 'BUTTON',
    textContent: '\uC608\uC57D \uBC1C\uD589 0\uAC74',
    className: 'reserve_btn__header',
    parentElement: null,
    getAttribute: (name) => {
      if (name === 'data-click-area') return 'tpb*t.schedule'
      if (name === 'class') return 'reserve_btn__header'
      return ''
    },
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ top: 24, left: 960, width: 120, height: 32 }),
    focus: () => clicked.push('header-focus'),
    click: () => clicked.push('header-click'),
    dispatchEvent: () => clicked.push('header-dispatch'),
  })

  const panelReserveButton = Object.assign(new FakeHTMLButtonElement(), {
    tagName: 'BUTTON',
    textContent: '\uC608\uC57D',
    className: 'publish_schedule_option',
    parentElement: null,
    getAttribute: (name) => {
      if (name === 'data-click-area') return 'tpb*i.schedule'
      if (name === 'class') return 'publish_schedule_option'
      return ''
    },
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ top: 540, left: 990, width: 90, height: 32 }),
    focus: () => clicked.push('panel-focus'),
    click: () => clicked.push('panel-click'),
    dispatchEvent: () => clicked.push('panel-dispatch'),
  })

  const panelRoot = Object.assign(new FakeHTMLElement(), {
    tagName: 'DIV',
    textContent: '\uCE74\uD14C\uACE0\uB9AC \uACF5\uAC1C \uC124\uC815 \uBC1C\uD589 \uC2DC\uAC04 \uC608\uC57D',
    getBoundingClientRect: () => ({ top: 120, left: 780, width: 560, height: 560 }),
    querySelectorAll: () => [panelReserveButton],
  })

  global.document = {
    querySelectorAll: (selector) => {
      if (selector === 'body *') {
        return [panelRoot, headerReserveButton, panelReserveButton]
      }

      return [headerReserveButton, panelReserveButton]
    },
  }
  global.window = {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
  }

  const result = await __private.activateReservePublishModeByDom(scope)

  assert.equal(result.text, '\uC608\uC57D')
  assert.match(result.attrs, /tpb\*i\.schedule/)
  assert.deepEqual(clicked, ['panel-focus', 'panel-click', 'panel-dispatch'])

  delete global.document
  delete global.window
  delete global.Element
  delete global.HTMLElement
  delete global.HTMLButtonElement
  delete global.MouseEvent
}

async function testClickPhotoButtonByDomPrefersToolbarPhotoButton() {
  const clicked = []

  class FakeElement {}
  class FakeHTMLElement extends FakeElement {}
  class FakeHTMLButtonElement extends FakeHTMLElement {}
  class FakeMouseEvent {
    constructor() {}
  }

  const scope = {
    evaluate: async (fn, args) => fn.call(null, args),
  }

  global.Element = FakeElement
  global.HTMLElement = FakeHTMLElement
  global.HTMLButtonElement = FakeHTMLButtonElement
  global.MouseEvent = FakeMouseEvent

  const backgroundPhotoButton = Object.assign(new FakeHTMLButtonElement(), {
    tagName: 'BUTTON',
    textContent: '\uBC30\uACBD \uC0AC\uC9C4 \uC0AD\uC81C',
    className: 'title_background_photo',
    getAttribute: (name) => {
      if (name === 'class') return 'title_background_photo'
      return ''
    },
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ top: 70, left: 1000, width: 120, height: 28 }),
    focus: () => clicked.push('background-focus'),
    click: () => clicked.push('background-click'),
    dispatchEvent: () => clicked.push('background-dispatch'),
  })

  const myboxButton = Object.assign(new FakeHTMLButtonElement(), {
    tagName: 'BUTTON',
    textContent: 'MYBOX',
    className: 'toolbar_mybox',
    getAttribute: (name) => {
      if (name === 'class') return 'toolbar_mybox'
      return ''
    },
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ top: 220, left: 240, width: 80, height: 32 }),
    focus: () => clicked.push('mybox-focus'),
    click: () => clicked.push('mybox-click'),
    dispatchEvent: () => clicked.push('mybox-dispatch'),
  })

  const photoButton = Object.assign(new FakeHTMLButtonElement(), {
    tagName: 'BUTTON',
    textContent: '\uC0AC\uC9C4',
    className: 'toolbar_photo',
    getAttribute: (name) => {
      if (name === 'class') return 'toolbar_photo'
      if (name === 'data-click-area') return 'toolbar.photo'
      return ''
    },
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ top: 220, left: 140, width: 80, height: 32 }),
    focus: () => clicked.push('photo-focus'),
    click: () => clicked.push('photo-click'),
    dispatchEvent: () => clicked.push('photo-dispatch'),
  })

  global.document = {
    querySelectorAll: () => [backgroundPhotoButton, myboxButton, photoButton],
  }
  global.window = {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
  }

  const result = await __private.clickPhotoButtonByDom(scope)

  assert.equal(result.text, '\uC0AC\uC9C4')
  assert.match(result.attrs, /toolbar\.photo/)
  assert.deepEqual(clicked, ['photo-focus', 'photo-click', 'photo-dispatch'])

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
  testFindScheduledPostUrlUsesOnlyPrimaryEditorFrames()
  testParseContentWithImageMarkersKeepsOrder()
  testNormalizeScheduledPublishAt()
  testNormalizeScheduledPublishAtPreservesLateNightHour()
  testNormalizeScheduledPublishAtAdjustsTooSoonSchedule()
  testScheduledPublishStateConfirmationUsesDomValues()
  testScheduledPublishStateConfirmationAcceptsReadyBanner()
  testPublishConfirmationErrorIncludesDebugFiles()
  testScheduledPublishConfirmationErrorMentionsSchedule()
  await testClickPublishButtonByDomPrefersPanelConfirmButton()
  await testActivateReservePublishModeByDomSkipsHeaderScheduleButton()
  await testClickPhotoButtonByDomPrefersToolbarPhotoButton()
  console.log('naver-upload tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
