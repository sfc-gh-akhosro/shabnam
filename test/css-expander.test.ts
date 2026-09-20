import { describe, expect, test } from "bun:test";
import { expandCss } from "../src/style/css-expander.ts";

describe("CSS expander composition", () => {
  test("expands @apply with a class definition", () => {
    const input = `
.paper {
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.node {
  @apply .paper;
  border-radius: 6px;
}
`;
    const output = expandCss(input);
    expect(output).toContain("background: white;");
    expect(output).toContain("box-shadow: 0 1px 3px rgba(0,0,0,0.1);");
    expect(output).toContain("border-radius: 6px;");
    expect(output).not.toContain("@apply");
  });

  test("expands @apply with multiple classes", () => {
    const input = `
.glass {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
}
.raised {
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.graph {
  @apply .glass .raised;
  border-radius: 8px;
}
`;
    const output = expandCss(input);
    expect(output).toContain("background: rgba(255, 255, 255, 0.1);");
    expect(output).toContain("backdrop-filter: blur(8px);");
    expect(output).toContain("box-shadow: 0 4px 12px rgba(0,0,0,0.15);");
    expect(output).toContain("border-radius: 8px;");
    expect(output).not.toContain("@apply");
  });

  test("expands @mixin and @include", () => {
    const input = `
@mixin glow {
  box-shadow: 0 0 10px #2563eb;
}

.highlight {
  @include glow;
  color: #2563eb;
}
`;
    const output = expandCss(input);
    expect(output).toContain("box-shadow: 0 0 10px #2563eb;");
    expect(output).toContain("color: #2563eb;");
    expect(output).not.toContain("@mixin");
    expect(output).not.toContain("@include");
  });

  test("expands @apply in user style using definitions from theme CSS context", () => {
    const themeCss = `
.glass {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(12px);
}
.warning {
  border-left: 4px solid #ef4444;
}
`;
    const userStyleCss = `
.cluster_core_pipeline {
  @apply .glass;
}
.node.critical {
  @apply .warning;
  font-weight: bold;
}
`;
    const output = expandCss(userStyleCss, themeCss);
    expect(output).toContain("background: rgba(255, 255, 255, 0.2);");
    expect(output).toContain("backdrop-filter: blur(12px);");
    expect(output).toContain("border-left: 4px solid #ef4444;");
    expect(output).toContain("font-weight: bold;");
    expect(output).not.toContain("@apply");
  });
});
