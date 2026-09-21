/**
 * `pnpm catalog:import` — one batch of well-reviewed recipes into the catalog.
 *
 * Asks the agent for dishes cuisine by cuisine until the ledger holds a batch of accepted recipes
 * not yet imported on this deployment, then imports them one at a time. The ledger is written after
 * every search and every recipe, so an interruption loses nothing and a re-run picks up the rest.
 *
 * Marmiton first. BBC Good Food is looked up for a dish Marmiton has no reviewed recipe of, and for
 * the vegan version the agent named for it (`veganEn`), which Marmiton almost never has.
 *
 * The batch size is the spend cap: each import is a model call, then images and translation.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { internal } from "@convex/_generated/api";

import { candidatesFor, classifyPages, parseRecipePage, recipeSitemapsOf, recipeUrlsOf } from "./_lib/bbcGoodFood";
import { connectAdmin } from "./_lib/convexAdmin";
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
const BATCH_SIZE = 20;
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

const _messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const main = async () => {
  const admin = connectAdmin();
  const ledger = readLedger(LEDGER_FILE);
  const now = () => new Date().toISOString();
  const run = { searched: 0, accepted: 0, rejected: 0, errored: 0, imported: 0, failed: 0 };

  const record = (search: Omit<DishSearch, "searchedAt">, cards: SearchedCard[]) => {
    recordSearch(ledger, { ...search, searchedAt: now() }, cards);
    writeLedger(LEDGER_FILE, ledger);
    run.searched++;
    run.accepted += cards.filter((card) => card.verdict === "accepted").length;
    run.rejected += cards.filter((card) => card.verdict === "rejected").length;
    console.log(`  ${search.cuisine} · ${search.source} · ${search.dish}: ${_acceptedTitleOf(cards) ?? "nothing"}`);
  };

  console.log(`Importing into ${admin.deployment}, ${pendingFor(ledger, admin.deployment).length} pending.`);

  for (let asks = 0; asks < MAX_ASKS && pendingFor(ledger, admin.deployment).length < BATCH_SIZE; asks++) {
    const cuisine = nextCuisine(ledger);
    // Written now, not with the first search: an ask that finds nothing new would otherwise leave
    // the cursor where it was, and the next run would ask this cuisine again.
    writeLedger(LEDGER_FILE, ledger);
    const dishes = await admin.action(internal.router.recipes.suggestDishes._internal, {
      cuisine,
      count: DISHES_PER_ASK,
      avoid: avoidFor(ledger, cuisine),
    });

    // The agent is told to avoid these, and does not always listen.
    for (const { name, nameEn, veganEn, diet } of dishes.filter(({ name }) => !ledger.dishes[dishKeyOf(name)])) {
      const dish = { dish: name, cuisine, nameEn, diet };

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
        console.log(`  ${cuisine} · ${name}: ${_messageOf(error)}`);
      }
    }
  }

  for (const url of pendingFor(ledger, admin.deployment).slice(0, BATCH_SIZE)) {
    const { source, title } = ledger.recipes[url]!;
    try {
      const recipeId = await admin.action(internal.router.recipes.importOne._internal, {
        url,
        locale: source === "bbcgoodfood" ? "en" : "fr",
      });
      recordImport(ledger, url, { deployment: admin.deployment, recipeId, at: now() });
      run.imported++;
      console.log(`  imported ${title}`);
    } catch (error) {
      recordFailure(ledger, url, _messageOf(error));
      run.failed++;
      console.log(`  failed ${url}: ${_messageOf(error)}`);
    }
    writeLedger(LEDGER_FILE, ledger);
  }

  const coverage = coverageOf(ledger);
  console.log(
    `\n${run.imported} imported · ${run.failed} failed · ` +
      `${pendingFor(ledger, admin.deployment).length} accepted but pending · ` +
      `${run.searched} searches, ${run.accepted} accepted, ${run.rejected} recipes rejected, ` +
      `${run.errored} dishes errored\n` +
      `Coverage: ${coverage.cuisines}/${coverage.ofCuisines} cuisines · ` +
      `${coverage.vegan}/${coverage.dishes} dishes meant as vegan`,
  );
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
