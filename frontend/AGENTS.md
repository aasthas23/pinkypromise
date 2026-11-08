<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Pinky Promise is frontend-only: UI reads shared demo state via `useDemo()` (src/lib/store.ts) and mutates only through src/lib/services.ts, so mock services can be swapped for real backend/Voice AI without UI rewrites.
- Customer and employee views share one shell (src/components/safe/AppShell.tsx); employee routes live under /employee.
- Shared CSS tokens, Button variants, and the AppShell own the brand theme so customer and employee pages stay visually consistent.
- Canvas patterns and chart-surface treatments are defined as shared CSS tokens and utilities so page styling stays consistent without changing demo behavior.
- Mascot moods select a matching pose asset and sequenced gesture with decorative emotion particles in the shared Mascot component; keep motion and reduced-motion handling there rather than nesting page-level animation so every page reuses consistent emotional behavior.

- Caller verification is generated in the employee view and checked in the customer view through the shared mock service to preserve the demo boundary.
- Customer lookup and code delivery stay in the mock verification service; sessions are bound to the selected customer so other customers cannot verify them.
- Progress and analyst summaries derive from shared simulation results; call consent is a demo preference and does not schedule real calls.
- Analyst charts and the customer progress roadmap derive from shared demo data and simulation results without adding call-unlock rules.
