/**
 * 18.10 — jedna definicja liczników warstw.
 *
 * Wcześniej trzy miejsca liczyły to samo trzy razy po swojemu: plakietka na
 * szynie i podtytuł panelu liczyły nakładki włączone, a pasek stanu — wszystkie
 * widoczne warstwy (z podkładem) jako „gotowe/widoczne”, więc przy
 * niezaładowanym podkładzie pokazywał „0/1” obok „0/28 aktywnych”.
 *
 * - `active`  — nakładki (role = 'overlay') włączone przez użytkownika,
 * - `total`   — wszystkie nakładki katalogu,
 * - `loading` — widoczne warstwy (także podkład), które jeszcze się nie
 *               załadowały i nie zgłosiły błędu.
 */
export function summarizeLayers(layers) {
    let active = 0;
    let total = 0;
    let loading = 0;
    for (const layer of layers ?? []) {
        if (layer.role === 'overlay') {
            total++;
            if (layer.visible) active++;
        }
        if (layer.visible && layer.status !== 'ready' && layer.status !== 'error') loading++;
    }
    return { active, total, loading };
}
