export const EMPOWER_FEATURE_SERVER =
  'https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/arcgis/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer';

export interface EmpowerCount {
  zip: string;
  electricityDependentCount: number;
}

type ArcgisResponse = {
  features?: Array<{ attributes?: Record<string, unknown> }>;
};

const DEFAULT_LAYER_ID = '1';
const ZIP_FIELDS = ['ZIPCODE', 'ZIP', 'GEOID10', 'Zip_Code_Recode', 'Zip_Code', 'zip'];
const COUNT_FIELDS = [
  'TOTAL_MEDICARE_BENEFICIARIES',
  'ELECTRICITY_DEPENDENT_COUNT',
  'Power_Dependent_Devices_DME',
  'COUNT',
  'count',
];

function findField(attributes: Record<string, unknown>, candidates: string[]): unknown {
  const key = Object.keys(attributes).find((candidate) =>
    candidates.some((wanted) => candidate.toLowerCase() === wanted.toLowerCase()),
  );
  return key ? attributes[key] : undefined;
}

/** Normalize ArcGIS rows while tolerating the service's documented field-name variants. */
export function normalizeEmpower(payload: ArcgisResponse): EmpowerCount[] {
  return (payload.features ?? []).flatMap(({ attributes = {} }) => {
    const zip = String(findField(attributes, ZIP_FIELDS) ?? '').padStart(5, '0');
    const count = Number(findField(attributes, COUNT_FIELDS));
    return /^\d{5}$/.test(zip) && Number.isFinite(count)
      ? [{ zip, electricityDependentCount: Math.max(0, Math.round(count)) }]
      : [];
  });
}

export async function fetchEmpower(
  zips: string[],
  fetchImpl: typeof fetch = fetch,
  layerId = DEFAULT_LAYER_ID,
): Promise<EmpowerCount[]> {
  const params = new URLSearchParams({
    where: `Zip_Code_Recode IN (${zips.map((zip) => `'${zip}'`).join(',')})`,
    outFields: 'Zip_Code_Recode,Power_Dependent_Devices_DME',
    f: 'json',
  });
  const response = await fetchImpl(`${EMPOWER_FEATURE_SERVER}/${layerId}/query?${params}`);
  if (!response.ok) throw new Error(`emPOWER request failed: ${response.status}`);
  return normalizeEmpower((await response.json()) as ArcgisResponse);
}
