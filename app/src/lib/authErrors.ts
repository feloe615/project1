export function authError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? '';
  if (/Invalid login/i.test(m)) return 'E-Mail oder Passwort ist falsch.';
  if (/Email not confirmed/i.test(m)) return 'Bitte bestätige zuerst deine E-Mail über den Link in deinem Postfach.';
  if (/already registered|already been registered/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.';
  if (/Password should|weak password/i.test(m)) return 'Das Passwort ist zu kurz oder zu einfach (mind. 8 Zeichen).';
  if (/rate limit|too many/i.test(m)) return 'Zu viele Versuche. Warte kurz und versuche es erneut.';
  if (/network|fetch/i.test(m)) return 'Keine Verbindung. Prüfe dein Internet und versuche es erneut.';
  return m || 'Das hat nicht geklappt. Bitte erneut versuchen.';
}
