import { describe, expect, it } from 'vitest'
import { calendarPictures, MAX_CALENDAR_PICTURES } from './calendarPictures'

const CDN = 'https://images.squarespace-cdn.com/content/v1/65f06ac9b920a639724fbe26'
// Mikveh Israel's calendar page (mikvehisrael.org/calendar-B4BK6), Oct 21,
// its pictures as the page has them: its logo, a banner, then the month.
const mikvehIsrael = `
  <img elementtiming="nbf-header-logo-desktop" src="//images.squarespace-cdn.com/content/v1/65f06ac9b920a639724fbe26/1710254819830-IFFLFXP9GS3E6WYGIXQ5/kkmi+logo+%28Facebook+Event+Cover%29+%2823%29.png?format=1500w" alt="Congregation Mikveh Israel">
  <img data-src="${CDN}/834813e6-1eac-4635-b0bc-8fa38a426ba9/Screenshot+2025-11-06+at+1.43.52%E2%80%AFPM.jpeg" data-image-dimensions="846x550" alt="Screenshot 2025-11-06 at 1.43.52 PM.jpeg">
  <img data-stretch="false"
    data-src="${CDN}/5ce1c6fa-a9fe-46f6-ad6e-e63cf6871774/Oct.+High+Holiday+calendar+2026.png"
    data-image="${CDN}/5ce1c6fa-a9fe-46f6-ad6e-e63cf6871774/Oct.+High+Holiday+calendar+2026.png"
    data-image-dimensions="2550x3300"
    alt="" srcset="${CDN}/5ce1c6fa-a9fe-46f6-ad6e-e63cf6871774/Oct.+High+Holiday+calendar+2026.png?format=100w 100w">
  <img data-stretch="false"
    data-image="${CDN}/dc604e1c-8b69-441b-8b0f-0851e2f144a7/Calendar+September+2026.png"
    data-image-dimensions="2550x3300" alt="">`
const BASE = 'https://www.mikvehisrael.org/calendar-B4BK6'
// This week (Wed Oct 21) and, from Thursday, next.
const OCT = ['2026-10-18', '2026-10-24']

describe('calendarPictures', () => {
  it('finds the month a shul posts as pictures, not its logo, a banner, or last month', () => {
    expect(calendarPictures(mikvehIsrael, BASE, OCT)).toEqual([`${CDN}/5ce1c6fa-a9fe-46f6-ad6e-e63cf6871774/Oct.+High+Holiday+calendar+2026.png?format=1500w`])
    // Read at the turn of the month, both are.
    expect(calendarPictures(mikvehIsrael, BASE, ['2026-09-27', '2026-10-03'])).toHaveLength(2)
    // A year on, neither.
    expect(calendarPictures(mikvehIsrael, BASE, ['2027-10-17', '2027-10-23'])).toEqual([])
  })

  it('takes a picture the shape of a printed page, though it isn’t called a calendar, and never a photo', () => {
    const html = `
      <img src="/uploads/IMG_4410.jpg" width="1600" height="1200" alt="Our sanctuary">
      <img src="/uploads/scan0001.png" width="1275" height="1650">
      <img src="/uploads/tiny.png" width="300" height="400">`
    expect(calendarPictures(html, 'https://shul.example/', OCT)).toEqual(['https://shul.example/uploads/scan0001.png'])
  })

  it('a picture called a calendar or schedule comes first, and only a few are read', () => {
    const html = `
      <img src="/a.png" width="1275" height="1650">
      <img src="/b.png" width="1275" height="1650">
      <img src="/c.jpg" alt="Davening schedule">
      <a href="/files/shul_calendar_october_2026.jpg">This month</a>`
    expect(calendarPictures(html, 'https://shul.example/', OCT)).toEqual(['https://shul.example/c.jpg', 'https://shul.example/files/shul_calendar_october_2026.jpg'])
    expect(MAX_CALENDAR_PICTURES).toBe(2)
  })

  it('reads a month between underscores, and not one inside a hex id', () => {
    const html = `<img src="/files/shul_calendar_september_2026.jpg"><img src="/content/0a1b-dec4-9f00/calendar.png">`
    expect(calendarPictures(html, 'https://shul.example/', OCT)).toEqual(['https://shul.example/content/0a1b-dec4-9f00/calendar.png'])
  })
})
