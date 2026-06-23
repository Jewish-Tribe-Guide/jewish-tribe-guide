import { HONEYPOT_FIELD } from '@/lib/honeypot'

// Visually-hidden, off-screen input that real users never interact with but
// naive bots fill in. Keep it out of the tab order and hidden from screen
// readers. The parent form binds `value`/`onChange` to a piece of state it
// sends as `company` in the request body; the server drops any submission where
// it's non-empty (see lib/honeypot.ts).
export default function Honeypot({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
      <label>
        Company
        <input
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  )
}
