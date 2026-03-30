import type { Plugin } from 'vue'
import type { RouteLocationNormalized, RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { nextTick } from 'vue'
import { isNavigationFailure } from 'vue-router'
import type { NavigationType, RouterScrollBehaviorOptions, ScrollPositionCoordinates, ScrollPositionCoordinatesGroup } from './types'

const STATE_KEY = 'vueRouterScroller'
const DEFAULT_INTERVAL = 200

/**
 * Setup router scroll behavior directly with a router instance.
 */
export function setupRouterScroller(
  router: Router,
  options: RouterScrollBehaviorOptions,
) {
  if (router.options.scrollBehavior) {
    console.warn(
      '`scrollBehavior` options in Vue Router is overwritten by `vue-router-scroller` plugin, you can remove it from createRouter()',
    )
  }

  router.options.scrollBehavior = () => {}
  options.storeInterval = options.storeInterval ?? DEFAULT_INTERVAL

  const positionsMap = new Map<string, ScrollPositionCoordinatesGroup>()
  let activeScrollKey: string | null = null
  let scrollRafId: number | null = null
  let lastSavedAt = 0
  let lastHistoryPosition = typeof history.state?.position === 'number' ? history.state.position : 0
  const lastSavedSignatureByKey = new Map<string, string>()

  function onHashAnchorClick(event: MouseEvent) {
    if (event.defaultPrevented)
      return
    if (event.button !== 0)
      return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return

    const target = event.target as Element | null
    const anchor = target?.closest('a[href^="#"]') as HTMLAnchorElement | null
    if (!anchor)
      return

    const href = anchor.getAttribute('href')
    if (!href || href.length <= 1)
      return

    // Use replaceState for in-page anchors so hash changes don't create extra history entries.
    event.preventDefault()

    const hash = href
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${hash}`)

    const id = decodeURIComponent(hash.slice(1))
    const el = document.getElementById(id)
    if (el)
      el.scrollIntoView()
  }

  function savePositionsIfChanged(scrollKey: string) {
    const pos = capturePositions(options)
    const signature = JSON.stringify(pos)

    if (lastSavedSignatureByKey.get(scrollKey) === signature)
      return

    lastSavedSignatureByKey.set(scrollKey, signature)
    positionsMap.set(scrollKey, pos)
    history.replaceState({ ...history.state, [STATE_KEY]: pos }, '')
  }

  function onScroll() {
    if (!activeScrollKey)
      return

    const scrollKey = activeScrollKey

    if (scrollRafId !== null)
      return

    scrollRafId = window.requestAnimationFrame(() => {
      scrollRafId = null
      const now = performance.now()
      if (now - lastSavedAt < options.storeInterval!)
        return

      lastSavedAt = now
      savePositionsIfChanged(scrollKey)
    })
  }

  function startTracking(scrollKey: string) {
    activeScrollKey = scrollKey
    savePositionsIfChanged(scrollKey)
  }

  function stopTracking() {
    activeScrollKey = null
    if (scrollRafId !== null) {
      window.cancelAnimationFrame(scrollRafId)
      scrollRafId = null
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('click', onHashAnchorClick, true)

  // Stop saving scroll positions while the state is being manipulated by
  // the browser/vue-router. Note that we can't listen to `popstate` because
  // vue-router also listens to it, and its listener is setup first. Listening
  // to `popstate` here would actually handle the event after all the callbacks
  // which is too late
  router.beforeEach(() => stopTracking())

  router.afterEach((to, from, failure) => {
    if (isNavigationFailure(failure))
      return

    const currentHistoryPosition = typeof history.state?.position === 'number'
      ? history.state.position
      : lastHistoryPosition
    const delta = currentHistoryPosition - lastHistoryPosition
    const type: NavigationType = delta === 1 ? 'push' : 'history'
    lastHistoryPosition = currentHistoryPosition

    const key = getScrollKey(to.fullPath)
    const pos = type === 'history'
      ? (history.state[STATE_KEY] || positionsMap.get(key))
      : undefined

    nextTick(() => {
      applyPositions(to, from, pos, type, options)

      // Safe to start storing again
      startTracking(key)
    })
  })
}

/**
 * Set up router scroll behavior as a Vue plugin.
 *
 * @example
 * ```ts
 * import { createRouter } from 'vue-router'
 * import { createRouterScroller } from 'vue-router-better-scroller'
 *
 * const app = createApp(App)
 * const router = createRouter({ ... })
 *
 * app.use(router)
 * app.use(createRouterScroller({ ... }) // <-- this
 *
 * app.mount('#app')
 * ```
 */
export function createRouterScroller(
  options: RouterScrollBehaviorOptions,
): Plugin {
  return {
    install(app) {
      const router = app.config.globalProperties.$router
      if (!router) {
        throw new Error(
          'Router instance is not found on this Vue app. This plugin should be installed after Vue Router.',
        )
      }
      setupRouterScroller(router, options)
    },
  }
}

function getScrollKey(path: string, delta = 0): string {
  const position: number = history.state ? history.state.position - delta : -1
  return position + path
}

function capturePositions(options: RouterScrollBehaviorOptions) {
  const pos: ScrollPositionCoordinatesGroup = {}
  for (const [selector] of Object.entries(options.selectors)) {
    const element = querySelector(selector)
    if (!element)
      continue
    pos[selector] = getScrollPosition(element)
  }
  return pos
}

function querySelector(name: string) {
  if (typeof window === 'undefined')
    return undefined
  if (name === 'body')
    return document.body
  if (name === 'window')
    return window
  return document.querySelector(name)
}

function getScrollPosition(el: Element | Window): ScrollPositionCoordinates {
  if (el instanceof Window)
    return { left: window.scrollX, top: window.scrollY }
  else return { left: el.scrollLeft, top: el.scrollTop }
}

async function applyPositions(
  to: RouteLocationNormalized,
  from: RouteLocationNormalizedLoaded,
  pos: ScrollPositionCoordinatesGroup | undefined,
  type: NavigationType,
  options: RouterScrollBehaviorOptions,
) {
  for (const [selector, handler] of Object.entries(options.selectors)) {
    const element = querySelector(selector)
    if (!element)
      continue

    let position = pos?.[selector]
    if (typeof handler === 'function') {
      const result = await handler({
        to,
        from,
        element,
        selector,
        type,
        savedPosition: position,
      })
      if (!result)
        continue

      if (result !== true)
        position = result
    }
    else if (handler === true) {
      // by default, when navigate through a link, we don't preserve scroll position
      if (type === 'push')
        position = undefined
    }

    element.scrollTo({
      behavior: options.behavior,
      ...(position || { top: 0, left: 0 }),
    })
  }
}
