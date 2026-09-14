# Mobile 71-Day OS

Open `os.html` and unlock the device vault. The app is a static, device-local execution system: personal records stay encrypted in this browser, with portable encrypted backups. The public itinerary and existing `private.html` are unchanged.

## Daily use

- **Today priorities:** P0 / P1 / P2 buttons show counts and filter the same queue. Due actions, overdue targets, waiting check-ins, stale replies, preparation gaps, unconfirmed bookings, missing outcomes and verification reminders are derived from saved records. Warnings may raise a row's displayed priority without rewriting its stored priority.
- **One action:** a follow-up can have Waiting For status without becoming a second task. Owner, target deadline, expected response, check-in, request date, last contact and no-response interval remain independent. Completion needs delivery evidence; cancellation needs a reason. Editing or reopening keeps the same ID. Optional timed deadlines use the device's local time input and are saved with a timezone.
- **Find other work:** expand “所有活动与待办” for Upcoming / Done / Follow-up, all actions, Waiting For, due, overdue, future, undated and closed records. Search titles, outcomes and associated people. Linked actions can open their source activity.
- **Meetings, visits and important tasks:** Today shows preparation percentage and missing items. Open the activity for the detailed preparation checklist and separate information-completeness form. Draft background text never marks preparation complete. N/A requires a reason; all-N/A preparation needs explicit readiness confirmation. Existing preparation/outcome reference cards can be linked from the activity form.
- **Travel and accommodation:** store transport/stay type, explicit confirmation status, confirmation evidence, confirmation deadline and next action. Flight/train forms capture departure date/time/zone and arrival date/time/zone separately. Confirming a booking does not claim that travel occurred. Changing a confirmed transport schedule makes it pending re-confirmation.

## Simple display, complete lifecycle

Default mobile status mapping:

| Display | Stored lifecycle stages |
| --- | --- |
| Upcoming | Planned, Prepared |
| Done | Completed, Notes; Closed in the archive |
| Follow-up | Follow-up |

The full lifecycle remains **Planned → Prepared → Completed → Notes → Follow-up → Closed**, with transition timestamps, reasons and history on the activity's secondary screen. Completing an unprepared activity requires a reason. Actual time and evidence are separate from planned time. Outcomes separate the summary, counterpart statements, observations, judgments and references. Follow-up review requires owned, dated actions or an explicit no-follow-up reason. Open actions block closure; new/reopened linked actions reopen a Closed activity. Dates passing only produce “待核验”, never fabricated completion.

Critical information missing within 24 hours creates P0 warnings; other missing information within 72 hours creates P1 warnings. Information completeness is separate from reviewed preparation. A booking's own confirmation cannot be replaced by a text field or an N/A choice.

## What was reused from Draft PR #15

Reviewed source: `164e911832e6461bca0f5d59aadfbfda63d263f5`, especially `app/model.mjs`, its model tests, and `docs/execution.md`.

Ported the pure rules for shared priority queues, independent Waiting For timing, stale reminders, evidence requirements, preparation/readiness, 24/72-hour warnings, guarded lifecycle transitions and reopening. Adapted these to PR #17's existing `events`, `travel`, `actions`, people IDs and encrypted store in `app/execution.mjs`.

There is no second `meetings` collection, duplicate activity wrapper, vault, private-page boot hook or copied Today UI. The travel record is also its canonical confirmation item (`travel:<id>` in the queue); all its confirmation, preparation and readiness alerts share one row. Ordinary linked actions remain distinct and cannot confirm a booking. No PR #15 branch merge or itinerary-derived speculative bookings were introduced. PR #15's independent encrypted backup format is not imported; old PR #17 vaults/backups are supported.

## Review fixes and persistence

- Stage previews and saves validate the entire canonical effective stage sequence, including existing overrides. Overlaps, reordering and invalid dates are rejected before mutation.
- Travel intervals compare the two endpoints as real instants. New forms require an explicit arrival date. Legacy records without arrival dates retain the previous overnight fallback. Nonexistent DST wall times are rejected.
- Conflict scanning retains every interval that can still overlap or need a buffer; ignoring one nested conflict does not hide other pairs.
- `datetime-local` defaults use device wall-time components. New CRM interactions store an ISO instant and display it locally. Old ambiguous interaction strings remain unchanged because their historical timezone cannot be inferred safely.
- Old mobile records receive missing execution defaults in memory, idempotently. Past dates and old bookings never infer completion. The existing `71day-os-state-v1` key and `71day-encrypted-v1` envelope remain compatible.
- All UI writes use cloned state; success is committed only after encryption and storage succeed. A quota failure leaves the form and previously committed state intact. A stale window is blocked from overwriting a changed encrypted snapshot and must unlock again.
- Locking reloads the page to remove private dialogs and memory. The updated service worker includes the execution module for offline reopening after the first successful load.

## Verification

Node 22+ and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

`PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` optionally select installed browser tooling. Production has no runtime package dependencies.

Unit tests cover the four review regressions, queue counts/de-duplication, date and timed deadlines, 24/72-hour boundaries, preparation, evidence, full lifecycle/closure/reopening, bookings, migration, encrypted round trips, wrong passwords, failed saves and stale windows.

The browser workflow uses synthetic records at 375px and 1280px: stage rejection; 80%/100% prep; explicit completion; outcomes; two follow-ups with blocked closure and reopening; Tokyo–Toronto zones; CRM local time; encrypted refresh; storage failure; backup/restore; offline reload; lock; hidden lock-screen behavior and touch targets. It does not use the real `private.html` password or personal records. CI runs unit and browser checks and retains screenshots. Actual iPhone Safari has not been manually tested.

PR #17 remains unmerged. #13 is tracked as a duplicate of #7/#8; #14 is tracked as a duplicate of #9.
