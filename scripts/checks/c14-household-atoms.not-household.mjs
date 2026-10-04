/** The answers C14 reads — kept apart so its tests can build a tree that satisfies them. */

/**
 * The atoms that are deliberately NOT reset on a household switch, keyed `file:name`, each with the
 * reason. Adding one is the decision this check exists to force, so the reason has to say why the
 * value is not about a kitchen — "it is UI" is a reason, "it was here already" is not.
 */
export const NOT_HOUSEHOLD = {
  "src/lib/convex/auth.ts:authenticatingAtom":
    "whether a sign-in is in flight: about the session, before any household is known",
  "src/lib/convex/client.ts:cachedAtom":
    "action results keyed by their arguments, which already carry any householdId they depend on",
  "src/modules/assistant/_hooks/atoms.ts:conversationAtom":
    "the cook's own conversation with Cuisko; every cellar change inside it names its household",
  "src/modules/assistant/_hooks/atoms.ts:pendingQuestionAtom":
    "a question in flight in that conversation",
  "src/modules/assistant/_hooks/atoms.ts:refusalAtom":
    "a question the server declined for the cook's own allowance, which is per user and not per household",
  "src/modules/assistant/_hooks/atoms.ts:isAnsweringAtom":
    "whether Cuisko is mid-turn in that conversation, mirrored from the assistant screen and put down when it unmounts",
  "src/modules/assistant/_hooks/atoms.ts:undoneChangesAtom":
    "which of Cuisko's cellar changes and planned plates were undone; it must outlive a switch as the conversation does, " +
    "or the undo is offered again, and each change names its own household",
  "src/modules/groceries/_hooks/atoms.ts:sortAtom":
    "a way of looking at the list, not a fact about the kitchen",
  "src/modules/navigation/_hooks/useNavigationBar.ts:modeAtom": "the bar's own mode: UI chrome",
  "src/modules/navigation/_hooks/useNavigationBar.ts:refsAtom": "the bar's input refs: UI chrome",
  "src/modules/navigation/_hooks/useStagedPhoto.ts:uploadBase64Atom":
    "the staged photo shrunk for sending: the same one-question photo, not a fact about a kitchen",
  "src/modules/navigation/_hooks/useStagedPhoto.ts:stagedPhotoAtom":
    "the photo taken for the next question, a local file the cook is about to ask about: it belongs to that one question, not to a kitchen",
  "src/modules/navigation/modal-action.tsx:modalActionAtom": "the open sheet's header action: UI chrome",
  "src/modules/navigation/modal-sheet/state.ts:sheetSizeAtom": "the open sheet's measured size: UI chrome",
  "src/modules/onboarding/_hooks/atoms.ts:doneStepsAtom":
    "which onboarding steps were done on fake data; the onboarding reads and writes no household",
  "src/modules/onboarding/_hooks/atoms.ts:pantryAtom":
    "the onboarding's pretend kitchen, on fixtures; never a household's cellar and never written",
  "src/modules/recipes/_hooks/atoms.ts:importedDraftAtom":
    "a recipe being imported belongs to the cook, and recipes are not household-scoped (ADR 0014)",
  "src/modules/recipes/_hooks/atoms.ts:servingsAtom": "the servings picked on the recipe on screen",
  "src/modules/recipes/_hooks/atoms.ts:importsInFlightAtom":
    "video imports this app is waiting on; an imported recipe belongs to the cook, and recipes are not household-scoped (ADR 0014)",
  "src/modules/recipes/_hooks/atoms.ts:verificationsAtom":
    "an admin's checks of recipes against their source pages; recipes are not household-scoped (ADR 0014)",
};
