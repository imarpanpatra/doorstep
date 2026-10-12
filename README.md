# Doorstep

**Outside, for people whose outside is two hundred metres.**

Every app that wants to get you outdoors assumes the only thing stopping you is
motivation. Doorstep assumes the opposite: that you already want to go, and the
limit is your body. It asks one question nothing else asks.

> **How far today?**

Not a target. A ceiling. Some days it is smaller, and that is allowed.

Built for the [Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).

---

## The idea

Fitness apps treat distance as a number to beat. Streaks, personal bests, "you
walked less this week". For someone recovering from surgery, living with
chronic pain, or simply eighty years old, distance is not an ambition. It is a
ceiling set by the body, and it moves day to day.

Doorstep takes today's ceiling as an input, finds everything genuinely within
it, and asks a local open-weight model to pick **one** place worth the walk.

```
How far today?  [=====o----------------]  200 metres

   Balbhim Mandir
   138 metres · somewhere to sit · shaded
   "Shaded most of the way, and somewhere to sit at the end."
```

Then, later, one question: did you go? That is the whole loop.

## The rule that matters

**The model chooses which. It never chooses how far.**

Every place is filtered against today's reach in code, before the model is
asked anything. By the time it sees the list, every option is already safe. The
worst it can do is pick a dull one.

This is not tidiness. A language model that cheerfully suggests somewhere
"just a bit further" is, for this user, an app that strands them two streets
from home. So the radius is arithmetic, not judgement:

```js
const eligible = places.filter((p) => p.metres <= reach);
```

A verdict naming a place that was not on the list is treated as a
hallucination, not a suggestion, and falls back to the nearest place to sit.

## What it says when there is nothing

```
There is nothing mapped within 120 metres of you today.

That is the map being thin here, not you.
```

It does not stretch the radius. It does not invent a destination. For this
user, a made-up bench is worse than no answer at all.

## The same app is a different app in the next city

Two fetches, two Indian cities about 300 km apart:

| | The smaller city | The larger city |
| --- | --- | --- |
| places within 1200m | 28 | **701** |
| benches | **0** | 24 |
| mapped trees | 3 | 566 |
| anything within 200m | **nothing** | 3 places |

Same code, same radius, same query. In one neighbourhood Doorstep has a park,
a bench and a tree to choose between. In the other it has to say *there is
nothing within reach of your door*, because OpenStreetMap genuinely does not
know about anything there.

OSM is volunteer-mapped, so its street-furniture layer tracks where mappers
live rather than where benches are. That is exactly backwards for this app:
the places with the thinnest data are not the places with the fewest benches,
they are the places with the fewest people mapping them.

So the list of what counts as a destination is not the list you would write
looking at a European map. It is what is reliably mapped across India:

| Mapped everywhere here | Mapped almost nowhere here |
| --- | --- |
| temples and mandirs (shaded, quiet, you may sit) | benches |
| parks, gardens, maidans | drinking fountains |
| markets, chowks, corner shops | individual street trees |

Both lists are in the query. Where a bench exists it is the best answer; where
one does not, a temple courtyard at 7am is a real place to sit.

## Why open weights

Three reasons, and the first is the one that decides it.

1. **This is health data.** An app that knows you could only manage 150 metres
   today, and that yesterday it was 400, holds a record of your body getting
   better or worse. That belongs on your own machine. There is no network call
   to inspect here because there is no network call.
2. **It has to work with the radio off.** The map is downloaded once, during
   setup, and never again. After that Doorstep works in a basement flat, on a
   dead prepaid SIM, in a street with no signal.
3. **It costs nothing to run.** A gate that bills per request is one a
   pensioner turns off.

## Run it

Needs [Ollama](https://ollama.com) and Node 20+.

```bash
ollama pull gemma3:4b
npm install

# the one and only network call: downloads your neighbourhood
npm run map -- <lat> <lon> [radius]

npm start                 # http://127.0.0.1:4788
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DOORSTEP_MODEL` | `gemma3:4b` | any Ollama open-weight model |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | where Ollama listens |
| `DOORSTEP_DATA` | `./data/doorstep.json` | reach and outing history |
| `DOORSTEP_MAP` | `./data/map.json` | the downloaded neighbourhood |
| `OVERPASS` | (auto) | pin a single Overpass mirror |
| `PORT` | `4788` | |

## What it deliberately does not do

- **No streaks.** Streaks punish bad days, and bad days are the condition, not
  a failure of will. It counts days you got out over a month, which one hard
  week cannot erase.
- **No step counting, no pace, no calories.** Going out and sitting down is a
  complete success.
- **It never mentions your health back at you.** The model is instructed never
  to reference pain, recovery, limits, or trying harder.

## License

MIT.
