# Robocall recordings

These clips are real robocall recordings, used as call openers in Scam Coach.

- **Source:** Robocall Audio Dataset, Sathvik Prasad and Bradley Reaves, NC State University, TR-2023-1.
  https://github.com/wspr-ncsu/robocall-audio-dataset
- **Origin:** collected by the FTC through Project Point of No Entry.
- **License:** the dataset's README says the data is in the public domain.

Built by `scripts/robocalls/build_clips.py`. The script trims silence, normalizes loudness and limits audio to phone bandwidth.
The clip list and transcripts are in `src/features/simulator/recordings/catalog.ts`.

## Safety rule

The script only bundles clips whose Whisper transcript has no phone number, spelled-out digits,
"call back at…", URL or toll-free mention. This keeps the app from playing a number that scammers may still answer.
Automated transcripts can miss words, so **someone should listen to every clip before a demo**.
Remove any clip that turns out to contain a callback number, then rerun the script.

| id | pool | dataset file |
| --- | --- | --- |
| amz-1112259 | amazon_order | 1112259_normalized.wav |
| amz-daniel | amazon_order | 1638881759.18243_in_Family_Communication_Robocall__Amazon-SuspiciousCharge_normalized.wav |
| amz-1211775 | amazon_order | 1211775_normalized.wav |
| amz-795470 | amazon_order | 795470_normalized.wav |
| amz-668376 | amazon_order | 668376_normalized.wav |
| ssa-638881 | ssa_suspension | 638881_normalized.wav |
| ssa-509601 | ssa_suspension | 509601_normalized.wav |
| ssa-241125 | ssa_suspension | 241125_normalized.wav |
| ssa-576026 | ssa_suspension | 576026_normalized.wav |
