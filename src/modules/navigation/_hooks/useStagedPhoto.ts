import { atom, useAtom } from "jotai";

import { compressToBase64 } from "~/lib/image/compressToBase64";

/**
 * The photo taken for the next question, as a local file URI — `undefined` while there is none.
 *
 * An atom rather than state in the bar: the camera that takes it, the field that swaps its icon
 * for a trash and the thumbnail that rises behind the bar are three components that never see each
 * other, and a send later reads it from a fourth.
 */
const stagedPhotoAtom = atom<string | undefined>(undefined);

/** The staged photo shrunk for sending, as base64 — `undefined` until compression ends, and after a discard. */
const uploadBase64Atom = atom<string | undefined>(undefined);

/**
 * The compression running now, which a send pressed before it ends awaits. A module variable for
 * the reason `_inFlight` in `useAskCuisko` is one: it must be readable in the same tick a send
 * starts, which an atom's settled value is not.
 */
let _pendingUploadBase64: Promise<string | undefined> = Promise.resolve(undefined);

/** Which staging a result belongs to: a photo discarded or replaced meanwhile must not be brought back by a slow result. */
let _generation = 0;

/**
 * The photo for the next question, shrunk the moment it is staged.
 *
 * **Compression starts in `stage`, not in an effect.** The hook is mounted by the camera, the bar,
 * its field and the send, so an effect would compress once per mounted copy. `stage` is called
 * once.
 *
 * **It starts at capture rather than at send** because shrinking a 12 MP photo takes a moment and
 * the cook spends longer than that typing: by send, `uploadBase64` is already there. A send
 * pressed early awaits `uploadBase64Ready()` for what is left.
 *
 * A photo that cannot be compressed is dropped: the thumbnail vanishing is the signal, and sending
 * the full-size original is what this exists to avoid.
 */
export const useStagedPhoto = () => {
  const [photo, setPhoto] = useAtom(stagedPhotoAtom);
  const [uploadBase64, setUploadBase64] = useAtom(uploadBase64Atom);

  const stage = (uri: string) => {
    const generation = ++_generation;
    setPhoto(uri);
    setUploadBase64(undefined);

    _pendingUploadBase64 = compressToBase64(uri)
      .then((base64) => {
        if (generation === _generation) setUploadBase64(base64);

        return base64;
      })
      .catch((error: unknown) => {
        console.error("The photo could not be compressed", error);
        if (generation === _generation) setPhoto(undefined);

        return undefined;
      });
  };

  const discard = () => {
    _generation++;
    _pendingUploadBase64 = Promise.resolve(undefined);
    setPhoto(undefined);
    setUploadBase64(undefined);
  };

  /**
   * Unstages the photo for a send: it leaves the bar at once, and compression carries on.
   *
   * **Not `discard`, which cancels.** A send must clear the bar the moment it starts, but it still
   * needs the base64 that is being made, so only the staged state is cleared and the running work
   * is kept. The generation moves on so that a result landing later does not paint the photo back
   * into the bar. `undefined` when nothing is staged.
   */
  const unstage = () => {
    if (photo === undefined) return undefined;

    _generation++;
    setPhoto(undefined);
    setUploadBase64(undefined);

    return { uri: photo, base64: _pendingUploadBase64 };
  };

  /** Puts an unstaged photo back in the bar, with its base64 so it is not compressed again — for a send that failed. */
  const restore = (uri: string, base64: string) => {
    _generation++;
    _pendingUploadBase64 = Promise.resolve(base64);
    setPhoto(uri);
    setUploadBase64(base64);
  };

  return {
    photo,
    uploadBase64,
    /** A photo is staged and its upload copy is not ready yet. */
    isCompressing: photo !== undefined && uploadBase64 === undefined,
    stage,
    discard,
    unstage,
    restore,
    /** The upload base64 once it is ready — already resolved when it is. `undefined` if there is no photo or it failed. */
    uploadBase64Ready: () => _pendingUploadBase64,
  };
};
