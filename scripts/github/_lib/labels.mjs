/**
 * The repository's labels are code: `.github/labels.json` says what exists, and `labelPlan` says
 * what GitHub must change to match it. Every live label the file does not name is removed, which is
 * how GitHub's defaults (`enhancement`, `wontfix`…) go.
 *
 * A label is `{ name, color, description }`, the shape GitHub's REST API uses (colour without `#`).
 * Names compare case-insensitively, as GitHub does: `Bug` and `bug` are one label.
 */

/** @typedef {{ name: string, color: string, description: string }} Label */

const _key = (name) => name.toLowerCase();

/** Only the three fields GitHub stores: the file's `group` never reaches the API. */
const _label = ({ name, color, description }) => ({ name, color: color.toLowerCase(), description: description ?? "" });

/**
 * What to create, update and remove so that `live` becomes `wanted`.
 *
 * @param {Label[]} wanted the labels the file declares
 * @param {Label[]} live the labels GitHub has now
 * @returns {{ create: Label[], update: (Label & { from: string })[], remove: Label[] }} `from` is
 *   the live name, which the PATCH addresses when only the case changes
 */
export const labelPlan = (wanted, live) => {
  const liveByKey = new Map(live.map((label) => [_key(label.name), _label(label)]));
  const wantedKeys = new Set(wanted.map((label) => _key(label.name)));

  const create = [];
  const update = [];
  for (const label of wanted.map(_label)) {
    const current = liveByKey.get(_key(label.name));
    if (current === undefined) create.push(label);
    else if (current.name !== label.name || current.color !== label.color || current.description !== label.description) {
      update.push({ ...label, from: current.name });
    }
  }
  const remove = [...liveByKey.values()].filter((label) => !wantedKeys.has(_key(label.name)));
  return { create, update, remove };
};
