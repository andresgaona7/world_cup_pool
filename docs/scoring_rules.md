# Scoring Rules

## Group Stage

- Correct group-stage qualifier: 1 point for each team correctly predicted to
  advance from the group.
- Exact advancing position bonus: 1 additional point when a correctly predicted
  qualifier also finishes in the exact predicted advancing position.
- Third-place teams only count as qualifiers if they are one of the official
  best thirds. A team that finishes third in its group but does not advance
  earns no qualifier or exact-position points.
- Full group order exactly correct: 5 point bonus.
- Correct best-third qualifier: 3 points.
- Best-third order is ignored.

For group-stage scoring, "advancing position" means first, second, or third
only when that third-place team is one of the official best-third qualifiers.

This keeps the group-stage balance close to the original rules while removing
the unwanted reward for non-advancing third-place teams. A perfect group with an
official best-third qualifier still earns 11 points before best-third picks: 3
advancing teams x 2 combined qualifier/exact-position points, plus the 5 point
full-order bonus. A perfect group without an official best-third qualifier earns
9 points because only the top two teams advanced.

## Balance Target

The first round should reward good early predictions without deciding the pool.
With 12 groups and 8 best-third qualifiers, the perfect first-round score is
148 points: 8 best-third groups x 11 points, 4 non-best-third groups x 9 points,
and 8 best-third picks x 3 points. The previous maximum was 156 points, so the
only reduction is the 8 points that used to come from exact third-place slots
for teams that did not advance. Knockout matches and futures still leave enough
points available for the leaderboard to move through the final match.

## Knockout Matches

Base points by round:

| Stage | Base |
| --- | ---: |
| Round of 32 | 4 |
| Round of 16 | 6 |
| Quarterfinal | 10 |
| Semifinal | 16 |
| 3rd place | 14 |
| Final | 20 |

Score mode:

- Exact regulation score and correct advancing team on a match not decided by
  penalties: 2.0x base.
- Exact penalty shootout score on a match decided by penalties: 3.0x base,
  only when the regulation draw score and advancing team are also exact.
- Predicted a penalty shootout and correct advancing team, but wrong regulation
  draw score: 1.5x base.
- Exact regulation draw and correct advancing team, but wrong or missing
  penalty shootout score: 2.0x base.
- Correct advancing team but wrong score: 1.0x base.
- Regulation draw decided on penalties: 0.5x base fallback.
- Wrong advancing team: 0.

Penalty shootout example:

Official result: Argentina 1-1 Spain; Argentina advances 5-4 on penalties.

| Prediction | Multiplier |
| --- | ---: |
| 1-1, Argentina, 5-4 pens | 3.0x base |
| 1-1, Argentina, wrong or no penalty score | 2.0x base |
| 0-0, Argentina, 5-4 pens | 2.0x base |
| 0-0, Argentina, wrong penalty score | 1.5x base |
| 2-1, Argentina | 1.0x base |
| 1-1, Spain | 0.5x base |

## Futures

| Prediction | Points |
| --- | ---: |
| Champion | 20 |
| Runner-up | 15 |
| Top scorer | 10 |
| Favorite team last round exact | 10 |
| Ecuador last round exact | 12 |
| Perfect futures card bonus | 75 |

## Bonuses

### Round of 32 bonus questions

The Round of 32 has 9 fixed-point bonus questions worth 2 points each, for an
18 point maximum. These bonus-question points are independent of knockout base
points and do not scale with the Round of 32 match value.

| Question | Points |
| --- | ---: |
| How many matches will go to extra time? | 2 |
| How many matches will be decided by penalties? | 2 |
| Which team will score the most goals? | 2 |
| Total goals scored in the R-32 (no penalties) | 2 |
| Which team will score the fastest goal? | 2 |
| Which team will score the latest goal? | 2 |
| Team with the biggest winning margin? | 2 |
| How many yellow cards will be shown? | 2 |
| How many red cards will be shown? | 2 |

### Perfect-card bonuses

| Bonus | Round of 32 | Round of 16 | Quarterfinal | Semifinal |
| --- | ---: | ---: | ---: | ---: |
| Perfect knockout winners | 25 | 25 | 25 | 25 |
| Perfect knockout scores | 40 | 25 | 15 | 10 |

Perfect knockout bonuses are calculated separately once each eligible knockout
stage is complete: Round of 32, Round of 16, Quarterfinal, and Semifinal. The
3rd place and Final do not award perfect knockout winner or perfect
knockout score bonuses.

Perfect futures card bonus: 75 points.
