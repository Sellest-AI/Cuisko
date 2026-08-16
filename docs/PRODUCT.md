# Product

What Cuisko is for, who it serves, and what it refuses to become.

> ⚠️ **Premier jet.** This is a first pass at describing the product, written from an early
> conversation and a set of mockups. It is the best current statement of intent, not a settled one —
> expect the product to diverge from it as it gets built and used.
>
> **When your work contradicts this page, say so.** Do not quietly follow a description that has
> stopped being true, and do not silently rewrite it either: raise it with the user, agree on what
> changed, then update this page in the same breath. A vision document nobody maintains is worse
> than none at all — it keeps agents confidently building the wrong thing.

**This page contains no rules and no architecture.** It exists so that anyone — human or agent —
writing code, copy or a feature spec can tell whether the thing they are about to build actually
belongs in this app. When a technical decision has two defensible answers, the tie-breaker is here.

For how the code is organised, see [ARCHITECTURE.md](./ARCHITECTURE.md). For naming and placement,
[CONVENTIONS.md](./CONVENTIONS.md).

---

## In one line

**Cuisko looks at the food you already own and hands you a week of meals plus the short list of what
is still missing.**

Everything else in the product is in service of that sentence.

---

## The problem

Two things happen in every household, every week, and they are the same problem seen from two ends:

1. **"What do we eat tonight?"** — asked at 7pm, when it is far too late to answer well. The
   decision is made under fatigue, so it defaults to whatever is fastest, which is rarely what was
   in the fridge.
2. **The food that quietly rots.** Half a bag of carrots, the yoghurts nobody remembered, the
   ingredients bought for a recipe that never got cooked. Nobody wastes food on purpose. They waste
   it because the food is out of sight at the moment the decision gets made.

Meal-planning apps mostly attack the first problem and ignore the second. They cheerfully plan a
week of meals that requires a full shop, while the food you own goes untouched. Inventory apps
attack the second and ignore the first: they make you catalogue your kitchen and give you nothing
back for the effort.

Cuisko only makes sense as both at once. **The plan is generated from the stock.** That is the
product.

---

## Who it is for

**People who want to cook from what they already have, waste nothing, and spend less at the store.**

Not aspiring chefs, not athletes counting macros, not people looking for a food hobby. The user is
someone who cooks because people need feeding, wants to do it well enough, and is quietly annoyed at
throwing food away and buying things they already owned.

That persona sets the priorities:

- **Money and waste are the currency of success**, not culinary ambition. "You already had four of
  these six ingredients" is a better outcome than "here is a stunning recipe".
- **Ambition is a liability.** A plan that assumes an hour of cooking and three purchases per meal
  is a plan that gets abandoned on Tuesday.
- **The unglamorous features matter most.** Keeping the cellar accurate is a bigger product problem
  than recipe discovery, and it deserves more design effort, not less.

---

## The hero moment

There is one moment the whole app is built to deliver, and it is worth protecting above all others:

> You open Cuisko with a stocked kitchen. One tap later you have a week of meals built from what you
> own, and a shopping list that is short — because most of what you needed was already at home.

Judge features against that moment. Anything that makes it faster, more accurate or more surprising
is worth building. Anything that adds a step in front of it is suspect, however good it is on its
own.

---

## The rhythm of use

Cuisko is not a daily-engagement app, and should never be designed like one. It is used in three
distinct beats, and they need very different things:

| Beat | When | What the user needs |
| ---- | ---- | ------------------- |
| **Plan the week** | Once a week, seated, unhurried | Confidence and control. Seeing the whole week, swapping what does not appeal, understanding *why* a meal was suggested. |
| **Do the shopping** | Once a week, standing in a shop, one-handed | Speed and legibility at arm's length. Big targets, obvious state, nothing that needs reading twice. |
| **Cook** | Daily, hands dirty, phone on the counter | Not to be interrupted. Large text, no ads for other features, no decision to make — the decision was made on planning day. |

Two rituals and a daily follow-through. The planning screens carry the product's promise; the
shopping and cooking screens carry its credibility. A beautiful planner with a painful shopping
experience is a failed product, because the user only forgives the second beat if the first one paid
off.

---

## Cuisko, the red panda

Cuisko is both the app and its mascot: **a red panda** (*panda roux*) who acts as a little chef in
your pocket. He is the voice of every message, empty state and confirmation in the product.

**His register is a warm, playful friend with real energy — who knows when to stop being cute.**

- Celebrates small wins. Two eggs added to the list is a tiny victory and it can be acknowledged.
- Emoji-friendly, in moderation — they carry meaning (🥕 a carrot, 🔥 cooking time), they are not
  decoration sprayed across a sentence.
- Familiar. In French he uses *tu*, never *vous*.
- **Professional when it counts.** When something failed, when data is at stake, when the user is
  mid-task in a shop — the mascot steps back and the answer arrives plainly. Playfulness is for good
  news and idle moments, never for errors and never in the middle of a task.

```
✅ "C'est noté ! 2 œufs ajoutés à ta liste 🥚"
✅ "Je n'ai pas réussi à lire ce ticket. Tu peux réessayer avec une photo plus nette ?"

❌ "Oups ! 🙈 Mon petit ventre de panda a mangé ton ticket, réessaye ! 😅"   (cute about a failure)
❌ "Ingredient successfully added to grocery list."                          (no voice at all)
```

He also never comments on *what* the user eats. Not approvingly, not disapprovingly. He helps them
cook it.

---

## The four anti-goals

The clearest way to keep the product honest. Each of these is a real fork the app could take, and
each one would break it.

### 1. Not a calorie policeman

Nutrition is information, never a verdict. No red warnings, no daily budget the user "blew", no
guilt mechanics, no streaks that punish. A recipe's nutrition card is there because it is
interesting — the moment it starts scoring the user, Cuisko has become an app people delete in
January.

### 2. Not a data-entry chore

**If keeping the cellar accurate feels like inventory work, the product has failed.** Every manual
step the user has to perform to keep their stock in sync is a bug, not a feature awaiting polish.
This is the hardest promise in the app and the one most likely to be quietly abandoned under
deadline pressure — a form is always faster to build than the thing that removes the form. Photos of
receipts, sensible assumptions, deductions from what was cooked, generous defaults: whatever it
takes to keep the user out of a spreadsheet.

### 3. Not a social network

The recipe catalogue is a **library to draw from, not a feed to perform in**. No followers, no like
counts driving behaviour, no reason to post for an audience. A user should be able to use Cuisko for
a year, alone, and never feel they are missing the "real" app.

### 4. Not a rigid plan

The week is a suggestion the user reshuffles constantly, not a contract. Plans change — someone
comes over, someone is late, nobody feels like fish. Deviation is normal use, never failure: the app
absorbs the change and re-reconciles the list, and it never shows a user that they "missed" a
planned meal.

---

## The world of the app

The concepts users actually think in. **The naming is not settled yet** — treat the words below as
descriptions of concepts, not as fixed vocabulary, and expect the French and English wording to
still move. The same goes for the mascot's name and for the mockups the design is drawn from: they
are early explorations, not a finished render. A better word for a concept is a welcome suggestion,
not a deviation — say so rather than silently working around it.

- **The cellar** *(le cellier)* — everything the household currently owns. The foundation the whole
  product rests on. Its accuracy determines whether any suggestion is any good, which is why keeping
  it truthful without effort is the app's central design problem.
- **The grocery list** *(la liste de courses)* — what is missing, derived from the gap between the
  plan and the cellar. Shopping done well should empty the list and refill the cellar.
- **The planning** *(le planning)* — the week's meals, by day and by moment (lunch, dinner). Loose,
  reshuffleable, always reconcilable with the list.
- **Recipes** — a set of ingredients and steps. Some are the user's own, some come from the
  catalogue, some are invented on demand for the stock at hand.
- **The household** *(la maison)* — the people cooking and shopping together. Food is shared, so the
  cellar, the list and the plan are shared too. Cuisko is not a personal-diary app that happens to
  support two accounts; it is designed around a kitchen, which usually has several people in it.
- **The assistant** — Cuisko himself, who does not merely advise. Asked to add two eggs or to swap
  Tuesday's meal, he performs the change and reports it. The user talks in plain language and the
  cellar, the list and the plan reconcile themselves.

---

## Two features that are frequently misread

**Nutrition goals are an optional companion, not a pillar.** Most users will never set one. Those
who do (more protein, less meat, a specific diet) should find the planning quietly respects it —
without the app ever turning into a tracker, and without the goal becoming a wall the user has to
get past to reach a meal plan. It is a preference, in the same family as "no shellfish".

**The recipe catalogue is largely AI-generated.** Community here means the catalogue is fed by what
people actually cook, and the AI produces much of the raw material. It is a supply of ideas for when
a repertoire runs dry, not a destination users are meant to visit and browse for pleasure. Design it
as a well-stocked shelf, not as a place with a culture.

---

## Bilingual by nature

French and English are both first-class from launch, and stay in sync. This extends past interface
labels: **generated content follows the user's language.** A French user gets recipes, step
instructions and assistant replies in French — including the parts a model wrote. A recipe that
arrives half-translated is a broken recipe.

---

## Where the product is today

The first version has to make the core promise real end to end, and nothing more:

- The cellar, the grocery list, and the weekly planning — the loop from "what I own" to "what I
  cook" to "what I still need to buy".
- The recipe screens and step-by-step cooking mode, which close that loop: cooking is the step that
  turns owned food into a meal, and it is what tells the cellar which ingredients were spent.

Step-by-step cooking mode was originally listed below as deliberately not first. It moved into
scope once it became clear the cellar cannot stay accurate without it — the app has no other moment
at which to learn what a meal consumed. It ships ahead of its data: the screens are built, and the
queries that feed them are not.

Everything else — receipt scanning, the community catalogue, nutrition goals — is real product,
planned, and deliberately not first. They amplify the core loop; none of them can substitute for
it. If a decision trades quality in the core loop for progress on one of these, it is the wrong
trade.

---

## The test

When you are unsure whether something belongs in Cuisko, ask in this order:

1. Does it help someone **cook what they already own**?
2. Does it **remove work** rather than add it?
3. Would it survive a tired user on a Tuesday evening?
4. Does it treat the user as **capable and unjudged**?

A feature that fails the first two is not a Cuisko feature, however good it is.
