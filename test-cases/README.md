# Test cases

Five AI-style answers, each with at least one claim that is known to be wrong.
Success criterion (PRD §6): the wrong claim is flagged `high` in at least 4 of 5 cases.

## How to run

1. Open a test file in Chrome (drag it into a tab, or paste the answer into any text field).
2. Select the text under **Answer**, right-click → **Second Look**.
3. Rate trust, run the quick check, and compare with **Expected**.
4. Optional: run the deep check and confirm each high-risk claim gets at least one source.
5. Fill in the results table below. Run it once with Gemini Nano (`On-device`) and once with the flag off (`Cloud`).

## Results

| Case | Wrong claim | On-device: flagged high? | Cloud: flagged high? | Deep check: sources? |
|---|---|---|---|---|
| 01 fake legal citation | Varghese v. China Southern Airlines | | | |
| 02 wrong number | Eiffel Tower 512 m | | | |
| 03 fake paper | Henderson & Liu 2018, Nature Neuroscience | | | |
| 04 wrong date | Berlin Wall fell in 1991 | | | |
| 05 wrong code | `list.push()` in Python | | | |
