import { render, screen } from "@testing-library/react";
import { forwardRef } from "react";
import { describe, expect, it } from "vitest";

import { Badge } from "../badge";
import type { IconComponent } from "../icons";
import { theme } from "theme";

/**
 * A stand-in for a lucide icon, carrying the `forwardRef` shape `IconComponent` requires — so the
 * test proves what the real prop type admits, rather than what a cast would let through.
 */
const StubIcon = forwardRef<SVGSVGElement, { color?: string }>(function StubIcon({ color }, ref) {
  return <svg ref={ref} data-testid="icon" color={color} />;
}) as unknown as IconComponent;

/**
 * `Badge` picks a text colour from its variant, and lets a call site override it. That override
 * exists because the variant is chosen against a ground the badge does not always sit on — so the
 * two paths through `foreground` are the whole component, and neither is visible to typecheck.
 */
describe("Badge", () => {
  it("writes in the colour its variant declares", () => {
    render(<Badge variant="success">Ready</Badge>);

    expect(screen.getByText("Ready")).toHaveStyle({ color: theme.colors.success.base });
  });

  it("lets textColor beat the variant, for a badge on a ground the variant was not picked against", () => {
    render(
      <Badge variant="success" textColor="rgb(255, 0, 0)">
        Ready
      </Badge>,
    );

    expect(screen.getByText("Ready")).toHaveStyle({ color: "rgb(255, 0, 0)" });
  });

  it("renders without an icon when none is given", () => {
    const { container } = render(<Badge>Plain</Badge>);

    expect(container.querySelector("svg")).toBeNull();
  });

  it("hands the icon the same colour as the label", () => {
    render(
      <Badge icon={StubIcon} textColor="rgb(0, 0, 255)">
        Withicon
      </Badge>,
    );

    expect(screen.getByTestId("icon")).toHaveAttribute("color", "rgb(0, 0, 255)");
  });
});
