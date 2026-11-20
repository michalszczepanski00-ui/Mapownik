import { t } from '../i18n/index.js';

// 18.0: komunikaty walidacji (po polsku, do użytkownika) pokazujemy wprost;
// błędy sieci i serwera zamieniamy na zdanie „co się stało i co zrobić”,
// a surowy tekst chowamy pod „Szczegóły techniczne”.
const NETWORK = /failed to fetch|networkerror|load failed|network request failed|ERR_/i;
const TECHNICAL = /HTTP \d+|unexpected token|json|abort|timeout|timed out|upstream|curl|ECONN|CONNECT|tunnel|response \d{3}|^[A-Za-z]*Error\b/i;
/**
 * @param {unknown} message treść błędu z TerrainProfileManager
 * @returns {{text: string, details: string|null}}
 */
export function describeTerrainError(message) {
  const raw = String(message ?? '');
  if (NETWORK.test(raw)) return { text: t('error.network'), details: raw };
  if (!TECHNICAL.test(raw)) return { text: raw, details: null };
  // „Nie udało się pobrać wysokości NMT: GUGiK NMT HTTP 0: …” — polski początek
  // zostaje (mówi, CO się nie udało), techniczny ogon idzie do szczegółów.
  const head = raw.split(':')[0].trim();
  const human = head !== raw && head.length > 12 && /[ąćęłńóśźż]/i.test(head);
  return { text: human ? `${head}. ${t('error.tryLater')}` : t('error.terrain'), details: raw };
}
