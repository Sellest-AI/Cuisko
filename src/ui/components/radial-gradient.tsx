import React, { useId } from "react";
import { View, ViewStyle } from "react-native";
import Svg, { Circle, RadialGradient as RadialGradientSvg, Stop } from "react-native-svg";

type Props = {
  size: number;
  style?: ViewStyle | (ViewStyle | undefined | false)[];
  colors: string[];
}

export const RadialGradient = ({ size, style, colors }: Props) => {
  /**
   * Gradient ids share one namespace per document, so two of these on a page would both resolve
   * `url(#…)` to whichever rendered first — the second gradient silently drawn in the first's
   * colours. `useId` is unique per instance and stable across renders; everything but its
   * alphanumerics is stripped because React 19 spells it `«r0»` and an XML id may hold neither
   * guillemets nor the colons React 18 used.
   */
  const instanceId = useId();
  const gradientId = `radial-gradient-${instanceId.replace(/[^a-zA-Z0-9]/g, "")}`;

  /** A single colour has no span to spread across, and `length - 1` would divide its one stop by
   *  zero into `NaN%`. Dividing by 1 puts that stop at 0%, which fills the circle with it. */
  const lastStop = Math.max(colors.length - 1, 1);

  return (
    <View style={style}>
      <Svg height={size} width={size} >
        {/* Define the radial gradient */}
        <RadialGradientSvg
          id={gradientId}
          cx="50%"  // x-coordinate of the center
          cy="50%"  // y-coordinate of the center
          rx="50%"  // radius in x-direction
          ry="50%"  // radius in y-direction
          gradientUnits="userSpaceOnUse"
        >
          {colors.map((color, index) => (
            <Stop
              key={index}
              offset={`${(index / lastStop) * 100}%`}
              stopColor={color}
            />
          ))}
        </RadialGradientSvg>

        {/* Apply the gradient to a shape (e.g., a circle) */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2}
          fill={`url(#${gradientId})`}
        />
      </Svg>
    </View>
  );
};
