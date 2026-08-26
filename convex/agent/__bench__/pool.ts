/**
 * Every item run through `work`, at most `limit` at a time, results in input order.
 *
 * Hand-rolled because it is a dozen lines and the alternative is a dependency in a folder that
 * exists to answer one question. Order is preserved by index rather than by completion, so a slow
 * entrant does not shuffle the table.
 *
 * `onDone` fires as each item lands rather than at the end — that callback is the whole reason
 * the progress lines appear during the run instead of after it.
 */
export const pool = async <T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
  onDone: (result: R, completed: number, total: number) => void,
) => {
  const results = new Array<R>(items.length);
  let next = 0;
  let completed = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      const result = await work(items[index]!);

      results[index] = result;
      onDone(result, ++completed, items.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
};
