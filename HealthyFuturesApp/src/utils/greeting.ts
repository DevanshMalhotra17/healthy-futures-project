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
