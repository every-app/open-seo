// daisyUI dropdowns stay open until focus leaves, so blur the trigger to
// close the menu before navigating or acting on a selection.
export function closeDropdown() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
