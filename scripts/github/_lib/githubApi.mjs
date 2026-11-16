/**
 * One request to GitHub's REST API, with the headers GitHub asks for. Every script under
 * scripts/github/ calls it, so a header or the API version changes in one place.
 */

const API = "https://api.github.com";

/** A reply outside 2xx. `status` lets a caller treat a 404 as an answer ("no such issue"). */
export class GitHubApiError extends Error {
  constructor(message, { status }) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

/**
 * @param {string} route the path after the API host, `/repos/owner/name/labels`
 * @param {{ token: string, what: string, method?: string, body?: unknown, fetch?: typeof fetch }} options
 *   `token` is an installation token or the App's JWT; `what` names the request in the error
 * @returns {Promise<any>} the parsed JSON, or null for a 204
 */
export const githubRequest = async (route, { token, what, method = "GET", body, fetch: fetchImpl = fetch }) => {
  const response = await fetchImpl(`${API}${route}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "cuisko-scripts",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new GitHubApiError(`${what}: GitHub answered ${response.status}${text ? ` (${text.slice(0, 200)})` : ""}`, { status: response.status });
  }
  return response.status === 204 ? null : response.json();
};
