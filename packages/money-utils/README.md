# @ceptesoft/money-utils

Safe monetary input parsing, VAT (KDV) math, and a parameter-driven currency
registry. Zero dependencies, runs in Node and the browser.

Extracted from production ERP code (CepteCari). The parsing rules exist
because of real incidents: SQL `numeric` columns accept `'NaN'`, and a single
NaN silently poisons every `SUM()` over the column.

**Scope boundary:** validation and arithmetic only — no formatting/i18n of
output (use `Intl.NumberFormat`) and no exchange rates.

## Install

```bash
npm install @ceptesoft/money-utils
```

## Quickstart

```ts
import {
  parseAmount,
  toNumber,
  netFromGross,
  vatAmount,
  grossFromNet,
  createCurrencyRegistry,
} from "@ceptesoft/money-utils";

// Trust boundary: validate user input before writing to the DB
parseAmount("1234,56");            // { ok: true, value: "1234.56" }
parseAmount("NaN");                // { ok: false, error: "Invalid amount." }
parseAmount("-5", { messages: { negative: "Tutar negatif olamaz." } });
// { ok: false, error: "Tutar negatif olamaz." }

// Lenient coercion for display math over trusted values
toNumber("1234,50"); // 1234.5
toNumber(null);      // 0

// VAT — rates are percentages
netFromGross(120, 20); // 100
vatAmount(120, 20);    // 20
grossFromNet(100, 20); // 120

// Currency registry — you declare what your app supports; first = default
const currencies = createCurrencyRegistry([
  { code: "TRY", symbol: "₺", label: "Türk Lirası" },
  { code: "USD", symbol: "$", label: "Dolar" },
]);
currencies.getSymbol("USD"); // "$"
currencies.getSymbol(null);  // "₺" (default)
```

## API

### `parseAmount(input, options?)` → `{ ok: true, value } | { ok: false, error }`

Validates user-entered amounts. Rejects NaN/Infinity, negatives, values above
`max` (default `DEFAULT_MAX_AMOUNT` = 1e12), and — when `required` (default) —
empty input. Accepts comma decimals. Returns a canonical dot-decimal string
rounded to `maxDecimals` (default 2), safe for SQL `numeric` columns.
`messages` overrides any of `empty`/`invalid`/`negative`/`tooLarge`
(defaults in `DEFAULT_AMOUNT_MESSAGES`).

### `toNumber(input)` → `number`

Lenient coercion: comma decimals accepted, anything invalid → `0`. Never use
it as validation — that's `parseAmount`'s job.

### VAT: `netFromGross(gross, ratePercent)` · `vatAmount(gross, ratePercent)` · `grossFromNet(net, ratePercent)`

Percentage-based VAT arithmetic (`20` = 20%).

Migration note (CepteCari): `kdvHaric` → `netFromGross`, `kdvAmount` →
`vatAmount`, `toGross` → `grossFromNet`, `toNum` → `toNumber`,
`MAX_AMOUNT` → `DEFAULT_MAX_AMOUNT`.

### `createCurrencyRegistry(currencies)` → `{ currencies, getSymbol, getCurrency }`

Lookup over the currencies your app supports. First entry is the default for
null/empty codes; unknown codes echo back the code from `getSymbol`. Throws at
init on an empty list.
