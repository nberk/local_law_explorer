# Cross-jurisdiction patterns in LOCUS-v1

What 1,989 American city and county codes have in common, where they differ, and
why. This is an exploratory read of the LOCUS-v1 corpus (2.21M ordinance chunks,
all 50 states) aimed at one question: **what is actually in local law, and how
much of it is a choice each town makes?**

Companion interactive page: [`conduct-explorer.html`](./conduct-explorer.html).

## How this was measured

LOCUS is ~1.77 GB of Parquet. Two practical constraints shaped the method:

1. **Streaming aggregations over the remote `hf://` files are cheap; scanning the
   `content` column is not.** A `GROUP BY` that touches only `header`, `topic`,
   and the score columns streams in 15–25s. A query that reads `content` (even a
   `substr`, even behind a narrow `header` filter) forces full row-group scans
   across all 8 shards and times out past ~2 min. So the *structural* analysis
   uses a single header-only aggregate; the dog *text* analysis uses two Parquet
   shards downloaded locally.

2. **Matching is on the law `header` (title), not the body.** "Town regulates X"
   means "has a substantive law whose title mentions X." This undercounts (a rule
   can cover a subject without naming it in the title) but almost never
   false-positives, and titles are far less OCR-noisy than bodies.

The workhorse query is one `GROUP BY (type, state, place)` over the whole corpus
with ~47 `count(*) FILTER (WHERE header ILIKE '%term%')` probes plus topic counts
and the four score means. The result is a 2,287-row table mined offline. Unless
noted, figures are over the **1,652 city codes with ≥300 substantive laws**, so
"absent" reflects a real choice rather than a coverage gap.

**Caveats that travel with every number below:** topics and the four dimensions
are *model predictions* (noisy); the four scores are z-scores already normalized
within LOCUS; text is OCR'd; this is descriptive, not legal advice.

## 1. Every code is the same spine plus optional extras

Share of substantial city codes whose title mentions each subject:

| Tier | Subjects (share of cities) |
|---|---|
| **Universal core** | alcohol 83% · noise 77% · junk vehicles 66% · leash/at-large 64% · dangerous dogs 64% · fences 62% · fireworks 61% |
| **The optional middle** | parades 53% · weeds 53% · **backyard chickens 50%** · snow removal 50% · curfew 49% · signs 48% · loitering 43% · door-to-door sales 43% |
| **The quirk tail** | drones 1.6% · goats 4% · profanity 5% · beekeeping 5% · pigeons 5% · shopping carts 5% · EV charging 7% · fortune-telling 7% · tattoo 8% · vaping 8% · wind turbines 8% |

The middle band is where towns most differ. Half regulate backyard chickens; half
don't. That ~50/50 split is the single largest axis of variation between
otherwise-similar towns.

## 2. "Dense" and "strict" are independent traits

Pearson correlation of the four model dimensions across 2,287 jurisdictions:

```
              opacity  paternalism  enf_disc  prob_sal
opacity          1.00       -0.16      0.17      0.09
paternalism     -0.16        1.00      0.73      0.78
enf_disc         0.17        0.73      1.00      0.79
prob_sal         0.09        0.78      0.79      1.00
```

Paternalism, enforcement discretion, and problem salience form one tight "control"
personality (r ≈ 0.73–0.79). **Opacity — how densely the laws are written — is
orthogonal to all three** (|r| ≤ 0.17). How wordy a town's laws are tells you
nothing about how controlling they are. The two are separate dials.

## 3. States have legal personalities

State means of the (already-normalized) z-scores, states with ≥8 jurisdictions:

- **Densest legalese:** FL (+0.36, far ahead), WI, MD, CT, CA
- **Plainest:** IA and SD (−0.40), MT, AK, OK, NE — the rural Plains and Mountain West
- **Most likely to regulate conduct (paternalism):** OH (+0.29), MO, WV, MN — the industrial Midwest
- **Most hands-off on conduct:** AK, WA, FL, OR, CA — the West Coast and Alaska
- **Most officer discretion:** MN, MO, OH, PA, ID; **least:** AK, WA, CA

Florida is the cleanest illustration of #2: **densest in the country yet among the
least paternalistic.** It writes wordy laws that don't boss you around.

## 4. Geography is destiny (regional variation, and why)

Subjects with the widest spread between most- and least-regulating states (states
with ≥10 substantial city codes), and the most plausible cause:

| Subject | High | Low | Why |
|---|---|---|---|
| **Snow removal** | SD 100%, IA 97%, MN 93% | LA/GA/FL 0% | climate — pure latitude gradient |
| **Marijuana** | CO 96%, SD 96%, CA 88% | IN/ID/IA 0% | state legalization status |
| **Curfew** | OH 90%, WV 76%, UT 75% | NY 9%, MA 8%, NJ 5% | Midwest/rural vs. Northeast norms |
| **Fireworks** | AZ 100%, IA 97%, ND 92% | NJ 20%, MD 18%, NY 16% | **state preemption** — banned statewide in MA/NJ/NY, so no city law needed |
| **Golf carts / ATVs** | IA 76%, WV 65%, WA 58% | MD/MA/AZ 0% | rural road culture |

The Northeast (NY/NJ/MA) sits at the bottom of nearly every conduct/nuisance
subject. The likeliest reason isn't indifference but **higher-level preemption**:
when a state has already legislated (fireworks bans, statewide curfew limits),
the municipality stays silent. Absence of a local law can mean the question was
settled one level up.

## 5. A town's quirks reveal when its code was last rewritten

Regulations that co-occur more than chance predicts (lift = P(A&B)/P(A)P(B)),
among subjects above 8% prevalence:

- **Antique license bundle** (lift 1.6–2.5): `billiards + circus + pawn + massage`.
  1920s-era "amusements and trades" chapters. A town with billiard-hall rules
  almost certainly also licenses circuses and pawnshops.
- **Modern retrofit bundle** (lift 1.6–3.2): `solar + wind + short-term rentals +
  graffiti + food trucks`. Towns that added Airbnb rules also added renewable and
  food-truck rules.

The regulations a town carries act like tree rings: a code heavy on circuses and
pawnshops hasn't been seriously touched in decades; one with STR and solar rules
was recently overhauled.

## 6. One-third of every code, everywhere, is scaffolding

Mean topic mix is strikingly constant across regions — administrative "Other"
(penalties, definitions, code mechanics) is **~35% everywhere** (NE 35.2%, MW
35.5%, South 35.3%, West 35.2%). Beneath that constant overhead the regional tilt
is mild: the **West is most zoning-heavy** (20%), the **Midwest most
nuisance-heavy** (21%). The fixed cost of *being* a government is about a third of
the codebook regardless of geography.

## 7. When there are exactly two ways: the dangerous-dog fork

The clearest "cities pick one of N approaches" case in the corpus is dangerous-dog
law. Among the 1,091 substantial city codes with such a law:

- **95% take the behavior-based approach** — any dog that bites or threatens is
  "dangerous" or "vicious," regardless of breed.
- **21% layer on a breed-specific rule** (BSL) that names pit bulls or specific
  breeds — and this is essentially a **Southern overlay**: MS 50%, NM 45%, AR 38%,
  LA 37%, NC 30%, TN 29%, VA 28%, SC 27%.

Behavior-based is the national default; breed-specific legislation is a regional
dialect concentrated in the Deep South. Reading the actual ordinances (see the
companion page) shows the fork has *sub*-approaches too: outright permit
requirements (Denver), mandatory spay/neuter of the named breed (Lamar, CO), and
even towns that legislate the *opposite* — "no dog may be declared dangerous based
solely on its breed" (Cullman, AL; Heflin, AL).

## Reproducing this

All queries are header-only aggregates (run in ~15–25s each) except the dog text
pull, which reads two locally-downloaded shards:

```bash
pip install duckdb                       # 1.5.x
# 1. structural aggregate (one GROUP BY, ~47 ILIKE probes) -> agg.parquet
# 2. export prevalence + regional matrix -> insights_data.json
# 3. dog text: download shards 0-1 from
#    https://huggingface.co/datasets/LocalLaws/LOCUS-v1/resolve/main/data/train-0000{N}-of-00008.parquet
#    then filter header ILIKE '%dog%'/'%vicious%'/'%leash%'/... for full content
```

The scripts used (`agg.py`, `export.py`, `dogfull.py`) live in the working
scratchpad; the derived data (`insights_data.json`, curated dog laws) is inlined
into `conduct-explorer.html` so that page is self-contained and opens offline.

## Why these patterns matter for the site

Three of these map directly onto the explorer's "what are the laws where I live?"
mission and could become features:

- **#1 prevalence** → a "your town probably regulates…" reveal that makes the
  breadth of local law tangible.
- **#7 approaches** → a navigable, plain-language view of how towns answer the same
  question differently (dogs is the worked example).
- **#4 regional variation** → a "the rules change at the state line, and here's
  why" view that frames local law as genuinely *local*.
