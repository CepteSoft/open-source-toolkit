# @ceptesoft/phone-tr

Turkish phone number normalization and validation. Zero dependencies, runs in
Node and the browser.

Extracted from production ERP code (CepteCari) where free-text phone input
arrives as `532 111 22 33`, `+90 532 111 22 33`, `0532-111-2233`, … and must be
stored in one canonical form.

**Scope boundary:** Turkey only. This package deliberately does not attempt
international parsing — use libphonenumber for that.

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
