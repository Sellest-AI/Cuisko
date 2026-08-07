# Design system — isolated

This folder must not know the backend exists.

NEVER import: `convex`, `~/lib/convex/*`, `~/modules/*`, `~/providers/*`, `translations`, `~/hooks/*`.
ALLOWED: `react`, `react-native`, `@ui/*`, `@ui/utils`, `@ui/hooks/*`, `theme`, and presentation libraries.

Props are STRUCTURAL types, never `Doc<'x'>` or `Id<'x'>`:

    type Props = { id: string; title: string; minutes: number; onPress?: () => void }

Declaring the shape you need — rather than importing the backend's type — is what keeps this
boundary free to obey. The module layer adapts documents to these props.

Files kebab-case. `components/` at its root is product-agnostic. Its subfolders group by the shape
they draw — `cards/`, `carousels/` — and those may be domain-shaped, but stay pure. A plate carousel
is not a card. `@ui/*` reaches all of them, so `@ui/cards/recipe` needs no new alias.
