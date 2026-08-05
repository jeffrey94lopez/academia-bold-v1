import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldShowNavHint, NAV_HINT_KEY } from '../js/nav-hint.js'

test('shouldShowNavHint: true mientras no se haya cerrado', () => {
  assert.equal(shouldShowNavHint(null), true)
  assert.equal(shouldShowNavHint(undefined), true)
  assert.equal(shouldShowNavHint(''), true)
})

test('shouldShowNavHint: false una vez cerrado', () => {
  assert.equal(shouldShowNavHint('true'), false)
})

test('NAV_HINT_KEY es estable', () => {
  assert.equal(NAV_HINT_KEY, 'nav_hint_dismissed')
})
