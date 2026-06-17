# Prompt: Outlier Low-Score Commentary

Use `data/checkpoints/official_results/group_md1.json` and `data/generated/pool_data.js` to identify three players whose World Cup pool picks are outliers and who are scoring low because of it.

First, calculate the current score using the project scoring rules:

- Group-stage qualifier match: 1 point.
- Exact advancing position bonus: 1 point.
- Full group order bonus: 5 points.
- Best-third match: 3 points.
- Include futures only when the checkpoint has enough matching futures data to score them.

Then identify three cases that match this statement:

> These players are outliers, and because of this, they are scoring low.

Define "outlier" pragmatically:

- Their score is below the pool median or near the bottom of the leaderboard.
- Their group-order picks are unusually different from the pool consensus or from the checkpoint standings.
- Their uncommon picks are currently wrong or producing few points.
- Best-third misses can count as evidence, especially when the player has zero or one match.

For each selected player, summarize:

- Current score.
- The specific outlier picks that hurt them.
- Best-third performance.
- Why those picks explain the low score.

After the analysis, write one short roast-style comment for each player.

Tone requirements:

- Chandler Bing style: dry, sarcastic, punchy.
- Meaner than gentle teasing, but still playful.
- Use Ecuadorian Spanish slang when it makes the joke sharper.
- Keep each comment under 200 words.
- Do not include slurs, identity-based insults, or anything aimed at protected traits.
- Make the joke about the picks, score, confidence, and pool performance.

Expected output shape:

1. A compact table with the three players and the scoring reason.
2. Three short comments, one per player.

Reference examples of acceptable style:

- "Ñaño, this was not a prediction, this was a denuncia contra el sentido común."
- "The name says 100% sure, the score says terms and conditions may apply."
- "One best-third hit is doing a lot of heavy lifting, like a single roommate paying rent for the whole apartment."
