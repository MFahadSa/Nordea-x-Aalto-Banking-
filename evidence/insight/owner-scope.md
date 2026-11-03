# Owner scope for the Nordea insight feature + loader/--init work (Bill ASK #insight)

Source: Slack workspace instinct-works, channel C0CDY4N9LD8 (#all-instinct), sender U0CE22FLGH2
(project owner account; Main holds the provenance ruling binding it to the owner).
Provenance per quote: [LIVE] = re-read verbatim from the live channel by Coordinator this run
(slackbot read-thread, 2026-11-03 ~13:07 EET); [MAIN] = verbatim from Main's inspected channel
record this run (live read-thread paging window did not reach this ts; not independently re-read).

## ts1793701491.471809 [MAIN] (thread 1793691047.328029)
"Have you merge yet?

I want to test Nordea insight flow. Maybe, make me a Nordea database that can allow this feature,
so you have to work on the database that will be loaded with python scripts/load_data.py. Then you
also have to configure the Supabase to make sure it's align with the new database. Or whatever it is
that make it flexible, so  that user only have to provide their Supabase key and URL and etc and
only have to run python load_data.py"

## ts1793701573.260599 [LIVE] (thread 1793691047.328029)
"Yes, the idea is we want to see Nordea insights and/or recommendation as the context card, instead
of random raw information such as "24 transactions totalling 27600 EUR of related spending
(refreshed against current bank data)""

## ts1793701613.749939 [LIVE] (thread 1793691047.328029)
"Think of it like a doctor and patient. The patient will not understand about the technical, but
will only understand insights, advice, and/or recommendation."

## ts1793701642.935829 [LIVE] (thread 1793691047.328029)
"Ok, continue the work, before merge. I hope this is my last revision."

## Scope reading (Coordinator)
These approve the reversible feature/loader/docs work as discussed: insight/recommendation context
cards, the Nordea dataset + load_data.py one-command setup path incl. Supabase alignment, continue
before merge. They are NOT a blanket hosted-DDL / security / spend grant: nobody runs --init on the
live project without an owner go; no existing credential rotation; no printed secrets.
