import { parse } from '@nostr/tools/nip27'
import { TEmoji } from '@/types'
import { clsx, type ClassValue } from 'clsx'
import { parseNativeEmoji } from 'emoji-picker-react/src/dataUtils/parseNativeEmoji'
import { franc } from 'franc-min'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isSafari() {
  if (typeof window === 'undefined' || !window.navigator) return false
  const ua = window.navigator.userAgent
  const vendor = window.navigator.vendor
  return /Safari/.test(ua) && /Apple Computer/.test(vendor) && !/Chrome/.test(ua)
}

export function isAndroid() {
  if (typeof window === 'undefined' || !window.navigator) return false
  const ua = window.navigator.userAgent
  return /android/i.test(ua)
}

export function isTorBrowser() {
  if (typeof window === 'undefined' || !window.navigator) return false
  const ua = window.navigator.userAgent
  return /torbrowser/i.test(ua)
}

export function isTouchDevice() {
  if (typeof window === 'undefined' || !window.navigator) return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

export function isInViewport(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  )
}

export function isPartiallyInViewport(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  return (
    rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
    rect.bottom > 0 &&
    rect.left < (window.innerWidth || document.documentElement.clientWidth) &&
    rect.right > 0
  )
}

export function isSupportCheckConnectionType() {
  if (typeof window === 'undefined' || !(navigator as any).connection) return false
  return typeof (navigator as any).connection.type === 'string'
}

export function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isDevEnv() {
  return process.env.NODE_ENV === 'development'
}

export function detectLanguage(text?: string): string | null {
  if (!text) {
    return null
  }

  const cleanText: string[] = []
  for (const block of parse(text)) {
    switch (block.type) {
      case 'text': {
        if (/[\u3040-\u309f\u30a0-\u30ff]/.test(block.text)) {
          return 'ja'
        }
        if (/[\u0e00-\u0e7f]/.test(block.text)) {
          return 'th'
        }
        if (/[\u4e00-\u9fff]/.test(block.text)) {
          return 'zh'
        }
        if (/[\u0600-\u06ff]/.test(block.text)) {
          return 'ar'
        }
        if (/[\u0590-\u05FF]/.test(block.text)) {
          return 'fa'
        }
        if (/[\u0400-\u04ff]/.test(block.text)) {
          return 'ru'
        }
        if (/[\u0900-\u097f]/.test(block.text)) {
          return 'hi'
        }

        cleanText.push(block.text)
      }
    }
  }

  try {
    const detectedLang = franc(cleanText.join(''))
    const langMap: { [key: string]: string } = {
      ara: 'ar', // Arabic
      deu: 'de', // German
      eng: 'en', // English
      spa: 'es', // Spanish
      fas: 'fa', // Persian (Farsi)
      pes: 'fa', // Persian (alternative code)
      fra: 'fr', // French
      hin: 'hi', // Hindi
      ita: 'it', // Italian
      jpn: 'ja', // Japanese
      pol: 'pl', // Polish
      por: 'pt', // Portuguese
      rus: 'ru', // Russian
      cmn: 'zh', // Chinese (Mandarin)
      zho: 'zh' // Chinese (alternative code)
    }

    const normalizedLang = langMap[detectedLang]
    if (!normalizedLang) {
      return 'und'
    }

    return normalizedLang
  } catch {
    return 'und'
  }
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  maxWait?: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null

  return function (...args: Parameters<T>) {
    // clear the regular debounce timer
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }

    // start max wait timer on first call
    if (maxWait !== undefined && maxTimeoutId === null) {
      maxTimeoutId = setTimeout(() => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        maxTimeoutId = null
        func(...args)
      }, maxWait)
    }

    // set the regular debounce timer
    timeoutId = setTimeout(() => {
      if (maxTimeoutId !== null) {
        clearTimeout(maxTimeoutId)
        maxTimeoutId = null
      }
      timeoutId = null
      func(...args)
    }, wait)
  }
}

export function batchDebounce<T>(func: (args: T[]) => void, delay: number, maxWait?: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null
  let accumulated: T[] = []

  const debouncedFunc = (arg: T) => {
    accumulated.push(arg)

    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    // Start max wait timer on first call
    if (maxWait !== undefined && maxTimeoutId === null) {
      maxTimeoutId = setTimeout(() => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        maxTimeoutId = null
        func(accumulated)
        accumulated = []
      }, maxWait)
    }

    timeoutId = setTimeout(() => {
      if (maxTimeoutId) {
        clearTimeout(maxTimeoutId)
        maxTimeoutId = null
      }
      timeoutId = null
      func(accumulated)
      accumulated = []
    }, delay)
  }

  debouncedFunc.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId)
      maxTimeoutId = null
    }
    accumulated = []
  }

  return debouncedFunc
}

export function parseEmojiPickerUnified(unified: string): string | TEmoji | undefined {
  if (unified.startsWith(':')) {
    const secondColonIndex = unified.indexOf(':', 1)
    if (secondColonIndex < 0) return undefined

    const shortcode = unified.slice(1, secondColonIndex)
    const url = unified.slice(secondColonIndex + 1)
    return { shortcode, url }
  } else {
    return parseNativeEmoji(unified)
  }
}
