import {
  fetchCenterPointOutages,
  fetchFemaOpenShelters,
  fetchTranStarLaneClosures,
} from '../sources/operational';
import { fetchEmpower } from '../sources/empower';
import { buildDowntownHoustonRegistry } from '../sources/geography';
import { proveFreshWorkflow } from '../workflowProof';

const now = new Date();
const [outages, closures, shelters] = await Promise.all([
  fetchCenterPointOutages(),
  fetchTranStarLaneClosures(),
  fetchFemaOpenShelters(),
]);
const geography = buildDowntownHoustonRegistry(shelters, now);
const patientCounts = await fetchEmpower(geography.zones.flatMap((zone) => zone.zips));
const proof = proveFreshWorkflow({
  now,
  geography,
  events: [...outages, ...closures],
  patientCounts,
  providerFetchedAt: {
    centerpoint: now.toISOString(),
    'houston-transtar': now.toISOString(),
    fema: now.toISOString(),
    empower: now.toISOString(),
  },
});

console.log(
  JSON.stringify(
    {
      checkedAt: now.toISOString(),
      operatingArea: geography.operatingAreaName,
      counts: {
        outages: outages.length,
        roadClosures: closures.length,
        shelters: shelters.length,
        patientRows: patientCounts.length,
      },
      proof: {
        ready: proof.ready,
        blockingReasons: proof.blockingReasons,
        qualityIssues: proof.qualityIssues,
        isolatedZones: proof.results
          .filter((result) => result.isolated)
          .map((result) => result.zoneId),
      },
    },
    null,
    2,
  ),
);
