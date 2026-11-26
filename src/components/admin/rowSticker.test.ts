import { describe, expect, it } from 'vitest'
import { stickerOf } from './rowSticker'

describe('stickerOf', () => {
  it('says nightly for what Google and websites keep', () => {
    for (const job of ['Google', 'Website', 'Website, Email', 'Refuah', 'Keystone-K']) expect(stickerOf({ job, amber: false })).toEqual({ text: 'Checked nightly', tone: 'green' })
  })
  it('says weekly for the link check and an email', () => {
    expect(stickerOf({ job: 'Link check', amber: false }).text).toBe('Checked weekly')
    expect(stickerOf({ job: 'Email', amber: false }).text).toBe('Checked weekly')
  })
  it('says not checked where nothing reads it, or it was stopped', () => {
    expect(stickerOf({ job: 'Nothing', amber: true })).toEqual({ text: 'Not checked', tone: 'grey' })
    expect(stickerOf({ job: 'Stopped', amber: true }).text).toBe('Not checked')
  })
  it('says not checked where a job has it but every page it reads is failing', () => {
    expect(stickerOf({ job: 'Website', amber: false, unchecked: true })).toEqual({ text: 'Not checked', tone: 'grey' })
  })
  it('says checking while any of its reads runs', () => {
    expect(stickerOf({ job: 'Website, Email', amber: false, lines: [{ text: 'Looking in the guide’s Gmail…', state: 'checking' }, { text: 'Its website' }] }).text).toBe('Checking…')
  })
  it('says not checked when every read came back with nothing to keep', () => {
    expect(stickerOf({ job: 'Email', amber: false, lines: [{ text: 'No emails from office@shul.org yet', state: 'unchecked' }] }).text).toBe('Not checked')
    // The website still keeps it while the email is awaited.
    expect(stickerOf({ job: 'Website, Email', amber: false, lines: [{ text: 'No emails yet', state: 'unchecked' }, { text: 'Its website' }] }).text).toBe('Checked nightly')
  })
})
