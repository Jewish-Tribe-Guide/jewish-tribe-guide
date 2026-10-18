// ─────────────────────────────────────────────────────────────────────────────
// The guide's shul newsletters (src/lib/newsletter.ts): a Google Apps Script
// that runs inside the guide's own Gmail (phillyjewishguide@gmail.com) and
// sends each new email to the site, which reads it for changed times and
// files them for an admin to approve. Nothing on the site changes from here.
//
// Not part of the app: it's pasted into script.google.com. To set it up,
// signed in to the guide's Gmail:
//
//   1. script.google.com → New project. Replace the code with this file.
//   2. Project Settings (the gear) → Script properties → Add:
//        NEWSLETTER_SECRET = the same value as the site's NEWSLETTER_SECRET
//   3. Back in the editor, pick `install` in the function menu and Run it.
//      Google asks to let the script read the Gmail account and reach the
//      site: allow it. From then on it runs every hour on its own.
//   4. Run `readNewsletters` once by hand to see it work: View → Executions
//      shows what each email came to.
//
// Each email is sent once. A sender the site hasn't been told about comes
// back "unlinked": it shows on the admin Watches tab, to be tied to its shul,
// and its emails are sent again every hour (for two weeks) until it is.
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-unused-vars -- Apps Script calls install and readNewsletters by name */
/* global GmailApp, PropertiesService, ScriptApp, UrlFetchApp, Utilities */

var SITE = 'https://phillyjewishguide.com'
var COMMUNITY = 'philly'
/** Stop starting new emails after this long: a run may take six minutes,
 *  and one email can take a minute to read. */
var RUN_BUDGET_MS = 4 * 60 * 1000
/** A PDF or picture larger than this isn't sent (the site's limit). */
var MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024
/** How long a message id is remembered as sent: past the two weeks the
 *  search looks back. Kept in one script property, which holds 9 KB:
 *  about 350 emails, many more than two weeks of shul newsletters. */
var REMEMBER_DAYS = 15
var MAX_REMEMBERED_CHARS = 8500

function install() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'readNewsletters') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('readNewsletters').timeBased().everyHours(1).create()
}

function readNewsletters() {
  var props = PropertiesService.getScriptProperties()
  var secret = props.getProperty('NEWSLETTER_SECRET')
  if (!secret) throw new Error('Add NEWSLETTER_SECRET under Project Settings → Script properties.')
  var sent = JSON.parse(props.getProperty('SENT') || '{}')
  var started = Date.now()

  // Oldest first, so a backlog is read in the order it was sent.
  var threads = GmailApp.search('in:inbox newer_than:14d', 0, 50).reverse()
  outer: for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages()
    for (var j = 0; j < messages.length; j++) {
      var m = messages[j]
      if (sent[m.getId()]) continue
      if (Date.now() - started > RUN_BUDGET_MS) break outer
      var res = UrlFetchApp.fetch(SITE + '/api/inbound/newsletter', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + secret },
        payload: JSON.stringify(emailOf(m)),
        muteHttpExceptions: true,
      })
      var code = res.getResponseCode()
      var body = {}
      try {
        body = JSON.parse(res.getContentText())
      } catch (e) {
        // Not JSON: a platform error page. The status code says enough.
      }
      console.log(code + ' ' + (body.status || body.error || '') + ' · ' + m.getFrom() + ' · ' + m.getSubject())
      // The secret or the site's setup is wrong: every email would fail.
      if (code === 401 || code === 503) throw new Error('The site refused: ' + (body.error || code))
      // Unlinked: sent again next hour. A failure: the same.
      if (code === 200 && body.status !== 'unlinked') sent[m.getId()] = today()
    }
  }

  // Forget what's past the search's window, and the oldest if it's still
  // too long for one property.
  var ids = Object.keys(sent)
    .filter(function (id) {
      return sent[id] >= today() - REMEMBER_DAYS
    })
    .sort(function (a, b) {
      return sent[b] - sent[a]
    })
  var kept = {}
  for (var n = 0; n < ids.length && JSON.stringify(kept).length < MAX_REMEMBERED_CHARS; n++) kept[ids[n]] = sent[ids[n]]
  props.setProperty('SENT', JSON.stringify(kept))
}

/** Today, as a day number: short, for the remembered list. */
function today() {
  return Math.floor(Date.now() / 86400000)
}

function emailOf(m) {
  var attachment = null
  var files = m.getAttachments({ includeInlineImages: false })
  for (var k = 0; k < files.length; k++) {
    var type = files[k].getContentType()
    if ((type === 'application/pdf' || /^image\/(png|jpeg|webp|gif)$/.test(type)) && files[k].getSize() <= MAX_ATTACHMENT_BYTES) {
      attachment = { mime: type, b64: Utilities.base64Encode(files[k].getBytes()) }
      break
    }
  }
  return {
    community: COMMUNITY,
    messageId: m.getId(),
    from: m.getFrom(),
    subject: m.getSubject(),
    date: m.getDate().toISOString(),
    text: m.getPlainBody(),
    attachment: attachment,
  }
}
