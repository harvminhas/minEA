# Delta: Infra bug fixes (run this first; self-contained Cursor prompt)

**Context.** This is minEA / BuboMap (Next.js; dev server localhost:3001).
- Objects keep their attributes in a `properties` JSON blob; owner is a real column.
- Platforms & cloud lists platform-type objects; Servers & devices lists runtime-type objects.
- Every object write goes through the existing object update path, which writes the audit log.

Run this before `INFRA-RELATIONSHIPS-LOCATIONS.md`. Paste each block into a new Cursor Agent chat.

## Fix A: records entered before the change are missing

```text
BUG: Platforms & cloud doesn't show platform records created before the infra split. The likely
cause is that the list filters on a new key (properties.platform_kind) or queries the wrong
type. Servers & devices may have the same problem (runtime_kind, os_name, ...).

0. FIRST, read-only: show me the exact query or filter behind each page (file + lines) and run
   counts against the dev DB: (a) all objects of the platform type, (b) what the page returns
   today, then the same two counts for runtimes. Explain the gap. WAIT for my OK.
1. Fix: each page lists ALL objects of its type, filtered only by the user's search and filter
   chips. Never require a new key. Missing keys render as a grey dash "—" (the same muted dash
   used elsewhere), never "undefined", "null" or an empty cell. Sorting puts blanks last.
2. If the type query is wrong (for example a hard-coded subtype list), read types from the
   type registry/config. Don't duplicate the type list.
3. Show the diff first. After the fix, show the counts again: page count = type count.

TESTS
- An object of the platform type with an empty properties blob ({}) appears on Platforms &
  cloud with dashes; the same for a runtime on Servers & devices.
- Counts: page rows (no filters) = number of objects of that type.
- A blank kind sorts last and its filter chip count is right.

DO NOT
- Backfill or rewrite stored properties to make the query work, add a migration, or hide
  records that lack the new keys.
```

## Fix B: shown fields with no editor

```text
BUG: some fields are shown but can't be edited (Support ends at least). Also check
end_of_life, os_name / os_version, location, runtime_kind, platform_kind, notice_period and
renewal_date.

0. FIRST, read-only: find where infra field definitions live (lib/infra/infraConfig.ts or
   similar). List every column on Platforms & cloud and Servers & devices and every field
   in their panels, with: key, label, type, shown in table?, shown in panel?, editable in
   panel?, editable inline? Mark the gaps. Propose the shape of ONE field config. WAIT for OK.
1. ONE field config (e.g. lib/infra/infraConfig.ts; reuse it if it exists) per object type:
   { key, label, type: 'text'|'date'|'enum'|'number'|'owner', options?, table: boolean,
     inline: boolean, required?: boolean }. Both the table columns AND the panel edit form are
   generated from it, so a field can't be shown without an editor.
2. Editors: date -> date picker (stores YYYY-MM-DD); enum -> select with the config's options
   plus "Not set"; text -> input; owner -> the existing owner picker. Inline editing in the
   table for simple types (text, date, enum); the panel edits everything that is shown.
3. Writes go through the existing object update (audited). Validate on the server against the
   same config: unknown keys rejected, dates parse, enum values in options. Show a field-level
   error and keep the old value on failure.
4. Show the diff first. Keep labels and column order as today unless they are in the gap list.

TESTS
- Iterate the config: every field with table: true or shown in the panel has an editor
  (a test fails if someone adds a shown field without one).
- Edit Support ends in the panel -> saved, audit row written, the table and status update.
- Server rejects a bad date and an enum value not in options (400 + message).
- Inline edit of an enum in the table saves through the same update path.

DO NOT
- Keep a second hand-written column list, write properties directly from the client, add a
  new table, or bypass the audit log.
```

**Check:** both pages list every record of their type (count before/after), blanks show "—", and every visible column can be edited in the panel.
