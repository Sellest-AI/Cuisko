/**
 * `pnpm catalog:import` — one batch of well-reviewed recipes into the catalog.
 *
 * Asks the agent for dishes cuisine by cuisine until the ledger holds `LIMIT_SIZE` accepted recipes
 * not yet imported on this deployment, then imports them `BATCH_SIZE` at a time. The ledger is
 * written after every search and every recipe, so an interruption loses nothing and a re-run picks
 * up the rest.
 *
 * Marmiton first. BBC Good Food is looked up for a dish Marmiton has no reviewed recipe of, and for
 * the vegan version the agent named for it (`veganEn`), which Marmiton almost never has.
 *
 * The limit is the spend cap: each import is a model call, then images and translation. The batch
 * is how many of those run at once, bounded by what the deployment tolerates in parallel.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { internal } from "@convex/_generated/api";

import { candidatesFor, classifyPages, parseRecipePage, recipeSitemapsOf, recipeUrlsOf } from "./_lib/bbcGoodFood";
import { connectAdmin } from "../_lib/convexAdmin";
import {
  ASKED_CUISINES,
  avoidFor,
  coverageOf,
  type DishSearch,
  dishKeyOf,
  type Ledger,
  nextCuisine,
  pendingFor,
  readLedger,
  recordFailure,
  recordImport,
  recordSearch,
  type SearchedCard,
  writeLedger,
} from "./_lib/ledger";
import { classifyCards, parseSearchResults } from "./_lib/marmiton";

const LEDGER_FILE = path.join(__dirname, "catalog.ledger.json");
/** Recipes imported per run, at most. */
const LIMIT_SIZE = 20;
/** Imports running at the same time. */
const BATCH_SIZE = 10;
const DISHES_PER_ASK = 6;
/** Between two requests to a recipe site: one page at a time, never a burst. */
const REQUEST_GAP_MS = 1000;
/** Two laps of the cuisines without filling a batch means the agent has run dry, not the run. */
const MAX_ASKS = 2 * ASKED_CUISINES.length;
/** BBC Good Food pages fetched per lookup, at most. Each one is a request. */
const BBC_CANDIDATES = 5;
/** The BBC Good Food recipe URLs, read from about 75 sitemaps, kept for the day. */
const BBC_URLS_CACHE = path.join(tmpdir(), `cuisko-bbcgoodfood-recipes-${new Date().toISOString().slice(0, 10)}.json`);

const _get = async (url: string): Promise<string> => {
  await sleep(REQUEST_GAP_MS);

  const response = await fetch(url, { headers: { "User-Agent": "cuisko-catalog-import" } });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status} for ${url}`);

  return response.text();
};

// `aqt` alone: robots.txt disallows any `aqt=*page*`, so the run never paginates.
const _searchMarmiton = async (dish: string): Promise<SearchedCard[]> =>
  classifyCards(
    parseSearchResults(await _get(`https://www.marmiton.org/recettes/recherche.aspx?aqt=${encodeURIComponent(dish)}`)),
    dish,
  );

let _bbcUrls: string[] | undefined;

/** Every free BBC Good Food recipe URL, from the sitemaps: never the site's search (robots.txt). */
const _bbcRecipeUrls = async (): Promise<string[]> => {
  if (_bbcUrls) return _bbcUrls;
  if (existsSync(BBC_URLS_CACHE)) return (_bbcUrls = JSON.parse(readFileSync(BBC_URLS_CACHE, "utf8")) as string[]);

  console.log("  reading BBC Good Food's sitemaps, once for the day…");
  const urls: string[] = [];
  for (const sitemap of recipeSitemapsOf(await _get("https://www.bbcgoodfood.com/sitemap.xml"))) {
    urls.push(...recipeUrlsOf(await _get(sitemap)));
  }
  writeFileSync(BBC_URLS_CACHE, JSON.stringify(urls));

  return (_bbcUrls = urls);
};

/**
 * BBC Good Food pages for `dishEn`, fetched and judged. Pages the ledger already holds are not
 * fetched again. A vegan lookup keeps only pages the site itself marks vegan.
 */
const _lookUpBbc = async (ledger: Ledger, dishEn: string, { vegan }: { vegan: boolean }): Promise<SearchedCard[]> => {
  const unseen = (await _bbcRecipeUrls()).filter((url) => !ledger.recipes[url]);
  const candidates = candidatesFor(unseen, dishEn, BBC_CANDIDATES);

  const pages = [];
  for (const url of candidates) pages.push(parseRecipePage(await _get(url), url));

  return classifyPages(vegan ? pages.filter((page) => page.diet === "vegan") : pages, dishEn);
};

const _acceptedTitleOf = (cards: readonly SearchedCard[]) =>
  cards.find((card) => card.verdict === "accepted")?.title;

const _messageOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);

  // `ConvexHttpClient` throws the response body as the message, and a gateway timeout has none.
  return message.trim() || "the deployment answered with an error and no message (a timeout, usually)";
};

/** "1m 23s", for a wait the user is watching. */
const _elapsed = (since: number): string => {
  const seconds = Math.round((Date.now() - since) / 1000);

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const _log = (message: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

const main = async () => {
  const started = Date.now();
  const admin = connectAdmin();
  const ledger = readLedger(LEDGER_FILE);
  const now = () => new Date().toISOString();
  const run = { asks: 0, searched: 0, accepted: 0, rejected: 0, errored: 0, imported: 0, failed: 0 };
  const pending = () => pendingFor(ledger, admin.deployment);

  const record = (search: Omit<DishSearch, "searchedAt">, cards: SearchedCard[]) => {
    recordSearch(ledger, { ...search, searchedAt: now() }, cards);
    writeLedger(LEDGER_FILE, ledger);
    run.searched++;
    run.accepted += cards.filter((card) => card.verdict === "accepted").length;
    run.rejected += cards.filter((card) => card.verdict === "rejected").length;
    _log(
      `    ${search.source} · ${search.dish}: ${_acceptedTitleOf(cards) ?? "nothing"}` +
        ` (${cards.length} found, ${cards.filter((card) => card.verdict === "rejected").length} rejected)`,
    );
  };

  _log(
    `Importing into ${admin.deployment}: ${pending().length} pending, ${LIMIT_SIZE} per run, ${BATCH_SIZE} at a time.`,
  );

  for (let asks = 0; asks < MAX_ASKS && pending().length < LIMIT_SIZE; asks++) {
    const cuisine = nextCuisine(ledger);
    // Written now, not with the first search: an ask that finds nothing new would otherwise leave
    // the cursor where it was, and the next run would ask this cuisine again.
    writeLedger(LEDGER_FILE, ledger);
    run.asks++;
    _log(
      `Ask ${asks + 1}/${MAX_ASKS} · ${cuisine}: ${pending().length}/${LIMIT_SIZE} pending, ` +
        `asking for ${DISHES_PER_ASK} dishes…`,
    );

    const asked = Date.now();
    const dishes = await admin.action(internal.router.recipes.suggestDishes._internal, {
      cuisine,
      count: DISHES_PER_ASK,
      avoid: avoidFor(ledger, cuisine),
    });
    // The agent is told to avoid these, and does not always listen.
    const fresh = dishes.filter(({ name }) => !ledger.dishes[dishKeyOf(name)]);
    _log(
      `  ${cuisine}: ${dishes.length} dishes in ${_elapsed(asked)}, ${fresh.length} new: ` +
        (fresh.map(({ name }) => name).join(", ") || "none"),
    );

    for (const [index, { name, nameEn, veganEn, diet }] of fresh.entries()) {
      const dish = { dish: name, cuisine, nameEn, diet };
      _log(`  [${index + 1}/${fresh.length}] ${name} (${nameEn})${veganEn ? ` · vegan: ${veganEn}` : ""}`);

      // One dish's failure is one dish lost, never the run: a page a sitemap still lists can be
      // gone, and the recipes already accepted are still to import below.
      try {
        const marmiton = await _searchMarmiton(name);
        record({ ...dish, source: "marmiton" }, marmiton);

        if (!_acceptedTitleOf(marmiton)) {
          record({ ...dish, source: "bbcgoodfood" }, await _lookUpBbc(ledger, nameEn, { vegan: false }));
        }

        // Only when the agent named one: a vegan beef bourguignon is not a dish, a mushroom one is.
        if (veganEn && !ledger.dishes[dishKeyOf(veganEn)]) {
          record(
            { dish: veganEn, versionOf: dishKeyOf(name), cuisine, source: "bbcgoodfood" },
            await _lookUpBbc(ledger, veganEn, { vegan: true }),
          );
        }
      } catch (error) {
        run.errored++;
        _log(`    ${name}: ${_messageOf(error)}`);
      }
    }
  }

  const urls = pending().slice(0, LIMIT_SIZE);
  _log(`Searching done in ${_elapsed(started)}: ${pending().length} pending, importing ${urls.length}.`);

  const importOne = async (url: string, position: number) => {
    const { source, title } = ledger.recipes[url]!;
    const label = `[${position}/${urls.length}] ${title}`;
    const began = Date.now();
    _log(`  ${label}: importing from ${source}…`);
    try {
      const recipeId = await admin.action(internal.router.recipes.importOne._internal, {
        url,
        locale: source === "bbcgoodfood" ? "en" : "fr",
      });
      recordImport(ledger, url, { deployment: admin.deployment, recipeId, at: now() });
      run.imported++;
      _log(`  ${label}: imported as ${recipeId} in ${_elapsed(began)}`);
    } catch (error) {
      recordFailure(ledger, url, _messageOf(error));
      run.failed++;
      _log(`  ${label}: failed after ${_elapsed(began)}: ${_messageOf(error)}`);
    }
    // Written as each one settles, not once per batch: an interruption keeps every result so far.
    writeLedger(LEDGER_FILE, ledger);
  };

  const batches = Math.ceil(urls.length / BATCH_SIZE);
  for (let offset = 0; offset < urls.length; offset += BATCH_SIZE) {
    const batch = urls.slice(offset, offset + BATCH_SIZE);
    const began = Date.now();
    _log(`Batch ${offset / BATCH_SIZE + 1}/${batches}: ${batch.length} imports at once.`);
    await Promise.all(batch.map((url, index) => importOne(url, offset + index + 1)));
    _log(`Batch done in ${_elapsed(began)}: ${run.imported} imported, ${run.failed} failed so far.`);
  }

  const coverage = coverageOf(ledger);
  console.log(
    `\nDone in ${_elapsed(started)}: ${run.imported} imported · ${run.failed} failed · ` +
      `${pending().length} accepted but pending · ` +
      `${run.asks} asks, ${run.searched} searches, ${run.accepted} accepted, ${run.rejected} recipes rejected, ` +
      `${run.errored} dishes errored\n` +
      `Coverage: ${coverage.cuisines}/${coverage.ofCuisines} cuisines · ` +
      `${coverage.vegan}/${coverage.dishes} dishes meant as vegan`,
  );
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
