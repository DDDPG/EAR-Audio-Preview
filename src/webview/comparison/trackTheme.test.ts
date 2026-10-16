import { comparisonColors, themeVariants } from "./trackTheme";

test("palette has four distinct categorical colors from the plan", () => {
  expect(comparisonColors).toEqual([
    "#5cc248",
    "#00b4d8",
    "#ff9800",
    "#c77dff",
  ]);
  expect(new Set(comparisonColors).size).toBe(4);
});

test("themeVariants keep one hue family with distinct feature shades", () => {
  const v = themeVariants("#5cc248");
  expect(v.base).toBe("#5cc248");
  const shades = [v.lufsM, v.lufsS, v.lufsI, v.truePeak, v.f0, v.onset];
  expect(new Set(shades).size).toBe(6);
  for (const shade of shades) {
    expect(shade).toMatch(/^#[0-9a-f]{6}$/i);
    expect(shade.toLowerCase()).not.toBe("#5cc248");
  }
});
