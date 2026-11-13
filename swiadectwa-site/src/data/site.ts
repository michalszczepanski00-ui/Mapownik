// Jedno źródło prawdy: dane firmy, nawigacja i teksty wspólne dla wielu stron.
export const site = {
  name: 'świadectwa.net',
  url: 'https://swiadectwa.net',
  email: 'biuro@swiadectwa.net',
  phone: '+48 694 460 538',
  phoneHref: '+48694460538',
  owner: 'Michał Szczepański',
  street: 'ul. Chopina 2A/D19',
  postal: '83-200',
  city: 'Starogard Gdański',
  nip: '592-213-55-15',
  regon: '222129970',
  since: 2010,
  tagline: 'Dokumentacja energetyczna budynków',
  description:
    'Projektowane charakterystyki energetyczne i świadectwa charakterystyki energetycznej dla biur projektowych, firm, deweloperów i zarządców.',
};

export const nav = [
  { href: '/projektowana-charakterystyka/', label: 'Charakterystyka', full: 'Projektowana charakterystyka' },
  { href: '/swiadectwa-energetyczne/', label: 'Świadectwa', full: 'Świadectwa energetyczne' },
  { href: '/dla-biur-projektowych/', label: 'Biura projektowe', full: 'Wsparcie biura projektowego' },
  { href: '/dla-deweloperow-i-zarzadcow/', label: 'Deweloperzy', full: 'Deweloperzy i zarządcy' },
  { href: '/o-firmie/', label: 'O firmie', full: 'O firmie' },
  { href: '/kontakt/', label: 'Kontakt', full: 'Kontakt' },
];

export const mailto = (subject: string, body = '') =>
  `mailto:${site.email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;

export const CTA = 'Wyślij dokumentację do wyceny';

export type Faq = { id: string; q: string; a: string };
export const faqAll: Record<string, Faq> = {
  remote: { id: 'remote', q: 'Czy projektowaną charakterystykę można przygotować zdalnie?', a: 'Tak. W większości przypadków opracowanie można przygotować na podstawie dokumentacji projektowej i informacji przesłanych e-mailem.' },
  stage: { id: 'stage', q: 'Na jakim etapie projektu najlepiej zlecić opracowanie?', a: 'Najlepiej na etapie koncepcji lub projektu architektoniczno-budowlanego. Wczesne przekazanie danych zmniejsza ryzyko późniejszych uzupełnień.' },
  halls: { id: 'halls', q: 'Czy wykonujecie opracowania dla hal i budynków przemysłowych?', a: 'Tak. Oferta obejmuje budynki wielorodzinne, usługowe, biurowe, hale, magazyny oraz obiekty techniczne i przemysłowe.' },
  packages: { id: 'packages', q: 'Czy można zlecić większy pakiet świadectw?', a: 'Tak. Obsługujemy pakiety świadectw dla deweloperów, zarządców i firm posiadających większą liczbę lokali lub budynków.' },
  incomplete: { id: 'incomplete', q: 'Co zrobić, jeżeli dokumentacja jest niekompletna?', a: 'Po wstępnej analizie wskazujemy brakujące dane. Dzięki temu klient wie, jakie informacje są potrzebne do przygotowania opracowania.' },
  area: { id: 'area', q: 'Czy wycena zależy od powierzchni budynku?', a: 'Powierzchnia jest jednym z czynników, ale znaczenie mają także typ budynku, zakres opracowania, kompletność dokumentacji i liczba obiektów.' },
  poland: { id: 'poland', q: 'Czy obsługujecie inwestycje z całej Polski?', a: 'Tak. Współpraca może odbywać się zdalnie, niezależnie od lokalizacji inwestycji lub budynku.' },
  regular: { id: 'regular', q: 'Czy możliwa jest stała współpraca z biurem projektowym?', a: 'Tak. Możliwa jest współpraca przy pojedynczych projektach oraz stałe wsparcie biura projektowego przy kolejnych inwestycjach.' },
  noprice: { id: 'noprice', q: 'Dlaczego nie ma cennika na stronie?', a: 'Zakres prac zależy od rodzaju budynku, celu opracowania i kompletności dokumentacji. Dlatego wycena jest przygotowywana indywidualnie.' },
};
export const pickFaq = (...ids: string[]) => ids.map((i) => faqAll[i]);
