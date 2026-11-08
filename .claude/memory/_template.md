---
summary: Dates as timestamps, session renewal, upload limit.
status: stable
last_verified: 2026-11-08
---

# API authentication

## Facts

- The Convex API refuses ISO dates: it needs timestamps in milliseconds. (source: 2026-11-02)
- The client renews the session through refreshSession before every long call. (source: 2026-10-28)
- The upload limit is 10 MB. (source: correction of 2026-11-08)
- Hypothesis: keep the token in SecureStore rather than in memory; tried then dropped, because the read slowed every call at startup. (source: 2026-10-30)

## Links

- [Test conventions](test-conventions.md)
- See `docs/ARCHITECTURE.md`, section Authentication
