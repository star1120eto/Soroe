import Svg, { Path } from 'react-native-svg';

import { isPhIconName, PH_ICON_VIEWBOX_SIZE, phIconPaths, type PhIconName } from './ph-icon-paths';

export { isPhIconName };
export type { PhIconName };

// Matches docs/DesignSystem.pdf 05 (24pxグリッド／ストローク相当1.5-1.75px).
const DEFAULT_ICON_SIZE = 24;

type IconProps = {
  name: PhIconName;
  color: string;
  size?: number;
};

export function Icon({ name, color, size = DEFAULT_ICON_SIZE }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${PH_ICON_VIEWBOX_SIZE} ${PH_ICON_VIEWBOX_SIZE}`}>
      {phIconPaths[name].map((d) => (
        <Path key={d} d={d} fill={color} />
      ))}
    </Svg>
  );
}
