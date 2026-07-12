# tools/

Build-time and content-production scripts for the gunnerthelab.github.io site.
None of these run in the Astro build; they are invoked manually.

## mai-image.mjs

MAI-Image-2.5 illustration generator for the Gunner content-production run.
Calls the already-deployed Azure AI Foundry MAI-Image-2.5 model deployment
(studio-foundry, This Is My Demo - MVP Subscription, East US) and writes
cover and scene art under `public/images/`.

Prerequisite: `az login` as the owner, with "This Is My Demo - MVP
Subscription" as the active subscription. Auth is keyless Entra ID; no key
and no new dependency are required.

```
node tools/mai-image.mjs --help
```

Always prove a plan with `--dry-run` before a real (spend-incurring) run.
Every real run requires `--mai-budget-usd <n>`, a hard cumulative-spend
ledger stop tracked against `public/images/provenance.json`.

Full flag reference, the prompt library's JSON and Markdown schemas, retry
and rate-limit behavior, and every design decision are documented in the
top-of-file comment in `tools/mai-image.mjs`.
