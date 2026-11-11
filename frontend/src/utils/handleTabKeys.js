export function handleTabKeys(event) {
  const { key, target, currentTarget } = event;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;

  const tabs = Array.from(currentTarget.querySelectorAll('[role="tab"]:not(:disabled)'));
  const current = tabs.indexOf(target);
  if (current < 0) return;

  event.preventDefault();
  const next = {
    ArrowLeft: (current - 1 + tabs.length) % tabs.length,
    ArrowRight: (current + 1) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  }[key];
  tabs[next].focus();
  tabs[next].click();
}
