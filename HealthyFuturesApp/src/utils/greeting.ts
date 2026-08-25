export function greetingFor(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function firstNameOf(fullName: string | null): string {
  if (!fullName) return "there";
  return fullName.trim().split(/\s+/)[0] || "there";
}

// Students address their coach formally, so a coach is always "Coach <first name>"
// rather than a bare name. Tolerates a name that already carries the title.
export function coachTitle(fullName: string | null | undefined): string {
  const name = fullName?.trim();
  if (!name) return "Coach";
  if (/^coach\b/i.test(name)) return name;
  return `Coach ${name.split(/\s+/)[0]}`;
}
