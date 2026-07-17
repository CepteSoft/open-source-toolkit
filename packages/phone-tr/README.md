# @ceptesoft/phone-tr

Turkish phone number normalization and validation. Zero dependencies, runs in
Node and the browser.

Extracted from production ERP code (CepteCari) where free-text phone input
arrives as `532 111 22 33`, `+90 532 111 22 33`, `0532-111-2233`, … and must be
stored in one canonical form.

**Scope boundary:** Turkey only. This package deliberately does not attempt
international parsing — use libphonenumber for that. It also deliberately
does **not** do operator detection (532 → Turkcell etc.): Turkey has had
mobile number portability since 2008, so a prefix only reveals the original
allocation — presenting it as "the operator" would be wrong for millions of
ported numbers. `getLineType` (mobile/landline/…) is provided instead, which
the numbering plan does guarantee.

## vs `libphonenumber-js`

| | `@ceptesoft/phone-tr` | `libphonenumber-js` |
|---|---|---|
| Countries | Turkey only | all |
| Install size | ~4 kB, zero deps | ~150 kB+ with metadata |
| Canonical output | national `0XXXXXXXXXX` (what TR databases store) | E.164 `+90…` |
| Form ergonomics | `parsePhone` → `{ value, error }` with Turkish default message | manual |
| Line type | `getLineType` from the TR numbering plan | `getType` (needs full metadata build) |

If you need any country other than Turkey, use libphonenumber. If your app
is Turkish and stores `0XXXXXXXXXX`, this is the lighter tool.

## Install

```bash
npm install @ceptesoft/phone-tr
```

## Quickstart

```ts
import { normalizePhone, isValidPhone, parsePhone } from "@ceptesoft/phone-tr";

normalizePhone("+90 532 111 22 33"); // "05321112233"
normalizePhone("532 111 22 33");     // "05321112233"
isValidPhone("05321112233");         // true (type guard: string | null → string)

// Form-friendly: empty input = optional field, invalid input = error message
parsePhone("");          // { value: null, error: null }
parsePhone("0532 111");  // { value: null, error: "Geçerli bir telefon numarası girin (11 hane, örn. 05XX XXX XX XX)." }
parsePhone("0532 111", { invalidMessage: "Invalid phone number." });
// { value: null, error: "Invalid phone number." }
```

## API

### `normalizePhone(input: string | null | undefined): string | null`

Extracts digits and converts to canonical `0XXXXXXXXXX`. Handles `5XX…` (10
digits), `0XXX…` (11 digits), and `90XXX…` (12 digits, country code). Returns
`null` for empty input; unrecognized shapes come back as bare digits so
`isValidPhone` can reject them.

### `isValidPhone(value: string | null): value is string`

`true` for exactly 11 digits starting with `0`.

### `parsePhone(input, options?): { value: string | null; error: string | null }`

Normalize + validate in one step. Empty input → `{ value: null, error: null }`
(treat the field as optional). `options.invalidMessage` overrides the default
Turkish error text (`DEFAULT_INVALID_MESSAGE`).

### `getLineType(input): PhoneLineType | null`

Line type from the Turkish national numbering plan — accepts anything
`normalizePhone` accepts:

```ts
getLineType("+90 532 111 22 33"); // "mobile"    (5xx)
getLineType("0212 555 00 00");    // "landline"  (2xx/3xx/4xx)
getLineType("0850 123 45 67");    // "corporate" (nongeographic/VoIP)
getLineType("0800 123 45 67");    // "tollfree"
getLineType("0900 123 45 67");    // "premium"
getLineType("0532 111");          // null (invalid)
```

Not operator detection — see the scope boundary above.

### `formatPhone(input): string | null`

Display formatting: `formatPhone("+905321112233")` → `"0532 111 22 33"`.
Returns `null` when the input is not a valid TR number.
