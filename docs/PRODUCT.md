# Product

What Cuisko is for, who it serves, what it already does, and what it refuses to become.

> ⚠️ **Living document.** First written from an early conversation and a set of mockups, then
> reconciled with the whole commit history on 2026-09-28. [What Cuisko does today](#what-cuisko-does-today)
> describes what is built; [What comes next](#what-comes-next) what is agreed and not yet built.
> It is the best current statement of intent, not a settled one — expect the product to keep
> diverging from it as it gets built and used.
>
> **When your work contradicts this page, say so.** Do not quietly follow a description that has
> stopped being true, and do not silently rewrite it either: raise it with the user, agree on what
> changed, then update this page in the same breath. A vision document nobody maintains is worse
> than none at all — it keeps agents confidently building the wrong thing. A feature that ships
> moves from *What comes next* to *What Cuisko does today* in the same change.

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
your pocket. He is the voice of every message, empty state and confirmation in the product, and his
head sits in the assistant's header.

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
counts driving behaviour, no reason to post for an audience. Favorites are a private shelf, not a
vote. A user should be able to use Cuisko for a year, alone, and never feel they are missing the
"real" app.

### 4. Not a rigid plan

The week is a suggestion the user reshuffles constantly, not a contract. Plans change — someone
comes over, someone is late, nobody feels like fish. Deviation is normal use, never failure: the app
absorbs the change and re-reconciles the list, and it never shows a user that they "missed" a
planned meal. Skipping a plate is one gesture, and it quietly takes that plate's groceries off the
list.

---

## The world of the app

The concepts users actually think in. **The naming is not settled yet** — treat the words below as
descriptions of concepts, not as fixed vocabulary, and expect the French and English wording to
still move. The same goes for the mascot's name and for the mockups the design is drawn from: they
are early explorations, not a finished render. A better word for a concept is a welcome suggestion,
not a deviation — say so rather than silently working around it.

- **The cellar** *(le cellier)* — everything the household currently owns. The foundation the whole
  product rests on. Its accuracy determines whether any suggestion is any good, which is why keeping
  it truthful without effort is the app's central design problem. It fills when shopping is ticked
  off and empties when a meal is cooked; each row carries an estimated "use by" date, guessed from
  how long that food usually keeps.
- **The grocery list** *(la liste de courses)* — what is missing, derived from the gap between the
  plan and the cellar, plus anything the shopper asked for outright. The plan's share is netted
  against the cellar: a meal finds its ingredients at home and only the shortfall is worth a trip.
  A line someone adds themselves is not netted — they knew what was in the kitchen when they wrote
  it, so "buy bread" from someone who has a loaf means a second one. Shopping done well should
  empty the list and refill the cellar.
- **The planning** *(le planning)* — the week's meals, by day and by moment (lunch, dinner). Loose,
  reshuffleable, always reconcilable with the list. A planned meal is a **plate**: one recipe, for a
  number of people, on a day and a moment.
- **Recipes** — a set of ingredients and steps. Some are the user's own, some come from the
  catalogue. Recipes invented on demand for the stock at hand are intended, not built.
- **The household** *(la maison)* — the people cooking and shopping together. Food is shared, so the
  cellar, the list and the plan are shared too. Cuisko is not a personal-diary app that happens to
  support two accounts; it is designed around a kitchen, which usually has several people in it.
  One person can belong to several households and switch between them.
- **The navigation bar** — always at the bottom of the screen, where the user types or speaks. It is
  where Cuisko *acts* today: "2 œufs" lands on the list without leaving the screen, a dish name
  offers matching recipes, and anything else opens the conversation.
- **The assistant** — Cuisko in conversation. He answers from the household's real stock and the
  real catalogue, and hands back something to tap: a recipe card, a swap, a button into the right
  screen. **Today he invites; he does not act.** Asked to add two eggs or swap Tuesday's meal, he
  points the user to the place where they can do it. The goal is for him to perform the change
  himself and report it, so the user talks in plain language and the cellar, the list and the plan
  reconcile themselves.

---

## Three things that are frequently misread

**Nutrition goals are an optional companion, not a pillar.** Most users will never set one. Those
who do (more protein, less meat, a specific diet) should find the planning quietly respects it —
without the app ever turning into a tracker, and without the goal becoming a wall the user has to
get past to reach a meal plan. It is a preference, in the same family as "no shellfish". Today that
means a diet, allergens and nutrition aims (high-protein, low-calorie, low-carb, high-fibre,
iron-rich, high-calorie) stored once on each person's preferences and honoured by the planning, plus
nutrition figures the assistant can read out on request. The aims are desires, not verdicts:
high-calorie is there for someone eating to gain weight exactly as low-calorie is for someone eating
to lose, and nothing renders either back at the cook as a judgement.

**The recipe catalogue is AI-written, not AI-invented.** Every catalogue dish starts from a real
recipe on a site people already cook from (Marmiton, BBC Good Food), so the dish and its proportions
are ones someone has actually made. The AI rewrites everything around it: it structures the page,
cleans the wording, links every ingredient to the food catalogue, derives diet and nutrition tags,
translates it, and generates its cover and plate images. The catalogue is a supply of ideas for when
a repertoire runs dry, not a destination users are meant to visit and browse for pleasure. Design it
as a well-stocked shelf, not as a place with a culture.

**A catalogue recipe is a plate.** The planning fills lunches and dinners, one dish each, so the
catalogue holds what a cook serves as the meal itself: a curry, a gratin, a tajine, a bowl of pho.
Not a dessert, a starter, a side, a dip, a sauce, a bread, a drink or a breakfast. The test is
whether cooks somewhere sit down to it as their meal, not whether the dish is famous or where it is
from: a soup or a salad is a plate when it is eaten that way (harira, pho, salade niçoise, a Greek
salad at lunch) and not when it only opens a meal (gaspacho, caprese). If it is a plate in one
country's kitchen, it is a plate here; a rule tied to one country would narrow a catalogue whose
point is to widen the repertoire. A dish that fails the test is not a lesser recipe, it is the wrong
kind of thing, and the import refuses it rather than shelving it. The planning applies the same test
again and keeps sauces, desserts and drinks out of the week.

---

## Bilingual by nature

French and English are both first-class, and stay in sync. This extends past interface labels:
**generated content follows the user's language.** A French user gets recipes, step instructions and
assistant replies in French — including the parts a model wrote. A saved recipe is translated into
every language it is missing, so a recipe never arrives half-translated.

---

## What Cuisko does today

The core loop is built end to end: from "what I own" to "what I cook" to "what I still need to buy",
and back into the cellar. Grouped by the beat it serves.

### Plan the week

- **The planning tunnel.** A short run of questions, any of which can be skipped — how many people
  and which meals (it opens on two people and a week of lunches), what they are in the mood for (up
  to four, mixed across the week), diet, allergies, the time available, the utensils in the
  kitchen, and nutrition aims — then one loading screen, and a week of plates. The time, utensils
  and aims answers really narrow the week; they are not decoration. Keeping the week ends the
  tunnel on home, and says so plainly if keeping it failed.
- **It remembers.** The tunnel opens on what the household already answered; diet, allergens and
  nutrition aims are saved to each person's preferences, so they are asked once. Planning again
  continues the week already kept rather than stacking a second one on top of it.
- **The week is built from the stock.** Recipes that use what the cellar holds rank higher, and what
  expires soonest is planned first, on a day before it goes off. Later plates are ranked on what
  earlier plates will already buy, so one bunch of coriander serves two meals — weighted toward
  rare ingredients, fading so the week does not turn into five variations of one dish, with the
  cuisines varied and alike meals kept off neighbouring days.
- **Review before keeping.** Every draft plate can be swapped for another real catalogue recipe;
  each comes with its runners-up. Keeping the week also keeps its groceries.
- **Plan anything, any time.** A single recipe can be planned from its own page, and the sheet says
  up front that its groceries get listed. A kept plate can be edited from the meal sheet: another
  dish, another day, different servings (its ingredients rescale), or one of the week's ideas. A
  plate already cooked is locked.
- **Home.** The week as a carousel of plates (starting on dinner in the evening), a shelf of seven
  ideas drawn from the household's week, the user's favorites, quick access to the list and the
  cellar, and an empty state for a household that has not started yet.

### Do the shopping

- **A list that is only the gap.** What the plan needs minus what the cellar holds, plus whatever
  the shopper wrote down themselves. The same food in two units of one family (grams and kilos)
  is one line. Quantities on the list round up to their unit's precision, since short is worse
  than long in a shop; a recipe's own quantities round to the nearest.
- **Read it the way you shop.** "To buy" can be read by aisle or by meal, and the list leads with
  the section the shopper came for. A meal's heading opens its recipe. Lines are ordered by when
  they were last touched, so what was just ticked settles out of the way after a minute.
- **Ticking refills the cellar.** Buying something moves it into the cellar in one tap, strikes the
  shopper's own line for it, and can be undone for a few minutes. The quantity sheet asks how much
  was bought, opening on the amount the tapped plate needs; a partial purchase covers the soonest
  meal first. A light haptic tick confirms each tap.
- **The cellar on the same screen.** Its cards show what the household owns, and a clock appears on
  anything close to its date. Taking food out of the cellar puts it back on the list if a planned
  plate still needs it.

### Cook

- **Recipe pages** with swipeable tabs for ingredients and method, a generated cover and plate
  image, servings taken from the planned plate, quantities and durations in bold, and hints on the
  steps that need one. Tapping an ingredient reads it in another unit.
- **Step-by-step cooking mode** — large text, the recipe's cover behind every step, a draggable step
  slider, the last step clearly marked.
- **Cooking settles the plate.** Finishing the last step spends the plate's ingredients from the
  cellar, so the stock stays true without anyone typing it in. The button that does it waits three
  seconds before appearing, so a thumb still tapping "next" cannot hit it by accident, and the cook
  lands on the cellar to see what the dish used, with home behind it. Skipping a plate nobody cooked frees its
  groceries instead. Only the eaten share of an ingredient counts (the peel is not dinner), and
  foods bought whole but used in slices are counted in slices.

### Recipes

- **My recipes, and a private favorites shelf** on any recipe, shown on home.
- **Search across the whole catalogue** by name or ingredient, filtered by diet and nutrition
  claims, ranked for the person searching.
- **Writing a recipe is not a form.** Paste a pile of free text, or import a web page (its source is
  kept), and the editor comes back structured. Every ingredient line is linked to the food
  catalogue, even a word the catalogue has never seen, which is then created with its own photo.
  The cook corrects whatever the model guessed, can rewrite a saved recipe later, and deletes one by
  archiving it.
- **Every saved recipe is completed for the cook:** diet and nutrition tags derived, missing
  languages translated, cover and plate images generated.

### Talk to Cuisko

- **The navigation bar** takes typing or voice, from any screen. An ingredient goes straight onto
  the list; a dish name offers recipes; whatever the bar cannot tell apart on its own is classified
  by a model.
- **The assistant chat** answers from the household's available stock and the real catalogue:
  what to cook with what is left, nutrition questions, what to swap for a missing ingredient (shown
  as a card). Replies stream in order with visible status lines and render formatting. When the
  answer calls for a change, he ends with a button into the screen where the user makes it.

### Household and account

- Sign in with Google or with email and password; the splash holds until the profile is loaded.
- **Every sign-in walks the onboarding** before home: a promise screen, then the list filled from the
  navigation bar, a recipe searched and planned, a step-by-step cook and a generated week, each
  opened by a screenshot of the real screen. It runs on pretend data and writes nothing to the
  account. It ends on home with Cuisko's chat open. For now it runs again after a sign-out or a
  reinstall, since nothing records that it was seen.
- Create, join (by invite code), leave and switch households, from an account drawer. Each cook has
  a generated avatar and their own preferences.

---

## What comes next

Agreed, not built, in no particular order. Each one amplifies the core loop; none of them can
substitute for it. If a decision trades quality in the core loop for progress on one of these, it
is the wrong trade.

| Feature | Why it belongs | What it must not become |
| ------- | -------------- | ----------------------- |
| **Scan a receipt to fill the cellar** | The biggest remaining cut to data entry (anti-goal 2): one photo instead of ticking a whole shop. | A form to review line by line. When a line cannot be read, say so plainly and move on. |
| **The list works offline in the shop** | Shopping is the beat where signal is worst and patience is shortest. Ticking must never wait on the network. | A list that silently diverges from the household's: what was ticked offline reconciles when signal returns. |
| **A weekly "what you saved" line** | Money and time are the currency of success; showing them once a week makes the promise visible. | A score, a streak or a guilt metric. It reports what was saved, never what was "lost" or "missed". |
| **Photos in the navigation bar chat** | A photo of the fridge or of a dish is faster than typing it, and the bar is where the user already talks to Cuisko. | A photo feed or a place to post. The photo is input to the assistant, nothing else. |
| **One weekly planning reminder** | The week starts on planning day; a nudge at that moment protects the hero moment. | A daily-engagement lever. One reminder a week, on the planning beat, easy to turn off. |
| **Favorites in the planning pool** | A recipe the household loves should be able to come back in a planned week. | A way to plan somebody else's private recipes. The requirements for the hookup are already recorded. |
| **Sign in with Apple** | The App Store requires it (guideline 4.8) once Google sign-in is offered. The button is on the sign-in page today, disabled. | A reason to ask for more than the name and email the other sign-ins already give. |
| **Replace the photo in the recipe editor** | A cook's own recipe should look like their dish. Today the editor displays the image but cannot change it. | — |

Further out, and still real product: an assistant that performs the changes it is asked for instead
of pointing to them, recipes invented on demand for the stock at hand, and the community side of
the catalogue (fed by what people actually cook).

---

## The test

When you are unsure whether something belongs in Cuisko, ask in this order:

1. Does it help someone **cook what they already own**?
2. Does it **remove work** rather than add it?
3. Would it survive a tired user on a Tuesday evening?
4. Does it treat the user as **capable and unjudged**?

A feature that fails the first two is not a Cuisko feature, however good it is.
