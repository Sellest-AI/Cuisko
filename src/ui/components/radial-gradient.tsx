import React from "react";
import { View, ViewStyle } from "react-native";
import Svg, { Circle, RadialGradient as RadialGradientSvg, Stop } from "react-native-svg";

type Props = {
  size: number;
  style?: ViewStyle | (ViewStyle | undefined | false)[];
  colors: string[];
}

export const RadialGradient = ({ size, style, colors }: Props) => {
  return (
    <View style={style}>
      <Svg height={size} width={size} >
        {/* Define the radial gradient */}
        <RadialGradientSvg
          id="radialGradient"
          cx="50%"  // x-coordinate of the center
          cy="50%"  // y-coordinate of the center
          rx="50%"  // radius in x-direction
          ry="50%"  // radius in y-direction
          gradientUnits="userSpaceOnUse"
        >
          {colors.map((color, index) => (
            <Stop
              key={index}
              offset={`${(index / (colors.length - 1)) * 100}%`}
              stopColor={color}
            />
          ))}
        </RadialGradientSvg>

        {/* Apply the gradient to a shape (e.g., a circle) */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2}
          fill="url(#radialGradient)"
        />
      </Svg>
    </View>
  );
};
