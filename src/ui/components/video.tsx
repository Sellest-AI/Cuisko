import { VideoView, useVideoPlayer, type VideoContentFit, type VideoSource } from "expo-video";
import { type StyleProp, type ViewStyle } from "react-native";

/**
 * A looping, silent, chrome-free video — the moving equivalent of `@ui/image`.
 *
 * Every default here says "this is artwork, not media": it loops, it is muted, it starts itself,
 * and it draws no controls. A video the user is meant to *watch* wants the opposite of all four,
 * so it should not reach for this component — it should build a player of its own.
 *
 * `surfaceType="textureView"` on Android because a `SurfaceView` punches a hole through the view
 * hierarchy and composites below it, which loses both transparency and anything drawn underneath.
 * A cut-out mascot over a page background is exactly the case the ExoPlayer docs name as the
 * reason `textureView` exists. It costs power and performance, so it is worth it for a short
 * decorative loop and not much else.
 */

type Props = {
  source: VideoSource;
  contentFit?: VideoContentFit;
  style?: StyleProp<ViewStyle>;
};

export const Video = ({ source, contentFit = "contain", style }: Props) => {
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      surfaceType="textureView"
      nativeControls={false}
      /** Decoration: it is never the thing a user came to the screen to operate. */
      allowsPictureInPicture={false}
    />
  );
};
