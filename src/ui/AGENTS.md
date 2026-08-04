# Design system — isolated

This folder must not know the backend exists.

NEVER import: `convex`, `~/lib/convex/*`, `~/modules/*`, `~/providers/*`, `translations`, `~/hooks/*`.
ALLOWED: `react`, `react-native`, `@ui/*`, `theme`, and presentation libraries.

Props are STRUCTURAL types, never `Doc<'x'>` or `Id<'x'>`:

    type Props = { id: string; title: string; minutes: number; onPress?: () => void }

Declaring the shape you need — rather than importing the backend's type — is what keeps this
boundary free to obey. The module layer adapts documents to these props.

Files kebab-case. `components/` is product-agnostic; `cards/` may be domain-shaped but stays pure.