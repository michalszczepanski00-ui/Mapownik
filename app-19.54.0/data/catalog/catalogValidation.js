import * as z from 'zod';
import { layerDefinitionSchema } from './layerDefinition.js';
const catalogEnvelopeSchema = z.object({
    catalogVersion: z.number().int().positive(),
    layers: z.array(z.unknown()),
});
function issueMessage(error) {
    return error.issues
        .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        return `${path}${issue.message}`;
    })
        .join('; ');
}
/**
 * Validate entries independently. A malformed layer is isolated and omitted;
 * it never prevents the remaining catalog from loading.
 */
export function validateDataCatalog(input) {
    const envelopeResult = catalogEnvelopeSchema.safeParse(input);
    if (!envelopeResult.success) {
        return {
            catalogVersion: 0,
            layers: [],
            issues: [{
                    index: null,
                    message: `Nieprawidłowy katalog: ${issueMessage(envelopeResult.error)}`,
                }],
        };
    }
    const layers = [];
    const issues = [];
    const ids = new Set();
    envelopeResult.data.layers.forEach((candidate, index) => {
        const result = layerDefinitionSchema.safeParse(candidate);
        const candidateId = (typeof candidate === 'object'
            && candidate !== null
            && 'id' in candidate
            && typeof candidate.id === 'string') ? candidate.id : undefined;
        if (!result.success) {
            issues.push({ index, id: candidateId, message: issueMessage(result.error) });
            return;
        }
        if (ids.has(result.data.id)) {
            issues.push({
                index,
                id: result.data.id,
                message: `Duplikat id warstwy: ${result.data.id}`,
            });
            return;
        }
        ids.add(result.data.id);
        layers.push(result.data);
    });
    return {
        catalogVersion: envelopeResult.data.catalogVersion,
        layers,
        issues,
    };
}
