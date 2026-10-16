import { ContextMenu } from "./contextMenu";
afterEach(() => {
  document.body.innerHTML = "";
});
test("radio selection, keyboard navigation and outside dismissal", () => {
  const menu = new ContextMenu(),
    selected = jest.fn();
  menu.open(new MouseEvent("contextmenu", { clientX: 100, clientY: 100 }), [
    { label: "Automatic", checked: true, action: selected },
    { label: "Row", checked: false, action: selected },
  ]);
  expect(
    document.querySelector('[aria-checked="true"]')?.textContent,
  ).toContain("Automatic");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
  expect(document.activeElement?.textContent).toContain("Row");
  (document.activeElement as HTMLButtonElement).click();
  expect(selected).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  menu.open(new MouseEvent("contextmenu"), [
    { label: "Fullscreen", action: selected },
  ]);
  document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  expect(document.querySelector('[role="menu"]')).toBeNull();
  menu.dispose();
});
