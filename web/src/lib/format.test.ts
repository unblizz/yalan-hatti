import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clock, deviceHealth, duration, normalizeCode } from './format.ts'

test('oda kodu Türkçe klavyeden gelse de dört Latin harfe iner', () => {
  assert.equal(normalizeCode('abçd'), 'ABD')
  assert.equal(normalizeCode('kişi'), 'KII')
  assert.equal(normalizeCode(' r t y u z '), 'RTYU')
})

test('geri sayım yukarı yuvarlar ve eksiye düşmez', () => {
  assert.equal(clock(61_001), '1:02')
  assert.equal(clock(-5), '0:00')
})

test('cihaz sağlığı kopmayı, gecikmeyi ve düşük pili ayırır', () => {
  const now = 100_000
  assert.equal(deviceHealth({ connected: false, lastSeenAt: now, battery: null, rttMs: null }, now).health, 'down')
  const warn = deviceHealth({ connected: true, lastSeenAt: now - 20_000, battery: { level: 0.1, charging: false }, rttMs: 50 }, now)
  assert.deepEqual(warn.reasons, ['Sinyal gecikiyor', 'Pil düşük'])
  assert.equal(deviceHealth({ connected: true, lastSeenAt: now, battery: { level: 0.1, charging: true }, rttMs: 50 }, now).health, 'ok')
})

test('süreyi okunur biçimde yazar', () => {
  assert.equal(duration(999), '0 sn')
  assert.equal(duration(45_000), '45 sn')
  assert.equal(duration(133_000), '2 dk 13 sn')
  assert.equal(duration(120_000), '2 dk')
  assert.equal(duration(3_840_000), '1 sa 4 dk')
})
