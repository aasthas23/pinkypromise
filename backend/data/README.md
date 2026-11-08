# backend/data

| Path | What it is |
| --- | --- |
| `fake_transcript.txt` | Hand-written sample transcript used by `generate_fake_pipeline.py`. |
| `robocall_transcripts.jsonl` | Grounding corpus for AI practice calls: 568 unique, redacted English transcripts of real robocalls. |
| `call_transcripts/` | Saved transcripts of finished practice calls, written automatically by the backend. Ignored by git. |

## robocall_transcripts.jsonl

**Source:** Robocall Audio Dataset, Sathvik Prasad and Bradley Reaves, NC State University (TR-2023-1),
https://github.com/wspr-ncsu/robocall-audio-dataset. The recordings were collected by the FTC through
Project Point of No Entry and are in the public domain. The upstream dataset isn't modified; this file is
derived from its `metadata.csv` by `scripts/build_robocall_corpus.py`.

**Processing:**
- English transcripts only.
- Near-duplicates collapsed: the same robocall was often sent thousands of times.
- Fragments under 12 words dropped.
- Redacted:
  - phone numbers (digits or spelled out) → `[phone number]`
  - URLs → `[website]`
  - emails → `[email]`
  - SSN-like and long digit runs → `[number]`
  - order and reference codes → `[reference code]`
- Tagged with scam types and social-engineering tactics using keyword rules.

**Use:** the practice-call backend retrieves a few transcripts relevant to each fictional T-Mobile scenario.
The model gets them as reference patterns only: never quoted, never presented as the call itself.
