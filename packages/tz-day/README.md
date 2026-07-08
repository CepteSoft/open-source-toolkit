# @ceptesoft/tz-day

Timezone-correct calendar day (`YYYY-MM-DD`). Zero dependencies.

`new Date().toISOString().slice(0, 10)` gives you the **UTC** day. For a
business in Istanbul (UTC+3), that answer is wrong every night between
midnight and 3 AM local — date-keyed orders and route plans land on
yesterday. Extracted from production ERP code (CepteCari) where this exact
off-by-one corrupted planning days.

**Scope boundary:** calendar-day identity only — no date arithmetic,
formatting, or parsing (use Temporal / date-fns for that).

## Install

```bash
npm install @ceptesoft/tz-day
```

## Quickstart

```ts
import { isoDayInTimeZone, createTodayFn } from "@ceptesoft/tz-day";

// Ad hoc
isoDayInTimeZone("Europe/Istanbul");                                  // e.g. "2026-07-09"
isoDayInTimeZone("Europe/Istanbul", new Date("2025-06-15T21:01:00Z")); // "2025-06-16"

// App-wide: bind the business timezone once
const today = createTodayFn("Europe/Istanbul");
today(); // "2026-07-09" — same answer on server and client
```

## API

### `isoDayInTimeZone(timeZone: string, instant?: Date): string`

The `YYYY-MM-DD` day of `instant` (default: now) in the given IANA timezone.
Throws `RangeError` on invalid identifiers.

### `createTodayFn(timeZone: string): () => string`

Binds a timezone once and validates it eagerly (typos throw at startup, not at
3 AM in production).
